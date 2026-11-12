"use server";

import { revalidatePath } from "next/cache";
import type { ServiceRequestStatus } from "@/generated/prisma";
import { customerVisibleStatus, MIN_REASON_LENGTH } from "@/lib/domain/state-machine";
import { canApplyRequestAction, requestTransitions, type RequestAction } from "@/lib/domain/request-state-machine";
import { requestStatusLabel } from "@/lib/ui/status";
import { actionError, actionOk, StaleStateError, type ActionResult } from "@/lib/server/action-result";
import { audit } from "@/lib/server/audit";
import { requireCustomerMembership, requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { sendLocalNotification } from "@/lib/providers/notifications";

/**
 * Ciclo de vida de solicitudes de servicio (ADR-035).
 * Cada accion valida contra `request-state-machine` y repite la condicion de
 * estado en el WHERE del update: si otro usuario cambio la solicitud entre la
 * lectura y la escritura, el update afecta 0 filas y se informa el conflicto.
 */

const REQUEST_OPERATIONS_ROLES = ["OPERATIONS_MANAGER", "DISPATCHER", "TENANT_OWNER"] as const;

function readReason(formData: FormData, field = "reason") {
  return String(formData.get(field) ?? "").trim().slice(0, 1000);
}

function staleMessage(status: ServiceRequestStatus | undefined) {
  return status
    ? `La solicitud cambio a "${requestStatusLabel[status]}" mientras trabajaba. Revise su estado actual.`
    : "La solicitud cambio mientras trabajaba. Recargue la pagina.";
}

function revalidateRequestViews(tenantSlug: string) {
  revalidatePath(`/t/${tenantSlug}`, "layout");
  revalidatePath(`/t/${tenantSlug}/requests`);
  revalidatePath(`/t/${tenantSlug}/portal`);
}

/** Convierte una solicitud en viaje. */
export async function confirmRequestAsTripAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...REQUEST_OPERATIONS_ROLES]);
  const requestId = String(formData.get("requestId") ?? "");
  const db = getDb();
  const request = await db.serviceRequest.findFirst({
    where: { id: requestId, tenantId: tenant.id },
    include: { trip: true, customerAccount: true, serviceType: true },
  });
  if (!request) return actionError("La solicitud no existe o no pertenece a esta empresa.");
  if (request.trip) return actionError(`La solicitud ya fue convertida en el viaje ${request.trip.reference}.`);
  if (!canApplyRequestAction(request.status, "convert")) {
    return actionError(`No se puede convertir una solicitud en estado "${requestStatusLabel[request.status]}".`);
  }

  let trip;
  try {
    trip = await db.$transaction(async (tx) => {
      // Bloqueo optimista: solo convierte si sigue en un estado convertible.
      const claimed = await tx.serviceRequest.updateMany({
        where: { id: request.id, tenantId: tenant.id, status: { in: [...requestTransitions.convert.from] } },
        data: { status: "CONVERTED", statusReason: null },
      });
      if (claimed.count === 0) throw new StaleStateError();

      const count = await tx.trip.count({ where: { tenantId: tenant.id } });
      return tx.trip.create({
        data: {
          tenantId: tenant.id,
          customerAccountId: request.customerAccountId,
          serviceRequestId: request.id,
          serviceTypeId: request.serviceTypeId,
          reference: `${tenant.slug.toUpperCase()}-TR-${String(count + 1).padStart(4, "0")}`,
          status: "CONFIRMED",
          origin: request.origin,
          destination: request.destination,
          scheduledAt: request.requestedDate,
          eta: new Date(request.requestedDate.getTime() + 4 * 60 * 60 * 1000),
          routePoints: [
            { label: request.origin, lat: 9.36, lng: -79.88 },
            { label: "Las Cumbres", lat: 9.09, lng: -79.54 },
            { label: request.destination, lat: 8.95, lng: -79.56 },
          ],
          customerVisibleStatus: customerVisibleStatus.CONFIRMED,
          events: {
            create: {
              tenantId: tenant.id,
              actorId: user.id,
              toStatus: "CONFIRMED",
              note: "Solicitud confirmada y convertida en viaje.",
              visibleToCustomer: true,
            },
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof StaleStateError) {
      const current = await db.serviceRequest.findFirst({ where: { id: request.id, tenantId: tenant.id }, select: { status: true } });
      return actionError(staleMessage(current?.status));
    }
    if (isUniqueViolation(error)) {
      return actionError("Otro usuario registro un viaje al mismo tiempo. Intente de nuevo.");
    }
    throw error;
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "service_request.convert_to_trip",
    entity: "Trip",
    entityId: trip.id,
    after: trip,
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: request.customerAccountId,
    channel: "EMAIL",
    recipient: tenant.branding?.supportMail ?? "operaciones@nci.local",
    subject: `Viaje ${trip.reference} creado`,
    body: `La solicitud ${request.reference} fue confirmada y convertida en viaje.`,
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: request.customerAccountId,
    channel: "PORTAL",
    recipient: request.customerAccount.name,
    subject: `Servicio confirmado ${trip.reference}`,
    body: `Tu servicio fue confirmado para ${trip.origin} -> ${trip.destination}.`,
  });
  revalidateRequestViews(tenantSlug);
  return actionOk(`Solicitud convertida en el viaje ${trip.reference}.`);
}

/** Operaciones: pedir informacion al cliente o rechazar la solicitud. */
export async function reviewRequestAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...REQUEST_OPERATIONS_ROLES]);
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "request_info" && decision !== "reject") return actionError("Seleccione una accion valida.");
  const reason = readReason(formData);
  if (reason.length < MIN_REASON_LENGTH) {
    return actionError(
      decision === "reject"
        ? "Escriba el motivo del rechazo (el cliente lo vera)."
        : "Escriba que informacion necesita del cliente.",
    );
  }

  const result = await applyRequestTransition({
    tenantId: tenant.id,
    requestId: String(formData.get("requestId") ?? ""),
    action: decision,
    reason,
  });
  if (result.status === "error") return result;

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: decision === "reject" ? "service_request.reject" : "service_request.request_info",
    entity: "ServiceRequest",
    entityId: result.request.id,
    before: { status: result.request.status },
    after: { status: requestTransitions[decision].to, reason },
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: result.request.customerAccountId,
    channel: "PORTAL",
    recipient: "customer",
    subject:
      decision === "reject"
        ? `Solicitud ${result.request.reference} rechazada`
        : `Solicitud ${result.request.reference}: necesitamos informacion`,
    body: reason,
  });
  revalidateRequestViews(tenantSlug);
  return actionOk(
    decision === "reject"
      ? `Solicitud ${result.request.reference} rechazada.`
      : `Se pidio informacion al cliente para ${result.request.reference}.`,
  );
}

