"use server";

import { safeNextPath } from "@/lib/server/next-path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TenantRole, Trip, TripStatus } from "@/generated/prisma";
import {
  ASSIGNABLE_TRIP_STATUSES,
  EVIDENCE_SUBMITTABLE_STATUSES,
  MIN_REASON_LENGTH,
  TERMINAL_TRIP_STATUSES,
  canCloseTrip,
  canTransition,
  customerVisibleStatus,
  requiresDedicatedFlow,
  transitionRequiresReason,
} from "@/lib/domain/state-machine";
import {
  EVIDENCE_DOCUMENT_VISIBILITY,
  POD_MIME_TYPE,
  POD_OBJECT_KEY_SEGMENT,
  evidenceDocumentIdsToPublish,
} from "@/lib/domain/proof-evidence";
import { parseTenantLocal } from "@/lib/datetime";
import { tripStatusLabel } from "@/lib/ui/status";
import { actionError, actionOk, StaleStateError, type ActionResult } from "@/lib/server/action-result";
import { blockingDocumentsNow } from "@/lib/compliance/eligibility";
import { hasActiveException } from "@/lib/compliance/exceptions";
import { audit } from "@/lib/server/audit";
import {
  requireCustomerMembership,
  requirePlatformRole,
  requireTenantMembership,
  requireTenantRole,
  requiresMfaForRole,
  signIn,
  signOut,
} from "@/lib/server/auth";
import { userHasMfaActive } from "@/lib/server/mfa";
import { tenantHomePath } from "@/lib/server/tenant-permissions";
import { getDb } from "@/lib/server/db";
import { isUniqueViolation } from "@/lib/server/db-errors";
import { lockTenantForCreate, nextReference } from "@/lib/server/trip-creation";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { logger } from "@/lib/server/logger";
import { sendLocalNotification } from "@/lib/providers/notifications";
import { generateProofOfDeliveryPdf } from "@/lib/server/pod-pdf";
import {
  getStorageBucket,
  isValidSignaturePng,
  uploadBuffer,
  UploadRejectedError,
  validateUploadedFile,
} from "@/lib/server/storage";
import { processUploadThroughPipeline } from "@/lib/server/file-pipeline";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const LOGIN_DELAY_MS = 250;

async function constantDelay() {
  await new Promise((resolve) => setTimeout(resolve, LOGIN_DELAY_MS));
}

export async function loginAction(_: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    await constantDelay();
    return { message: "Ingresa correo y contrasena validos." };
  }

  const email = parsed.data.email.toLowerCase();
  const rate = await enforceRateLimit({
    scope: "auth.login",
    key: email,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    logger.warn("login rate limited", { email });
    await constantDelay();
    return { message: "Demasiados intentos. Reintente en unos segundos." };
  }

  const result = await signIn(email, parsed.data.password);
  if (!result.ok) {
    await constantDelay();
    return { message: result.message };
  }

  if (result.mfaRequired) {
    redirect("/mfa/verify");
  }

  const db = getDb();
  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: {
      tenantMemberships: { where: { active: true }, include: { tenant: true } },
      customerMemberships: {
        where: { active: true },
        include: { customerAccount: { include: { tenant: true } } },
      },
    },
  });

  if (user) {
    const needsMfa = await requiresMfaForRole(user.id);
    const hasMfa = await userHasMfaActive(user.id);
    if (needsMfa && !hasMfa) {
      redirect("/account/security/mfa/setup");
    }
  }

  // Volver a la invitación que la persona estaba aceptando (solo esa ruta exacta; ver next-path.ts).
  const next = safeNextPath(formData.get("next"));
  if (next) redirect(next);

  if (user?.platformRole) redirect("/platform");
  const firstMembership = user?.tenantMemberships[0];
  // Cada rol aterriza en su inicio: el conductor en su app, no en el centro de control.
  if (firstMembership) redirect(tenantHomePath(firstMembership.tenant.slug, firstMembership.role));

  const firstCustomerTenant = user?.customerMemberships[0]?.customerAccount.tenant.slug;
  redirect(firstCustomerTenant ? `/t/${firstCustomerTenant}/portal` : "/login");
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}

const tenantSchema = z.object({
  name: z.string().min(2),
  legalName: z.string().min(2),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/),
  planCode: z.enum(["DEMO", "STARTER", "PROFESSIONAL", "ENTERPRISE"]),
});

export async function createTenantAction(formData: FormData) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);
  const parsed = tenantSchema.parse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    slug: formData.get("slug"),
    planCode: formData.get("planCode"),
  });

  const db = getDb();
  const plan = await db.tenantPlan.findUniqueOrThrow({ where: { code: parsed.planCode } });
  const tenant = await db.tenant.create({
    data: {
      name: parsed.name,
      legalName: parsed.legalName,
      slug: parsed.slug,
      planId: plan.id,
      status: "ACTIVE",
      subscriptionStatus: "TRIAL",
      activatedAt: new Date(),
      branding: { create: { wordmark: parsed.name } },
      settings: { create: {} },
      features: {
        create: [
          { key: "portal", enabled: plan.portalEnabled },
          { key: "driver_app", enabled: plan.driverAppEnabled },
          { key: "notifications", enabled: plan.notificationsEnabled },
          { key: "reports", enabled: plan.reportsEnabled },
          { key: "integrations", enabled: plan.integrationsEnabled },
        ],
      },
    },
  });

  await audit({
    actorId: user.id,
    actorRole: user.platformRole,
    action: "tenant.create",
    entity: "Tenant",
    entityId: tenant.id,
    after: parsed,
  });
  revalidatePath("/platform");
}

