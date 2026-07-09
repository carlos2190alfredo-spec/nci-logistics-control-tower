"use server";

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
  signIn,
  signOut,
} from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { sendLocalNotification } from "@/lib/providers/notifications";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function loginAction(_: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { message: "Ingresa correo y contrasena validos." };

  const result = await signIn(parsed.data.email, parsed.data.password);
  if (!result.ok) return { message: result.message };

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
  planCode: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]),
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
  customerNotes: z.string().optional(),
});

export async function createServiceRequestAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, customerAccount } = await requireCustomerMembership(tenantSlug, ["CUSTOMER_ADMIN"]);
  const parsed = requestSchema.parse({
    serviceTypeId: formData.get("serviceTypeId"),
    origin: formData.get("origin"),
    destination: formData.get("destination"),
    requestedDate: formData.get("requestedDate"),
    customerNotes: formData.get("customerNotes")?.toString(),
  });

  const db = getDb();
  const count = await db.serviceRequest.count({ where: { tenantId: tenant.id } });
  const request = await db.serviceRequest.create({
    data: {
      tenantId: tenant.id,
      customerAccountId: customerAccount.id,
      serviceTypeId: parsed.serviceTypeId,
      reference: `${tenant.slug.toUpperCase()}-SR-${String(count + 1).padStart(4, "0")}`,
      origin: parsed.origin,
      destination: parsed.destination,
      requestedDate: new Date(parsed.requestedDate),
      customerNotes: parsed.customerNotes,
      createdById: user.id,
    },
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

  revalidatePath(`/t/${tenantSlug}/portal`);
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
  });

  const count = await db.trip.count({ where: { tenantId: tenant.id } });
  const trip = await db.trip.create({
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

  await db.serviceRequest.update({
    where: { id: request.id },
    data: { status: "CONVERTED" },
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
  revalidatePath(`/t/${tenantSlug}`);
}

const assignmentSchema = z.object({
  tripId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  equipmentId: z.string().uuid(),
  driverId: z.string().uuid(),
});

export async function assignTripAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["DISPATCHER", "TENANT_OWNER"]);
  const parsed = assignmentSchema.parse({
    tripId: formData.get("tripId"),
    vehicleId: formData.get("vehicleId"),
    equipmentId: formData.get("equipmentId"),
    driverId: formData.get("driverId"),
  });
  const db = getDb();
  const trip = await db.trip.findFirstOrThrow({ where: { id: parsed.tripId, tenantId: tenant.id } });

  if (!["CONFIRMED", "SCHEDULED", "ASSIGNED"].includes(trip.status)) return;

  const updated = await db.trip.update({
    where: { id: trip.id },
    data: {
      vehicleId: parsed.vehicleId,
      equipmentId: parsed.equipmentId,
      driverId: parsed.driverId,
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
}

export async function submitProofAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const tripId = String(formData.get("tripId") ?? "");
  const receiverName = String(formData.get("receiverName") ?? "");
  const observation = String(formData.get("observation") ?? "");
  const db = getDb();
  const trip = await db.trip.findFirstOrThrow({ where: { id: tripId, tenantId: tenant.id } });

  const proof = await db.proofOfDelivery.upsert({
    where: { tripId: trip.id },
    create: {
      tenantId: tenant.id,
      tripId: trip.id,
      receiverName,
      observation,
      signatureSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><path d="M20 80 C 80 20, 160 120, 240 55 S 330 70, 345 42" fill="none" stroke="#0f2d46" stroke-width="5"/></svg>`,
    },
    update: { receiverName, observation },
  });

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
  revalidatePath(`/t/${tenantSlug}`);
  revalidatePath(`/t/${tenantSlug}/driver`);
  revalidatePath(`/t/${tenantSlug}/portal`);
}
