"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TenantRole, TripStatus } from "@/generated/prisma/enums";
import { customerVisibleStatus, canTransition } from "@/lib/domain/state-machine";
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
import { getDb } from "@/lib/server/db";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { logger } from "@/lib/server/logger";
import { sendLocalNotification } from "@/lib/providers/notifications";
import { generateProofOfDeliveryPdf } from "@/lib/server/pod-pdf";
import { getStorageBucket, isValidSignaturePng, uploadBuffer, validateUploadedFile } from "@/lib/server/storage";
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

  if (user?.platformRole) redirect("/platform");
  const firstTenant = user?.tenantMemberships[0]?.tenant.slug;
  if (firstTenant) redirect(`/t/${firstTenant}`);

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

const requestSchema = z.object({
  serviceTypeId: z.string().uuid(),
  origin: z.string().min(3),
  destination: z.string().min(3),
  requestedDate: z.string().min(10),
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

  const request = await db.$transaction(async (tx) => {
    const count = await tx.serviceRequest.count({ where: { tenantId: tenant.id } });
    return tx.serviceRequest.create({
      data: {
        tenantId: tenant.id,
        customerAccountId: customerAccount.id,
        serviceTypeId: parsed.serviceTypeId,
        reference: `${tenant.slug.toUpperCase()}-SR-${String(count + 1).padStart(4, "0")}`,
        status: parsed.intent,
        origin: parsed.origin,
        destination: parsed.destination,
        requestedDate: new Date(parsed.requestedDate),
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
  });

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

export async function confirmRequestAsTripAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "OPERATIONS_MANAGER",
    "DISPATCHER",
    "TENANT_OWNER",
  ]);
  const requestId = String(formData.get("requestId") ?? "");
  const db = getDb();
  const request = await db.serviceRequest.findFirstOrThrow({
    where: { id: requestId, tenantId: tenant.id },
    include: { trip: true, customerAccount: true, serviceType: true },
  });

  if (request.trip) {
    revalidatePath(`/t/${tenantSlug}`);
    return;
  }

  const trip = await db.$transaction(async (tx) => {
    const count = await tx.trip.count({ where: { tenantId: tenant.id } });
    const created = await tx.trip.create({
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

    await tx.serviceRequest.update({
      where: { id: request.id },
      data: { status: "CONVERTED" },
    });

    return created;
  });

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
  revalidatePath(`/t/${tenantSlug}`);
}

const assignmentSchema = z.object({
  tripId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  equipmentId: z.string().uuid(),
  driverId: z.string().uuid(),
  scheduledAt: z.string().min(10),
  notes: z.string().optional(),
});

export async function assignTripAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["DISPATCHER", "TENANT_OWNER", "OPERATIONS_MANAGER"]);
  const parsed = assignmentSchema.parse({
    tripId: formData.get("tripId"),
    vehicleId: formData.get("vehicleId"),
    equipmentId: formData.get("equipmentId"),
    driverId: formData.get("driverId"),
    scheduledAt: formData.get("scheduledAt"),
    notes: formData.get("notes")?.toString(),
  });
  const db = getDb();
  const trip = await db.trip.findFirstOrThrow({
    where: { id: parsed.tripId, tenantId: tenant.id },
    include: { serviceType: true },
  });

  if (!["CONFIRMED", "SCHEDULED", "ASSIGNED"].includes(trip.status)) return;

  const [vehicle, equipment, driver] = await Promise.all([
    db.vehicle.findFirst({ where: { id: parsed.vehicleId, tenantId: tenant.id, status: "AVAILABLE" } }),
    db.equipment.findFirst({ where: { id: parsed.equipmentId, tenantId: tenant.id, status: "AVAILABLE" } }),
    db.driver.findFirst({ where: { id: parsed.driverId, tenantId: tenant.id, status: "AVAILABLE" } }),
  ]);
  if (!vehicle || !equipment || !driver) return;

  const authorizations = Array.isArray(driver.authorizations) ? driver.authorizations.map(String) : [];
  if (authorizations.length > 0 && !authorizations.includes(trip.serviceType.code)) return;

  const scheduledAt = new Date(parsed.scheduledAt);
  const windowStart = new Date(scheduledAt.getTime() - 6 * 60 * 60 * 1000);
  const windowEnd = new Date(scheduledAt.getTime() + 6 * 60 * 60 * 1000);
  const conflict = await db.trip.findFirst({
    where: {
      tenantId: tenant.id,
      id: { not: trip.id },
      status: { notIn: ["CLOSED", "CANCELLED"] },
      scheduledAt: { gte: windowStart, lte: windowEnd },
      OR: [{ vehicleId: vehicle.id }, { equipmentId: equipment.id }, { driverId: driver.id }],
    },
  });
  if (conflict) return;

  const updated = await db.$transaction(async (tx) => {
    await tx.tripAssignment.updateMany({
      where: { tenantId: tenant.id, tripId: trip.id, active: true },
      data: { active: false },
    });
    await tx.tripAssignment.create({
      data: {
        tenantId: tenant.id,
        tripId: trip.id,
        vehicleId: vehicle.id,
        equipmentId: equipment.id,
        driverId: driver.id,
        assignedById: user.id,
        scheduledAt,
        notes: parsed.notes,
      },
    });

    return tx.trip.update({
      where: { id: trip.id },
      data: {
        vehicleId: parsed.vehicleId,
        equipmentId: parsed.equipmentId,
        driverId: parsed.driverId,
        scheduledAt,
        status: "ASSIGNED",
        customerVisibleStatus: customerVisibleStatus.ASSIGNED,
        events: {
          create: {
            tenantId: tenant.id,
            actorId: user.id,
            fromStatus: trip.status,
            toStatus: "ASSIGNED",
            note: "Unidad, equipo y conductor asignados.",
            visibleToCustomer: true,
          },
        },
      },
    });
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "trip.assign",
    entity: "Trip",
    entityId: trip.id,
    before: trip,
    after: updated,
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
    body: `Asignado a ${driver.name} con ${vehicle.code} y ${equipment.code}.`,
  });
  revalidatePath(`/t/${tenantSlug}`);
}

export async function transitionTripAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const tripId = String(formData.get("tripId") ?? "");
  const nextStatus = String(formData.get("nextStatus") ?? "") as TripStatus;
  const note = String(formData.get("note") ?? "");
  const db = getDb();
  const trip = await db.trip.findFirstOrThrow({ where: { id: tripId, tenantId: tenant.id } });

  const driver = await db.driver.findFirst({ where: { tenantId: tenant.id, userId: user.id } });
  const effectiveRole: TenantRole = membership.role;

  if (membership.role === "DRIVER" && trip.driverId !== driver?.id) return;
  if (!canTransition(trip.status, nextStatus, effectiveRole)) return;

  const updated = await db.trip.update({
    where: { id: trip.id },
    data: {
      status: nextStatus,
      customerVisibleStatus: customerVisibleStatus[nextStatus],
      simulationStartedAt: nextStatus === "EN_ROUTE_TO_ORIGIN" ? new Date() : undefined,
      proofReady: nextStatus === "CLOSED" ? true : undefined,
      events: {
        create: {
          tenantId: tenant.id,
          actorId: user.id,
          fromStatus: trip.status,
          toStatus: nextStatus,
          note,
          visibleToCustomer: true,
        },
      },
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "trip.transition",
    entity: "Trip",
    entityId: trip.id,
    before: { status: trip.status },
    after: { status: updated.status },
  });
  revalidatePath(`/t/${tenantSlug}`);
  revalidatePath(`/t/${tenantSlug}/driver`);
  revalidatePath(`/t/${tenantSlug}/portal`);
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

export async function submitProofAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const tripId = String(formData.get("tripId") ?? "");
  const receiverName = String(formData.get("receiverName") ?? "");
  const observation = String(formData.get("observation") ?? "");
  const signatureData = String(formData.get("signatureData") ?? "");
  const evidenceFile = formData.get("evidenceFile");
  const availablePhotoIdsRaw = String(formData.get("availablePhotoIds") ?? "");
  const db = getDb();
  const trip = await db.trip.findFirstOrThrow({ where: { id: tripId, tenantId: tenant.id } });

  const driver = await db.driver.findFirst({ where: { tenantId: tenant.id, userId: user.id } });
  if (membership.role === "DRIVER" && trip.driverId !== driver?.id) return;
  if (!receiverName || !isValidSignaturePng(signatureData)) return;
  if (!(evidenceFile instanceof File)) return;
  const { filename, buffer, mimeType } = await validateUploadedFile(evidenceFile);

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
    return;
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
        visibility: "CUSTOMER_VISIBLE",
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
        data: { proofId: proof.id },
      });
    }
  }

  await db.trip.update({
    where: { id: trip.id },
    data: {
      status: "EVIDENCE_SUBMITTED",
      customerVisibleStatus: customerVisibleStatus.EVIDENCE_SUBMITTED,
      events: {
        create: {
          tenantId: tenant.id,
          actorId: user.id,
          fromStatus: trip.status,
          toStatus: "EVIDENCE_SUBMITTED",
          note: "Evidencia y firma registradas.",
          visibleToCustomer: true,
        },
      },
    },
  });

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
  revalidatePath(`/t/${tenantSlug}`);
  revalidatePath(`/t/${tenantSlug}/driver`);
  revalidatePath(`/t/${tenantSlug}/portal`);
}