export async function startSupportModeAction(formData: FormData) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const tenantId = String(formData.get("tenantId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!tenantId || reason.length < 8) return;

  const db = getDb();
  const support = await db.tenantSupportSession.create({
    data: { tenantId, userId: user.id, reason },
    include: { tenant: true },
  });
  await audit({
    tenantId,
    actorId: user.id,
    actorRole: user.platformRole,
    supportSessionId: support.id,
    action: "support.enter",
    entity: "Tenant",
    entityId: tenantId,
    after: { reason },
  });
  redirect(`/t/${support.tenant.slug}`);
}

/**
 * Fecha requerida del portal (`datetime-local`): hora de pared de Panamá, no la zona del proceso
 * (ADR-038). Acepta también solo la fecha (`YYYY-MM-DD`), como medianoche de Panamá: era válida con el
 * `min(10)` anterior y así no se rechaza lo que antes se aceptaba.
 */
function parseRequestedDate(value: string): Date | null {
  return parseTenantLocal(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value);
}

/** Intentos para crear la solicitud si otra alta sin bloqueo ocupa la misma referencia (P2002). */
const SERVICE_REQUEST_CREATE_ATTEMPTS = 3;

const requestSchema = z.object({
  serviceTypeId: z.string().uuid(),
  origin: z.string().min(3),
  destination: z.string().min(3),
  // Una fecha inválida falla la validación como cualquier otro campo (antes llegaba a Prisma como
  // `Invalid Date` y terminaba en un error 500).
  requestedDate: z
    .string()
    .trim()
    .min(10)
    .transform((value, ctx) => {
      const date = parseRequestedDate(value);
      if (!date) {
        ctx.addIssue({ code: "custom", message: "La fecha requerida no es válida." });
        return z.NEVER;
      }
      return date;
    }),
  priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
  contactName: z.string().min(2),
  contactPhone: z.string().min(3),
  containerNumber: z.string().min(4),
  containerSize: z.string().min(2),
  containerType: z.string().min(2),
  shippingLine: z.string().min(2),
  terminal: z.string().min(2),
  sealNumber: z.string().min(2),
  loadStatus: z.enum(["LOADED", "EMPTY"]),
  emptyReturnRequired: z.enum(["YES", "NO"]),
  bookingReference: z.string().min(2),
  intent: z.enum(["DRAFT", "REQUESTED"]).default("REQUESTED"),
  idempotencyKey: z.string().min(12).optional(),
  customerNotes: z.string().optional(),
});

export async function createServiceRequestAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, customerAccount } = await requireCustomerMembership(tenantSlug, ["CUSTOMER_ADMIN"]);
  const parsed = requestSchema.parse({
    serviceTypeId: formData.get("serviceTypeId"),
    origin: formData.get("origin"),
    destination: formData.get("destination"),
    requestedDate: formData.get("requestedDate"),
    priority: formData.get("priority") ?? "NORMAL",
    contactName: formData.get("contactName"),
    contactPhone: formData.get("contactPhone"),
    containerNumber: formData.get("containerNumber"),
    containerSize: formData.get("containerSize"),
    containerType: formData.get("containerType"),
    shippingLine: formData.get("shippingLine"),
    terminal: formData.get("terminal"),
    sealNumber: formData.get("sealNumber"),
    loadStatus: formData.get("loadStatus"),
    emptyReturnRequired: formData.get("emptyReturnRequired"),
    bookingReference: formData.get("bookingReference"),
    intent: formData.get("intent") ?? "REQUESTED",
    idempotencyKey: formData.get("idempotencyKey")?.toString(),
    customerNotes: formData.get("customerNotes")?.toString(),
  });
  const clientRequestKey = parsed.idempotencyKey ?? randomUUID();

  const db = getDb();
  // El FK de ServiceRequest solo apunta a service_types.id: un UUID ajeno pasaria.
  // El tipo de servicio debe ser un tipo activo de ESTE tenant.
  const serviceType = await db.serviceType.findFirst({
    where: { id: parsed.serviceTypeId, tenantId: tenant.id, active: true },
    select: { id: true },
  });
  if (!serviceType) throw new Error("Tipo de servicio invalido para esta empresa.");

  const existing = await db.serviceRequest.findFirst({
    where: {
      tenantId: tenant.id,
      customerAccountId: customerAccount.id,
      clientRequestKey,
    },
  });
  if (existing) {
    revalidatePath(`/t/${tenantSlug}/portal`);
    redirect(`/t/${tenantSlug}/portal`);
  }

  // La referencia sale del MAXIMO del sufijo bajo el bloqueo del tenant (ADR-038), no de `count()+1`:
  // sin carreras entre altas simultaneas y sin chocar tras un borrado. Si aun asi otra alta sin bloqueo
  // ocupa la misma referencia (P2002), se reintenta TODA la transaccion con una referencia nueva.
  const createRequest = () =>
    db.$transaction(
      async (tx) => {
        await lockTenantForCreate(tx, tenant.id);
        const reference = await nextReference(tx, { tenant, kind: "SR" });
        return tx.serviceRequest.create({
          data: {
            tenantId: tenant.id,
            customerAccountId: customerAccount.id,
            serviceTypeId: serviceType.id,
            reference,
            status: parsed.intent,
            origin: parsed.origin,
            destination: parsed.destination,
            requestedDate: parsed.requestedDate,
            priority: parsed.priority,
            clientRequestKey,
            cargoDetails: {
              contact: {
                name: parsed.contactName,
                phone: parsed.contactPhone,
              },
              container: {
                number: parsed.containerNumber,
                size: parsed.containerSize,
                type: parsed.containerType,
                shippingLine: parsed.shippingLine,
                terminal: parsed.terminal,
                sealNumber: parsed.sealNumber,
                loadStatus: parsed.loadStatus,
                emptyReturnRequired: parsed.emptyReturnRequired === "YES",
                bookingReference: parsed.bookingReference,
              },
            },
            customerNotes: parsed.customerNotes,
            createdById: user.id,
          },
        });
      },
      // El bloqueo del tenant puede esperar a otra alta en curso (p. ej. una importacion).
      { timeout: 10_000, maxWait: 5_000 },
    );
  let request: Awaited<ReturnType<typeof createRequest>>;
  for (let attempt = 1; ; attempt += 1) {
    try {
      request = await createRequest();
      break;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Doble envio con la misma clave de idempotencia (dos envios simultaneos pasaron el pre-chequeo):
      // la solicitud ya existe, no es un error. Se consulta ante CUALQUIER P2002, sin depender de que el
      // motor informe cual restriccion fallo (`meta.target`). Solo cuenta si es de ESTE cliente: la clave es
      // unica por empresa y una clave ajena no debe fingir exito sin haber creado nada.
      const duplicate = await db.serviceRequest.findFirst({
        where: { tenantId: tenant.id, customerAccountId: customerAccount.id, clientRequestKey },
        select: { id: true },
      });
      if (duplicate) {
        revalidatePath(`/t/${tenantSlug}/portal`);
        redirect(`/t/${tenantSlug}/portal`);
      }
      // La clave ya es de otro cliente: reintentar nunca lo resuelve. Con la referencia ocupada si: la
      // proxima vuelta calcula una nueva (el bloqueo del tenant ya la hace casi imposible).
      if (isUniqueViolation(error, "clientRequestKey") || attempt >= SERVICE_REQUEST_CREATE_ATTEMPTS) throw error;
    }
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: "CUSTOMER_ADMIN",
    action: "service_request.create",
    entity: "ServiceRequest",
    entityId: request.id,
    after: request,
  });

  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: customerAccount.id,
    channel: "PORTAL",
    recipient: "operations",
    subject: `Nueva solicitud ${request.reference}`,
    body: `${customerAccount.name} solicito transporte de ${request.origin} a ${request.destination}.`,
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: customerAccount.id,
    channel: "EMAIL",
    recipient: tenant.branding?.supportMail ?? "operaciones@nci.local",
    subject: `Solicitud ${request.reference} enviada`,
    body: `${customerAccount.name} envio una solicitud ${request.priority} para ${request.origin} -> ${request.destination}.`,
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: customerAccount.id,
    channel: "MOCK_WHATSAPP",
    recipient: parsed.contactPhone,
    subject: `Solicitud ${request.reference}`,
    body: `Recibimos tu solicitud ${request.reference}.`,
  });

  revalidatePath(`/t/${tenantSlug}/portal`);
  redirect(`/t/${tenantSlug}/portal`);
}

