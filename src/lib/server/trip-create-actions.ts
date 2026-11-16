"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { buildCargoDetails, newTripInputSchema } from "@/lib/catalog/schemas";
import { parseForm } from "@/lib/catalog/form";
import { isInPast, parseTenantLocal } from "@/lib/datetime";
import { actionError, type ActionResult } from "@/lib/server/action-result";
import { audit } from "@/lib/server/audit";
import { requireTenantPermission } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { isUniqueViolation } from "@/lib/server/db-errors";
import { sendLocalNotification } from "@/lib/providers/notifications";
import { createTripFromRequest, lockTenantForCreate, nextReference } from "@/lib/server/trip-creation";

/**
 * "Nuevo viaje" desde operaciones (ADR-038): una solicitud ya CONVERTED (con el canal de origen) y su
 * viaje CONFIRMED, creados en UNA transaccion. La asignacion de unidad y conductor sigue haciendose con
 * la tarjeta de `/trips`, que conserva todas sus guardas (cumplimiento, mantenimiento, conflictos).
 */

const MAX_ATTEMPTS = 3;

/** Nombres del formulario → ruta del esquema (el contenedor es opcional y va en su propia seccion). */
const CONTAINER_FIELDS = {
  containerNumber: "container.number",
  containerSize: "container.size",
  containerType: "container.type",
  shippingLine: "container.shippingLine",
  terminal: "container.terminal",
  sealNumber: "container.sealNumber",
  loadStatus: "container.loadStatus",
  emptyReturnRequired: "container.emptyReturnRequired",
  bookingReference: "container.bookingReference",
} as const;

function tripsPath(slug: string, reference: string, tripId: string) {
  return `/t/${slug}/trips?creado=${encodeURIComponent(reference)}#trip-${tripId}`;
}

export async function createTripByOperationsAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.trips.create");

  const parsed = parseForm(newTripInputSchema, formData, {
    nested: CONTAINER_FIELDS,
    booleans: ["emptyReturnRequired"],
  });
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const input = parsed.data;

  const fail = (message: string, field?: string) =>
    actionError(message, field ? { fieldErrors: { [field]: message } } : undefined);

  const scheduledAt = parseTenantLocal(input.scheduledAt);
  if (!scheduledAt) return fail("La fecha y hora de recogida no son válidas.", "scheduledAt");
  if (isInPast(scheduledAt)) return fail("La fecha y hora de recogida ya pasó. Elija una fecha futura.", "scheduledAt");

  const db = getDb();
  // Cada id que llega del navegador se re-verifica contra ESTE tenant (las FK de Prisma solo apuntan a id).
  const [customer, serviceType] = await Promise.all([
    db.customerAccount.findFirst({
      where: { id: input.customerAccountId, tenantId: tenant.id, active: true },
      select: { id: true, name: true },
    }),
    db.serviceType.findFirst({
      where: { id: input.serviceTypeId, tenantId: tenant.id, active: true },
      select: { id: true, name: true },
    }),
  ]);
  if (!customer) return fail("El cliente no existe o está inactivo. Elija otro.", "customerAccountId");
  if (!serviceType) return fail("El tipo de servicio no existe o está inactivo. Elija otro.", "serviceTypeId");

  // Idempotencia: el mismo formulario enviado dos veces no crea dos viajes.
  const existing = await db.serviceRequest.findFirst({
    where: { tenantId: tenant.id, clientRequestKey: input.clientRequestKey },
    select: { trip: { select: { id: true, reference: true } } },
  });
  if (existing?.trip) redirect(tripsPath(tenantSlug, existing.trip.reference, existing.trip.id));

  const cargoDetails = buildCargoDetails(input);
  let created: { requestId: string; requestReference: string; tripId: string; tripReference: string } | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && !created; attempt += 1) {
    try {
      created = await db.$transaction(
        async (tx) => {
          await lockTenantForCreate(tx, tenant.id);
          const requestReference = await nextReference(tx, { tenant, kind: "SR" });
          const request = await tx.serviceRequest.create({
            data: {
              tenantId: tenant.id,
              customerAccountId: customer.id,
              serviceTypeId: serviceType.id,
              reference: requestReference,
              status: "CONVERTED",
              origin: input.origin,
              destination: input.destination,
              requestedDate: scheduledAt,
              priority: input.priority,
              source: input.source,
              clientRequestKey: input.clientRequestKey,
              cargoDetails,
              internalNotes: input.notes ?? null,
              createdById: user.id,
            },
          });
          const trip = await createTripFromRequest(tx, {
            tenant,
            actorId: user.id,
            request,
            scheduledAt,
            initialNote: "Servicio programado por su transportista.",
          });
          return { requestId: request.id, requestReference, tripId: trip.id, tripReference: trip.reference };
        },
        { timeout: 15_000, maxWait: 5_000 },
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Doble envio concurrente: el otro ya creo el viaje con esta clave.
      const winner = await db.serviceRequest.findFirst({
        where: { tenantId: tenant.id, clientRequestKey: input.clientRequestKey },
        select: { trip: { select: { id: true, reference: true } } },
      });
      if (winner?.trip) redirect(tripsPath(tenantSlug, winner.trip.reference, winner.trip.id));
      // Colision de referencia con otra creacion simultanea: se reintenta con la referencia siguiente.
    }
  }
  if (!created) return actionError("Otro usuario registró un viaje al mismo tiempo. Intente de nuevo.");

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "service_request.create",
    entity: "ServiceRequest",
    entityId: created.requestId,
    after: { reference: created.requestReference, source: input.source, status: "CONVERTED", customerAccountId: customer.id },
  });
  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "trip.create",
    entity: "Trip",
    entityId: created.tripId,
    after: { reference: created.tripReference, source: input.source, status: "CONFIRMED", scheduledAt },
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: customer.id,
    channel: "PORTAL",
    recipient: customer.name,
    subject: `Servicio programado ${created.tripReference}`,
    body: `Su transportista programó un servicio de ${input.origin} a ${input.destination}.`,
  });

  revalidatePath(`/t/${tenantSlug}`, "layout");
  redirect(tripsPath(tenantSlug, created.tripReference, created.tripId));
}