/** Cliente: cancelar, enviar borrador o responder a un pedido de informacion. */
export async function customerRequestAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, customerAccount } = await requireCustomerMembership(tenantSlug, ["CUSTOMER_ADMIN"]);
  const action = String(formData.get("decision") ?? "") as RequestAction;
  if (!["cancel", "submit_draft", "provide_info"].includes(action)) return actionError("Seleccione una accion valida.");
  const reason = readReason(formData);
  if (action === "provide_info" && reason.length < MIN_REASON_LENGTH) {
    return actionError("Escriba la informacion solicitada por operaciones.");
  }

  const result = await applyRequestTransition({
    tenantId: tenant.id,
    customerAccountId: customerAccount.id,
    requestId: String(formData.get("requestId") ?? ""),
    action,
    reason: reason || null,
  });
  if (result.status === "error") return result;

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: "CUSTOMER_ADMIN",
    action: `service_request.customer_${action}`,
    entity: "ServiceRequest",
    entityId: result.request.id,
    before: { status: result.request.status },
    after: { status: requestTransitions[action].to, reason: reason || undefined },
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: customerAccount.id,
    channel: "PORTAL",
    recipient: "operations",
    subject: `Solicitud ${result.request.reference}: ${requestStatusLabel[requestTransitions[action].to].toLowerCase()}`,
    body: reason || `${customerAccount.name} actualizo la solicitud ${result.request.reference}.`,
  });
  revalidateRequestViews(tenantSlug);
  const messages: Record<string, string> = {
    cancel: `Solicitud ${result.request.reference} cancelada.`,
    submit_draft: `Solicitud ${result.request.reference} enviada a operaciones.`,
    provide_info: `Informacion enviada. Operaciones revisara ${result.request.reference}.`,
  };
  return actionOk(messages[action]);
}

async function applyRequestTransition(input: {
  tenantId: string;
  customerAccountId?: string;
  requestId: string;
  action: RequestAction;
  reason: string | null;
}) {
  const db = getDb();
  const scope = {
    id: input.requestId,
    tenantId: input.tenantId,
    ...(input.customerAccountId ? { customerAccountId: input.customerAccountId } : {}),
  };
  const request = await db.serviceRequest.findFirst({ where: scope });
  if (!request) return actionError("La solicitud no existe o no tiene acceso a ella.") as Extract<ActionResult, { status: "error" }>;
  if (!canApplyRequestAction(request.status, input.action)) {
    return actionError(
      `La accion no aplica a una solicitud en estado "${requestStatusLabel[request.status]}".`,
    ) as Extract<ActionResult, { status: "error" }>;
  }

  const transition = requestTransitions[input.action];
  const customerReply =
    input.action === "provide_info" && input.reason
      ? [request.customerNotes, `[Respuesta del cliente ${new Date().toISOString().slice(0, 10)}] ${input.reason}`]
          .filter(Boolean)
          .join("\n")
      : undefined;

  const updated = await db.serviceRequest.updateMany({
    where: { ...scope, status: { in: [...transition.from] } },
    data: {
      status: transition.to,
      // El cliente ve el motivo del rechazo, la pregunta de operaciones o su propio motivo de cancelacion.
      statusReason: input.action === "provide_info" || input.action === "submit_draft" ? null : input.reason,
      ...(customerReply ? { customerNotes: customerReply } : {}),
    },
  });
  if (updated.count === 0) {
    const current = await db.serviceRequest.findFirst({ where: scope, select: { status: true } });
    return actionError(staleMessage(current?.status)) as Extract<ActionResult, { status: "error" }>;
  }
  return { status: "success" as const, request };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}