/** Ventana de conflicto de agenda por recurso alrededor de la hora programada. */
const ASSIGNMENT_CONFLICT_WINDOW_MS = 6 * 60 * 60 * 1000;

const assignmentSchema = z.object({
  tripId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  // El select de equipo puede llegar vacio ("Sin equipo") o ausente: ambos significan "sin equipo".
  equipmentId: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().uuid().optional()),
  driverId: z.string().uuid(),
  // Opcional: si falta se conserva la hora del viaje (el formulario ya no la reenvia; antes se
  // reinterpretaba en la zona del servidor y desplazaba la hora en cada reasignacion).
  scheduledAt: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().min(10).optional()),
  notes: z.string().optional(),
});

export async function assignTripAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["DISPATCHER", "TENANT_OWNER", "OPERATIONS_MANAGER"]);
  const parsedInput = assignmentSchema.safeParse({
    tripId: formData.get("tripId"),
    vehicleId: formData.get("vehicleId"),
    equipmentId: formData.get("equipmentId"),
    driverId: formData.get("driverId"),
    scheduledAt: formData.get("scheduledAt"),
    notes: formData.get("notes")?.toString(),
  });
  if (!parsedInput.success) return actionError("Seleccione vehiculo y conductor (y equipo, si el servicio lo requiere) antes de asignar.");
  const parsed = parsedInput.data;
  const db = getDb();
  const trip = await db.trip.findFirst({
    where: { id: parsed.tripId, tenantId: tenant.id },
    include: { serviceType: true },
  });
  if (!trip) return actionError("El viaje no existe o no pertenece a esta empresa.");

  if (!ASSIGNABLE_TRIP_STATUSES.includes(trip.status)) {
    return actionError(`El viaje ya no admite asignacion: esta en "${tripStatusLabel[trip.status]}".`);
  }

  // Equipo: solo se exige si el tipo de servicio lo requiere. NUNCA se consulta con un id indefinido:
  // Prisma descarta `undefined` del where y devolveria el primer equipo del tenant.
  if (trip.serviceType.requiresEquipment && !parsed.equipmentId) {
    return actionError("Seleccione el equipo: este servicio lo requiere.");
  }
  const [vehicle, equipment, driver] = await Promise.all([
    db.vehicle.findFirst({ where: { id: parsed.vehicleId, tenantId: tenant.id } }),
    parsed.equipmentId
      ? db.equipment.findFirst({ where: { id: parsed.equipmentId, tenantId: tenant.id } })
      : Promise.resolve(null),
    db.driver.findFirst({ where: { id: parsed.driverId, tenantId: tenant.id } }),
  ]);
  if (!vehicle || !driver || (parsed.equipmentId && !equipment)) {
    return actionError("Vehiculo, equipo o conductor no encontrado en esta empresa.");
  }
  const unavailable = [
    vehicle.status !== "AVAILABLE" ? `vehiculo ${vehicle.code}` : null,
    equipment && equipment.status !== "AVAILABLE" ? `equipo ${equipment.code}` : null,
    driver.status !== "AVAILABLE" ? `conductor ${driver.code}` : null,
  ].filter(Boolean);
  if (unavailable.length > 0) return actionError(`No disponible: ${unavailable.join(", ")}.`);

  const authorizations = Array.isArray(driver.authorizations) ? driver.authorizations.map(String) : [];
  if (authorizations.length > 0 && !authorizations.includes(trip.serviceType.code)) {
    return actionError(`El conductor ${driver.code} no esta autorizado para el servicio "${trip.serviceType.name}".`);
  }

  const now = new Date();
  const assetKeys = [
    `VEHICULO:${vehicle.code}`,
    ...(equipment ? [`EQUIPO:${equipment.code}`] : []),
    `CONDUCTOR:${driver.code}`,
  ];
  const exceptionCandidates = await db.complianceException.findMany({
    where: {
      tenantId: tenant.id,
      revokedAt: null,
      OR: [
        { scope: "TRIP", targetKey: trip.id },
        { scope: "ASSET", targetKey: { in: assetKeys } },
      ],
    },
    select: { gate: true, scope: true, targetKey: true, expiresAt: true, revokedAt: true },
  });
  const targetKeys = { tripId: trip.id, assetKeys };
  const maintenanceExempt = hasActiveException(exceptionCandidates, "MAINTENANCE", targetKeys, now);
  const complianceExempt = hasActiveException(exceptionCandidates, "COMPLIANCE", targetKeys, now);

  // Guarda determinista: un activo con orden abierta bloqueante no puede asignarse.
  if (!maintenanceExempt) {
    const blockingOrders = await db.maintenanceOrder.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["PROGRAMADO", "EN_PROGRESO"] },
        blocksAsset: true,
        OR: [
          { assetType: "VEHICULO", assetCode: vehicle.code },
          ...(equipment ? [{ assetType: "EQUIPO" as const, assetCode: equipment.code }] : []),
        ],
      },
      select: { assetCode: true },
    });
    if (blockingOrders.length > 0) {
      const codes = [...new Set(blockingOrders.map((order) => order.assetCode))].join(", ");
      return actionError(
        `Mantenimiento bloqueante abierto para ${codes}. Cierre la orden o registre una excepcion aprobada.`,
      );
    }
  }

  // Guarda determinista: documentos de cumplimiento bloqueantes vencidos/suspendidos
  // /rechazados impiden la asignación, salvo excepción aprobada vigente.
  if (!complianceExempt) {
    const complianceDocs = await db.complianceDocument.findMany({
      where: {
        tenantId: tenant.id,
        blocksDispatch: true,
        OR: [
          { entityType: "CONDUCTOR", entityId: { in: [driver.code].filter(Boolean) } },
          { entityType: "VEHICULO", entityId: { in: [vehicle.code, vehicle.plate].filter(Boolean) } },
          ...(equipment ? [{ entityType: "EQUIPO" as const, entityId: { in: [equipment.code].filter(Boolean) } }] : []),
        ],
      },
      select: {
        status: true,
        expiresAt: true,
        alertDaysBefore: true,
        blocksDispatch: true,
        entityType: true,
        entityId: true,
        name: true,
      },
    });
    const blockingCompliance = blockingDocumentsNow(complianceDocs, now);
    if (blockingCompliance.length > 0) {
      const names = blockingCompliance.map((doc) => `${doc.name} (${doc.entityId})`).join(", ");
      return actionError(`Documentos de cumplimiento bloqueantes: ${names}. Renuevelos o registre una excepcion aprobada.`);
    }
  }

  // Hora de pared de Panama (no la zona del servidor). Sin fecha, se conserva la del viaje.
  const scheduledAt = parsed.scheduledAt ? parseTenantLocal(parsed.scheduledAt) : trip.scheduledAt;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return actionError("La fecha programada no es valida.");
  const windowStart = new Date(scheduledAt.getTime() - ASSIGNMENT_CONFLICT_WINDOW_MS);
  const windowEnd = new Date(scheduledAt.getTime() + ASSIGNMENT_CONFLICT_WINDOW_MS);

  // Seccion critica: se bloquean (FOR UPDATE) el viaje y los tres recursos en
  // orden fijo (viaje -> vehiculo -> equipo -> conductor) para que dos
  // asignaciones concurrentes no reserven el mismo recurso. Con READ COMMITTED,
  // la consulta de conflicto posterior al bloqueo ve lo que confirmo la otra
  // transaccion. El orden fijo evita deadlocks.
  type AssignOutcome =
    | { kind: "stale"; status: TripStatus | null }
    | { kind: "conflict"; reference: string; resource: string }
    | { kind: "ok"; updated: Trip; fromStatus: TripStatus };
  const outcome: AssignOutcome = await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: TripStatus }[]>`
      SELECT status FROM trips WHERE id = ${trip.id}::uuid AND tenant_id = ${tenant.id}::uuid FOR UPDATE`;
    const lockedStatus = locked[0]?.status ?? null;
    if (!lockedStatus || !ASSIGNABLE_TRIP_STATUSES.includes(lockedStatus)) return { kind: "stale", status: lockedStatus };
    await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicle.id}::uuid FOR UPDATE`;
    if (equipment) await tx.$queryRaw`SELECT id FROM equipment WHERE id = ${equipment.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${driver.id}::uuid FOR UPDATE`;

    const conflict = await tx.trip.findFirst({
      where: {
        tenantId: tenant.id,
        id: { not: trip.id },
        status: { notIn: [...TERMINAL_TRIP_STATUSES] },
        scheduledAt: { gte: windowStart, lte: windowEnd },
        OR: [
          { vehicleId: vehicle.id },
          ...(equipment ? [{ equipmentId: equipment.id }] : []),
          { driverId: driver.id },
        ],
      },
      select: { reference: true, vehicleId: true, equipmentId: true, driverId: true },
    });
    if (conflict) {
      const resource =
        conflict.driverId === driver.id
          ? `el conductor ${driver.code}`
          : conflict.vehicleId === vehicle.id
            ? `el vehiculo ${vehicle.code}`
            : `el equipo ${equipment?.code ?? ""}`.trim();
      return { kind: "conflict", reference: conflict.reference, resource };
    }

    await tx.tripAssignment.updateMany({
      where: { tenantId: tenant.id, tripId: trip.id, active: true },
      data: { active: false },
    });
    await tx.tripAssignment.create({
      data: {
        tenantId: tenant.id,
        tripId: trip.id,
        vehicleId: vehicle.id,
        equipmentId: equipment?.id ?? null,
        driverId: driver.id,
        assignedById: user.id,
        scheduledAt,
        notes: parsed.notes,
      },
    });

    const reassigned = lockedStatus === "DRIVER_CONFIRMED" || lockedStatus === "ASSIGNED";
    const updated = await tx.trip.update({
      where: { id: trip.id },
      data: {
        vehicleId: vehicle.id,
        // null explicito: al reasignar sin equipo se limpia el anterior (con undefined se conservaria).
        equipmentId: equipment?.id ?? null,
        driverId: driver.id,
        scheduledAt,
        // Una reasignacion vuelve a ASSIGNED: el nuevo conductor debe confirmar.
        status: "ASSIGNED",
        customerVisibleStatus: customerVisibleStatus.ASSIGNED,
        events: {
          create: {
            tenantId: tenant.id,
            actorId: user.id,
            fromStatus: lockedStatus,
            toStatus: "ASSIGNED",
            note: reassigned ? "Recursos reasignados." : equipment ? "Unidad, equipo y conductor asignados." : "Unidad y conductor asignados.",
            visibleToCustomer: true,
          },
        },
      },
    });
    return { kind: "ok", updated, fromStatus: lockedStatus };
  });

  if (outcome.kind === "stale") {
    return actionError(
      outcome.status
        ? `El viaje cambio a "${tripStatusLabel[outcome.status]}" mientras asignaba. No se aplicaron cambios.`
        : "El viaje ya no existe.",
    );
  }
  if (outcome.kind === "conflict") {
    return actionError(
      `Conflicto de agenda: ${outcome.resource} ya esta asignado al viaje ${outcome.reference} dentro de ±${ASSIGNMENT_CONFLICT_WINDOW_MS / 3_600_000} h.`,
    );
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "trip.assign",
    entity: "Trip",
    entityId: trip.id,
    before: trip,
    after: outcome.updated,
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: trip.customerAccountId,
    channel: "PORTAL",
    recipient: driver.name,
    subject: `Viaje asignado ${trip.reference}`,
    body: `Se asigno conductor, equipo y vehiculo para ${trip.origin} -> ${trip.destination}.`,
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: trip.customerAccountId,
    channel: "EMAIL",
    recipient: tenant.branding?.supportMail ?? "operaciones@nci.local",
    subject: `Asignacion ${trip.reference}`,
    body: `Asignado a ${driver.name} con ${vehicle.code}${equipment ? ` y ${equipment.code}` : ""}.`,
  });
  // Layout: refresca todas las vistas del tenant (/trips, /requests, /driver, /portal...).
  revalidatePath(`/t/${tenantSlug}`, "layout");
  revalidatePath(`/t/${tenantSlug}/driver`);
  return actionOk(`Viaje ${trip.reference} asignado a ${driver.name} con ${vehicle.code}${equipment ? ` y ${equipment.code}` : ""}.`);
}

/** Texto que ve el cliente en la linea de tiempo para transiciones de excepcion. */
const customerExceptionNote: Partial<Record<TripStatus, string>> = {
  CANCELLED: "Servicio cancelado por operaciones.",
  DELIVERY_FAILED: "La entrega no pudo completarse. Operaciones coordinara el siguiente paso.",
  IN_TRANSIT: "Nuevo intento de entrega o retorno en curso.",
};

export async function transitionTripAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const tripId = String(formData.get("tripId") ?? "");
  const nextStatus = String(formData.get("nextStatus") ?? "") as TripStatus;
  const note = String(formData.get("note") ?? "").slice(0, 500);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  const db = getDb();
  const trip = await db.trip.findFirst({ where: { id: tripId, tenantId: tenant.id }, include: { proof: true } });
  if (!trip) return actionError("El viaje no existe o no pertenece a esta empresa.");

  const role: TenantRole = membership.role;
  let driverId: string | null = null;
  if (role === "DRIVER") {
    const driver = await db.driver.findFirst({ where: { tenantId: tenant.id, userId: user.id } });
    if (!driver || trip.driverId !== driver.id) return actionError("Este viaje no esta asignado a usted.");
    driverId = driver.id;
  }
  if (!tripStatusLabel[nextStatus]) return actionError("Seleccione un estado valido.");
  // La evidencia enviada/aprobada exige firma, archivo y POD: solo la mueven
  // submitProofAction y approveProofAction, nunca un cambio de estado generico.
  if (requiresDedicatedFlow(nextStatus)) {
    return actionError(
      "La evidencia se registra con el formulario de evidencia y se aprueba con \"Aprobar evidencia y generar POD\". No se puede forzar con un cambio de estado.",
    );
  }
  if (!canTransition(trip.status, nextStatus, role)) {
    return actionError(
      `No se puede pasar de "${tripStatusLabel[trip.status]}" a "${tripStatusLabel[nextStatus]}" con su rol.`,
    );
  }
  // El cierre exige la evidencia aprobada y el POD generado.
  if (nextStatus === "CLOSED" && !canCloseTrip(trip)) {
    return actionError("No se puede cerrar el servicio sin la evidencia aprobada y su POD.");
  }
  const requiresReason = transitionRequiresReason(trip.status, nextStatus, role);
  if (requiresReason && reason.length < MIN_REASON_LENGTH) {
    return actionError("Escriba el motivo (minimo 5 caracteres). Queda en la auditoria y no lo ve el cliente.");
  }

  const applied = await db.$transaction(async (tx) => {
    // Bloqueo optimista: si el estado cambio desde la lectura (otro usuario o
    // la cola offline del conductor), el update afecta 0 filas.
    const result = await tx.trip.updateMany({
      where: { id: trip.id, tenantId: tenant.id, status: trip.status, ...(driverId ? { driverId } : {}) },
      data: {
        status: nextStatus,
        customerVisibleStatus: customerVisibleStatus[nextStatus],
        simulationStartedAt: nextStatus === "EN_ROUTE_TO_ORIGIN" ? new Date() : undefined,
      },
    });
    if (result.count === 0) return false;
    await tx.tripEvent.create({
      data: {
        tenantId: tenant.id,
        tripId: trip.id,
        actorId: user.id,
        fromStatus: trip.status,
        toStatus: nextStatus,
        note: requiresReason ? (customerExceptionNote[nextStatus] ?? note) : note,
        reason: requiresReason ? reason : null,
        visibleToCustomer: true,
      },
    });
    if (nextStatus === "CANCELLED") {
      await tx.tripAssignment.updateMany({
        where: { tenantId: tenant.id, tripId: trip.id, active: true },
        data: { active: false },
      });
    }
    return true;
  });

  if (!applied) {
    const current = await db.trip.findFirst({ where: { id: trip.id, tenantId: tenant.id }, select: { status: true } });
    return actionError(
      current
        ? `El viaje cambio a "${tripStatusLabel[current.status]}" mientras trabajaba. No se aplicaron cambios.`
        : "El viaje ya no existe.",
    );
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: nextStatus === "CANCELLED" ? "trip.cancel" : requiresReason ? "trip.exception" : "trip.transition",
    entity: "Trip",
    entityId: trip.id,
    before: { status: trip.status },
    after: { status: nextStatus, ...(requiresReason ? { reason } : {}) },
  });
  if (requiresReason) {
    await sendLocalNotification({
      tenantId: tenant.id,
      customerAccountId: trip.customerAccountId,
      channel: "PORTAL",
      recipient: "customer",
      subject: `${trip.reference}: ${customerVisibleStatus[nextStatus]}`,
      body: customerExceptionNote[nextStatus] ?? customerVisibleStatus[nextStatus],
    });
  }
  revalidatePath(`/t/${tenantSlug}`, "layout");
  revalidatePath(`/t/${tenantSlug}/driver`);
  revalidatePath(`/t/${tenantSlug}/portal`);
  return actionOk(`${trip.reference}: ${tripStatusLabel[nextStatus]}.`);
}

export async function reportIncidentAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const tripId = String(formData.get("tripId") ?? "");
  const customerMessage = String(formData.get("customerMessage") ?? "");
  const internalDescription = String(formData.get("internalDescription") ?? "");
  const db = getDb();
  const trip = await db.trip.findFirstOrThrow({ where: { id: tripId, tenantId: tenant.id } });

  const incident = await db.incident.create({
    data: {
      tenantId: tenant.id,
      customerAccountId: trip.customerAccountId,
      tripId: trip.id,
      category: String(formData.get("category") ?? "Retraso"),
      priority: "MEDIUM",
      internalDescription: internalDescription || customerMessage || "Incidencia registrada.",
      customerMessage: customerMessage || null,
      visibleToCustomer: Boolean(customerMessage),
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "incident.create",
    entity: "Incident",
    entityId: incident.id,
    after: incident,
  });
  revalidatePath(`/t/${tenantSlug}`);
  revalidatePath(`/t/${tenantSlug}/portal`);
  redirect(`/t/${tenantSlug}`);
}

export async function submitProofAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const tripId = String(formData.get("tripId") ?? "");
  const receiverName = String(formData.get("receiverName") ?? "").trim();
  const observation = String(formData.get("observation") ?? "");
  const signatureData = String(formData.get("signatureData") ?? "");
  const evidenceFile = formData.get("evidenceFile");
  const availablePhotoIdsRaw = String(formData.get("availablePhotoIds") ?? "");
  const db = getDb();
  const trip = await db.trip.findFirst({ where: { id: tripId, tenantId: tenant.id }, include: { proof: true } });
  if (!trip) return actionError("El viaje no existe o no pertenece a esta empresa.");

  const driver = await db.driver.findFirst({ where: { tenantId: tenant.id, userId: user.id } });
  if (membership.role === "DRIVER" && trip.driverId !== driver?.id) return actionError("Este viaje no esta asignado a usted.");
  if (!EVIDENCE_SUBMITTABLE_STATUSES.includes(trip.status)) {
    return actionError(`No se puede registrar evidencia con el viaje en "${tripStatusLabel[trip.status]}".`);
  }
  if (trip.proof?.status === "APPROVED") return actionError("La evidencia de este viaje ya fue aprobada.");
  if (!receiverName) return actionError("Escriba el nombre de quien recibe la carga.");
  if (!isValidSignaturePng(signatureData)) return actionError("Capture la firma del receptor antes de enviar.");
  if (!(evidenceFile instanceof File) || evidenceFile.size === 0) {
    return actionError("Adjunte una fotografia o documento de evidencia.");
  }
  let validated;
  try {
    validated = await validateUploadedFile(evidenceFile);
  } catch (error) {
    if (error instanceof UploadRejectedError) return actionError(error.message);
    throw error;
  }
  const { filename, buffer, mimeType } = validated;

  const proof = await db.proofOfDelivery.upsert({
    where: { tripId: trip.id },
    create: {
      tenantId: tenant.id,
      tripId: trip.id,
      receiverName,
      observation,
      signatureSvg: signatureData,
      status: "SUBMITTED",
    },
    update: { receiverName, observation, signatureSvg: signatureData, status: "SUBMITTED", rejectionReason: null },
  });

  const targetKey = `tenants/${tenant.slug}/trips/${trip.reference}/evidence/${Date.now()}-${filename}`;
  const pipelineResult = await processUploadThroughPipeline({
    tenantId: tenant.id,
    tripId: trip.id,
    proofId: proof.id,
    uploadedById: user.id,
    filename,
    mimeType,
    buffer,
    targetKey,
  });

  if (pipelineResult.verdict === "INFECTED") {
    logger.warn("infected evidence file rejected", {
      tenantId: tenant.id,
      tripId: trip.id,
      fileAttachmentId: pipelineResult.fileAttachmentId,
    });
    return actionError("El archivo fue bloqueado por el antivirus. Capture otra fotografia.");
  }

  if (pipelineResult.objectKey) {
    await db.document.create({
      data: {
        tenantId: tenant.id,
        customerAccountId: trip.customerAccountId,
        tripId: trip.id,
        proofId: proof.id,
        filename,
        mimeType: mimeType,
        sizeBytes: buffer.length,
        bucket: getStorageBucket(),
        objectKey: pipelineResult.objectKey,
        // La evidencia del conductor no es visible al cliente hasta que operaciones
        // la apruebe (approveProofAction la publica junto con el POD).
        visibility: EVIDENCE_DOCUMENT_VISIBILITY,
        uploadedById: user.id,
      },
    });
  }

  const availablePhotoIds = availablePhotoIdsRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (availablePhotoIds.length > 0) {
    const validAttachments = await db.fileAttachment.findMany({
      where: {
        id: { in: availablePhotoIds },
        tenantId: tenant.id,
        status: "AVAILABLE",
      },
      select: { objectKey: true },
    });
    const objectKeys = validAttachments.map((a) => a.objectKey).filter(Boolean) as string[];
    if (objectKeys.length > 0) {
      await db.document.updateMany({
        where: {
          tenantId: tenant.id,
          tripId: trip.id,
          objectKey: { in: objectKeys },
          proofId: null,
        },
        // Al ligarlas a la prueba quedan en revision: INTERNAL hasta la aprobacion.
        data: { proofId: proof.id, visibility: EVIDENCE_DOCUMENT_VISIBILITY },
      });
    }
  }

  const submitted = await db.$transaction(async (tx) => {
    const result = await tx.trip.updateMany({
      where: { id: trip.id, tenantId: tenant.id, status: { in: [...EVIDENCE_SUBMITTABLE_STATUSES] } },
      data: {
        status: "EVIDENCE_SUBMITTED",
        customerVisibleStatus: customerVisibleStatus.EVIDENCE_SUBMITTED,
      },
    });
    if (result.count === 0) return false;
    await tx.tripEvent.create({
      data: {
        tenantId: tenant.id,
        tripId: trip.id,
        actorId: user.id,
        fromStatus: trip.status,
        toStatus: "EVIDENCE_SUBMITTED",
        note: "Evidencia y firma registradas.",
        visibleToCustomer: true,
      },
    });
    return true;
  });
  if (!submitted) {
    return actionError("El viaje cambio de estado mientras enviaba la evidencia (posible cancelacion). Avise a operaciones.");
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "proof.submit",
    entity: "ProofOfDelivery",
    entityId: proof.id,
    after: proof,
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: trip.customerAccountId,
    channel: "PORTAL",
    recipient: "operations",
    subject: `Evidencia recibida ${trip.reference}`,
    body: `El conductor envio evidencia para ${trip.reference}.`,
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  revalidatePath(`/t/${tenantSlug}/driver`);
  revalidatePath(`/t/${tenantSlug}/portal`);
  return actionOk("Evidencia y firma enviadas. Operaciones la revisara.");
}

export async function approveProofAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["OPERATIONS_MANAGER", "TENANT_OWNER"]);
  const tripId = String(formData.get("tripId") ?? "");
  const db = getDb();
  const trip = await db.trip.findFirst({
    where: { id: tripId, tenantId: tenant.id },
    include: {
      tenant: { include: { branding: true } },
      customerAccount: true,
      serviceType: true,
      vehicle: true,
      equipment: true,
      driver: true,
      proof: true,
      documents: true,
      fileAttachments: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!trip) return actionError("El viaje no existe o no pertenece a esta empresa.");
  if (!trip.proof) return actionError("El viaje no tiene evidencia registrada.");
  if (trip.proof.status !== "SUBMITTED") return actionError("La evidencia ya fue revisada.");
  if (trip.status !== "EVIDENCE_SUBMITTED") {
    return actionError(`No se puede aprobar evidencia con el viaje en "${tripStatusLabel[trip.status]}".`);
  }

  const proofId = trip.proof.id;
  // Evidencia revisada que se publica al cliente junto con el POD (nace INTERNAL).
  const publishDocumentIds = evidenceDocumentIdsToPublish(trip.documents, proofId);
  const published = new Set(publishDocumentIds);

  const pdfObjectKey = `tenants/${tenant.slug}/trips/${trip.reference}/pod/${trip.reference}-pod.pdf`;
  // El POD lista las evidencias autorizadas: se genera con las que esta
  // aprobacion publica, aunque en BD sigan INTERNAL hasta la transaccion.
  const pdfBuffer = await generateProofOfDeliveryPdf({
    ...trip,
    documents: trip.documents.map((document) =>
      published.has(document.id) ? { ...document, visibility: "CUSTOMER_VISIBLE" as const } : document,
    ),
  });

  await uploadBuffer({
    objectKey: pdfObjectKey,
    body: pdfBuffer,
    contentType: "application/pdf",
  });

  let updatedProof;
  try {
    updatedProof = await db.$transaction(async (tx) => {
      const claimed = await tx.proofOfDelivery.updateMany({
        where: { id: trip.proof!.id, tenantId: tenant.id, status: "SUBMITTED" },
        data: { status: "APPROVED", approvedAt: new Date(), rejectionReason: null },
      });
      const moved = await tx.trip.updateMany({
        where: { id: trip.id, tenantId: tenant.id, status: "EVIDENCE_SUBMITTED" },
        data: {
          status: "EVIDENCE_APPROVED",
          customerVisibleStatus: customerVisibleStatus.EVIDENCE_APPROVED,
          proofReady: true,
        },
      });
      if (claimed.count === 0 || moved.count === 0) throw new StaleStateError();
      const proof = await tx.proofOfDelivery.findUniqueOrThrow({ where: { id: trip.proof!.id } });
      // Publicacion de la evidencia revisada: solo aqui pasa a CUSTOMER_VISIBLE.
      if (publishDocumentIds.length > 0) {
        await tx.document.updateMany({
          where: {
            id: { in: publishDocumentIds },
            tenantId: tenant.id,
            tripId: trip.id,
            proofId: proof.id,
            visibility: EVIDENCE_DOCUMENT_VISIBILITY,
          },
          data: { visibility: "CUSTOMER_VISIBLE" },
        });
      }
      await tx.document.create({
        data: {
          tenantId: tenant.id,
          customerAccountId: trip.customerAccountId,
          tripId: trip.id,
          proofId: proof.id,
          filename: `${trip.reference}-pod.pdf`,
          mimeType: POD_MIME_TYPE,
          sizeBytes: pdfBuffer.length,
          bucket: getStorageBucket(),
          objectKey: pdfObjectKey,
          visibility: "CUSTOMER_VISIBLE",
          uploadedById: user.id,
        },
      });
      await tx.tripEvent.create({
        data: {
          tenantId: tenant.id,
          tripId: trip.id,
          actorId: user.id,
          fromStatus: trip.status,
          toStatus: "EVIDENCE_APPROVED",
          note: "Evidencia aprobada y POD generado.",
          visibleToCustomer: true,
        },
      });
      return proof;
    });
  } catch (error) {
    if (error instanceof StaleStateError) {
      return actionError("La evidencia o el viaje cambiaron mientras revisaba. Recargue la pagina.");
    }
    throw error;
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "proof.approve",
    entity: "ProofOfDelivery",
    entityId: updatedProof.id,
    after: { proofId: updatedProof.id, pdfObjectKey },
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: trip.customerAccountId,
    channel: "EMAIL",
    recipient: tenant.branding?.supportMail ?? "operaciones@nci.local",
    subject: `POD generado ${trip.reference}`,
    body: `La evidencia de ${trip.reference} fue aprobada y el POD esta disponible.`,
  });
  await sendLocalNotification({
    tenantId: tenant.id,
    customerAccountId: trip.customerAccountId,
    channel: "MOCK_WHATSAPP",
    recipient: trip.customerAccount.name,
    subject: `POD disponible ${trip.reference}`,
    body: `La prueba de entrega ${trip.reference} esta disponible en el portal.`,
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  revalidatePath(`/t/${tenantSlug}/portal`);
  return actionOk(`Evidencia aprobada. POD de ${trip.reference} disponible para el cliente.`);
}

export async function rejectProofAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["OPERATIONS_MANAGER", "TENANT_OWNER"]);
  const tripId = String(formData.get("tripId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  if (reason.length < MIN_REASON_LENGTH) return actionError("Escriba el motivo del rechazo para el conductor.");
  const db = getDb();
  const trip = await db.trip.findFirst({
    where: { id: tripId, tenantId: tenant.id },
    include: { proof: true },
  });
  if (!trip) return actionError("El viaje no existe o no pertenece a esta empresa.");
  if (!trip.proof) return actionError("El viaje no tiene evidencia registrada.");
  if (trip.proof.status !== "SUBMITTED") return actionError("La evidencia ya fue revisada.");

  try {
    await db.$transaction(async (tx) => {
      const claimed = await tx.proofOfDelivery.updateMany({
        where: { id: trip.proof!.id, tenantId: tenant.id, status: "SUBMITTED" },
        data: { status: "REJECTED", rejectionReason: reason },
      });
      // El viaje vuelve a "Evidencia pendiente" para que el conductor recapture.
      const moved = await tx.trip.updateMany({
        where: { id: trip.id, tenantId: tenant.id, status: "EVIDENCE_SUBMITTED" },
        data: { status: "EVIDENCE_PENDING", customerVisibleStatus: customerVisibleStatus.EVIDENCE_PENDING },
      });
      if (claimed.count === 0 || moved.count === 0) throw new StaleStateError();
      // La evidencia rechazada no debe quedar expuesta ni re-publicarse en una
      // aprobacion posterior (la nueva captura reutiliza la misma prueba): vuelve
      // a INTERNAL y se desliga de la prueba, conservandose en el viaje.
      await tx.document.updateMany({
        where: {
          tenantId: tenant.id,
          tripId: trip.id,
          proofId: trip.proof!.id,
          // El POD no es evidencia del conductor (se distingue por su clave, no por el MIME).
          NOT: { objectKey: { contains: POD_OBJECT_KEY_SEGMENT } },
        },
        data: { visibility: EVIDENCE_DOCUMENT_VISIBILITY, proofId: null },
      });
      await tx.tripEvent.create({
        data: {
          tenantId: tenant.id,
          tripId: trip.id,
          actorId: user.id,
          fromStatus: trip.status,
          toStatus: "EVIDENCE_PENDING",
          note: "Evidencia rechazada; se solicito nueva captura.",
          reason,
          visibleToCustomer: false,
        },
      });
    });
  } catch (error) {
    if (error instanceof StaleStateError) {
      return actionError("La evidencia o el viaje cambiaron mientras revisaba. Recargue la pagina.");
    }
    throw error;
  }
  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "proof.reject",
    entity: "ProofOfDelivery",
    entityId: trip.proof.id,
    after: { reason },
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  revalidatePath(`/t/${tenantSlug}/driver`);
  revalidatePath(`/t/${tenantSlug}/portal`);
  return actionOk("Evidencia rechazada. El conductor debera capturarla de nuevo.");
}