export async function approveProofAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["OPERATIONS_MANAGER", "TENANT_OWNER"]);
  const tripId = String(formData.get("tripId") ?? "");
  const db = getDb();
  const trip = await db.trip.findFirstOrThrow({
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
  if (!trip.proof) return;

  const pdfObjectKey = `tenants/${tenant.slug}/trips/${trip.reference}/pod/${trip.reference}-pod.pdf`;
  const pdfBuffer = await generateProofOfDeliveryPdf(trip);

  await uploadBuffer({
    objectKey: pdfObjectKey,
    body: pdfBuffer,
    contentType: "application/pdf",
  });

  const updatedProof = await db.$transaction(async (tx) => {
    const proof = await tx.proofOfDelivery.update({
      where: { id: trip.proof!.id },
      data: { status: "APPROVED", approvedAt: new Date(), rejectionReason: null },
    });
    await tx.document.create({
      data: {
        tenantId: tenant.id,
        customerAccountId: trip.customerAccountId,
        tripId: trip.id,
        proofId: proof.id,
        filename: `${trip.reference}-pod.pdf`,
        mimeType: "application/pdf",
        sizeBytes: pdfBuffer.length,
        bucket: getStorageBucket(),
        objectKey: pdfObjectKey,
        visibility: "CUSTOMER_VISIBLE",
        uploadedById: user.id,
      },
    });
    await tx.trip.update({
      where: { id: trip.id },
      data: {
        status: "EVIDENCE_APPROVED",
        customerVisibleStatus: customerVisibleStatus.EVIDENCE_APPROVED,
        proofReady: true,
        events: {
          create: {
            tenantId: tenant.id,
            actorId: user.id,
            fromStatus: trip.status,
            toStatus: "EVIDENCE_APPROVED",
            note: "Evidencia aprobada y POD generado.",
            visibleToCustomer: true,
          },
        },
      },
    });
    return proof;
  });

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
  revalidatePath(`/t/${tenantSlug}`);
  revalidatePath(`/t/${tenantSlug}/portal`);
}

export async function rejectProofAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["OPERATIONS_MANAGER", "TENANT_OWNER"]);
  const tripId = String(formData.get("tripId") ?? "");
  const reason = String(formData.get("reason") ?? "Correccion requerida.");
  const db = getDb();
  const trip = await db.trip.findFirstOrThrow({
    where: { id: tripId, tenantId: tenant.id },
    include: { proof: true },
  });
  if (!trip.proof) return;

  const proof = await db.proofOfDelivery.update({
    where: { id: trip.proof.id },
    data: { status: "REJECTED", rejectionReason: reason },
  });
  await db.tripEvent.create({
    data: {
      tenantId: tenant.id,
      tripId: trip.id,
      actorId: user.id,
      fromStatus: trip.status,
      toStatus: "EVIDENCE_PENDING",
      note: `Evidencia rechazada: ${reason}`,
      visibleToCustomer: false,
    },
  });
  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "proof.reject",
    entity: "ProofOfDelivery",
    entityId: proof.id,
    after: { reason },
  });
  revalidatePath(`/t/${tenantSlug}`);
}
