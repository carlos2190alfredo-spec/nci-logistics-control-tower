"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/server/audit";
import { requirePlatformRole } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";

export async function seedDemoTenantAction(formData: FormData) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);
  const db = getDb();

  const demoPlan = await db.tenantPlan.findFirst({
    where: { code: "DEMO" },
  });
  if (!demoPlan) throw new Error("Plan DEMO no encontrado. Ejecute la migracion primero.");

  const slug = "demo-logistics";
  const existing = await db.tenant.findUnique({ where: { slug } });
  if (existing) throw new Error(`Tenant demo "${slug}" ya existe. Use la opcion de reiniciar.`);

  const tenant = await db.tenant.create({
    data: {
      name: "Demo Logistics Co.",
      legalName: "Demo Logistics S.A.",
      slug,
      planId: demoPlan.id,
      isDemo: true,
      country: "PA",
      currency: "USD",
      contactName: "Carlos Demo",
      contactEmail: "demo@nci.local",
      contactPhone: "+507-000-0000",
      internalNotes: "Tenant de demostracion. Datos ficticios para evaluacion del sistema.",
      activatedAt: new Date(),
    },
  });

  await db.tenantBranding.create({
    data: {
      tenantId: tenant.id,
      wordmark: "Demo Logistics",
      primary: "#1e40af",
      secondary: "#3b82f6",
      accent: "#f59e0b",
      footerText: "Demostracion — NCI Automation",
      supportMail: "soporte@demo.nci.local",
    },
  });

  await db.tenantSettings.create({
    data: {
      tenantId: tenant.id,
      timezone: "America/Panama",
      locale: "es-PA",
      dateFormat: "dd/MM/yyyy",
    },
  });

  for (const key of ["portal", "driver_app", "notifications", "reports", "branding", "integrations"]) {
    await db.tenantFeature.create({
      data: { tenantId: tenant.id, key, enabled: true },
    });
  }

  const passwordHash = await hashPassword("Demo2024!");

  const demoOwner = await db.user.create({
    data: {
      email: "owner@demo.nci.local",
      name: "Ana Gerente",
      passwordHash,
    },
  });
  await db.tenantMembership.create({
    data: { tenantId: tenant.id, userId: demoOwner.id, role: "TENANT_OWNER" },
  });

  const demoAdmin = await db.user.create({
    data: {
      email: "admin@demo.nci.local",
      name: "Roberto Administrador",
      passwordHash,
    },
  });
  await db.tenantMembership.create({
    data: { tenantId: tenant.id, userId: demoAdmin.id, role: "TENANT_ADMIN" },
  });

  const demoDispatcher = await db.user.create({
    data: {
      email: "dispatch@demo.nci.local",
      name: "Maria Despachadora",
      passwordHash,
    },
  });
  await db.tenantMembership.create({
    data: { tenantId: tenant.id, userId: demoDispatcher.id, role: "DISPATCHER" },
  });

  const demoDriverUser = await db.user.create({
    data: {
      email: "driver@demo.nci.local",
      name: "Pedro Conductor",
      passwordHash,
    },
  });
  await db.tenantMembership.create({
    data: { tenantId: tenant.id, userId: demoDriverUser.id, role: "DRIVER" },
  });

  const driver1 = await db.driver.create({
    data: {
      tenantId: tenant.id,
      userId: demoDriverUser.id,
      code: "DRV-001",
      name: "Pedro Conductor",
      phone: "+507-600-0001",
      license: "LIC-001-DEMO",
      status: "AVAILABLE",
    },
  });

  const driver2 = await db.driver.create({
    data: {
      tenantId: tenant.id,
      code: "DRV-002",
      name: "Luis Rutas",
      phone: "+507-600-0002",
      license: "LIC-002-DEMO",
      status: "AVAILABLE",
    },
  });

  const vehicle1 = await db.vehicle.create({
    data: {
      tenantId: tenant.id,
      code: "VH-001",
      plate: "DEMO-001",
      type: "CAMION",
      status: "AVAILABLE",
    },
  });

  const vehicle2 = await db.vehicle.create({
    data: {
      tenantId: tenant.id,
      code: "VH-002",
      plate: "DEMO-002",
      type: "FURGON",
      status: "AVAILABLE",
    },
  });

  const customer1 = await db.customerAccount.create({
    data: {
      tenantId: tenant.id,
      code: "CLI-001",
      name: "Distribuidora Demo S.A.",
    },
  });

  const customer2 = await db.customerAccount.create({
    data: {
      tenantId: tenant.id,
      code: "CLI-002",
      name: "Importadora Ejemplo",
    },
  });

  const serviceType1 = await db.serviceType.create({
    data: {
      tenantId: tenant.id,
      code: "CARGA-GENERAL",
      name: "Carga General",
    },
  });

  const serviceType2 = await db.serviceType.create({
    data: {
      tenantId: tenant.id,
      code: "MUDANZA",
      name: "Servicio de Mudanza",
    },
  });

  await db.location.createMany({
    data: [
      { tenantId: tenant.id, name: "Bodega Central", address: "Zona Libre de Colon", latitude: 9.359, longitude: -79.901 },
      { tenantId: tenant.id, name: "Puerto Balboa", address: "Ciudad de Panama", latitude: 8.954, longitude: -79.564 },
      { tenantId: tenant.id, name: "Almacen Sur", address: "Via Tocumen", latitude: 9.073, longitude: -79.383 },
    ],
  });

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const nextWeek = new Date(now.getTime() + 7 * 86400000);

  await db.trip.create({
    data: {
      tenantId: tenant.id,
      customerAccountId: customer1.id,
      serviceTypeId: serviceType1.id,
      vehicleId: vehicle1.id,
      driverId: driver1.id,
      reference: "TRIP-DEMO-001",
      status: "IN_TRANSIT",
      origin: "Bodega Central, Colon",
      destination: "Puerto Balboa, Panama",
      scheduledAt: now,
      customerVisibleStatus: "20 pallets de carga general",
    },
  });

  await db.trip.create({
    data: {
      tenantId: tenant.id,
      customerAccountId: customer2.id,
      serviceTypeId: serviceType2.id,
      vehicleId: vehicle2.id,
      driverId: driver2.id,
      reference: "TRIP-DEMO-002",
      status: "REQUESTED",
      origin: "Almacen Sur, Via Tocumen",
      destination: "Bodega Central, Colon",
      scheduledAt: tomorrow,
      customerVisibleStatus: "Mudanza empresarial 15 m3",
    },
  });

  await db.trip.create({
    data: {
      tenantId: tenant.id,
      customerAccountId: customer1.id,
      serviceTypeId: serviceType1.id,
      reference: "TRIP-DEMO-003",
      status: "REQUESTED",
      origin: "Puerto Balboa, Panama",
      destination: "Almacen Sur, Via Tocumen",
      scheduledAt: nextWeek,
      customerVisibleStatus: "Container 40ft importacion",
    },
  });

  await db.tenantAiSetting.create({
    data: { tenantId: tenant.id, enabled: true },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: user.platformRole,
    action: "demo.seed",
    entity: "Tenant",
    entityId: tenant.id,
    after: {
      slug,
      users: 4,
      drivers: 2,
      vehicles: 2,
      customers: 2,
      trips: 3,
      locations: 3,
    },
  });

  revalidatePath("/platform/tenants");
  revalidatePath(`/t/${slug}/admin`);
}

export async function resetDemoTenantAction(formData: FormData) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) throw new Error("tenantId requerido");

  const db = getDb();
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  if (!tenant.isDemo) throw new Error("Solo se pueden reiniciar tenants demo.");

  await db.aiInsightEvent.deleteMany({ where: { tenantId } });
  await db.aiRecommendation.deleteMany({ where: { tenantId } });
  await db.tenantAiSetting.deleteMany({ where: { tenantId } });
  await db.feedbackComment.deleteMany({ where: { feedback: { tenantId } } });
  await db.tenantFeedback.deleteMany({ where: { tenantId } });
  await db.integrationEvent.deleteMany({ where: { tenantIntegration: { tenantId } } });
  await db.integrationCredential.deleteMany({ where: { tenantIntegration: { tenantId } } });
  await db.tenantIntegration.deleteMany({ where: { tenantId } });
  await db.tripAssignment.deleteMany({ where: { tenantId } });
  await db.incident.deleteMany({ where: { tenantId } });
  await db.trip.deleteMany({ where: { tenantId } });
  await db.serviceRequest.deleteMany({ where: { tenantId } });
  await db.serviceType.deleteMany({ where: { tenantId } });
  await db.location.deleteMany({ where: { tenantId } });
  await db.document.deleteMany({ where: { tenantId } });
  await db.notificationDelivery.deleteMany({ where: { tenantId } });
  await db.offlineCommandReceipt.deleteMany({ where: { tenantId } });
  await db.fileAttachment.deleteMany({ where: { tenantId } });
  await db.customerContact.deleteMany({ where: { tenantId } });
  await db.customerMembership.deleteMany({ where: { tenantId } });
  await db.customerAccount.deleteMany({ where: { tenantId } });
  await db.driver.deleteMany({ where: { tenantId } });
  await db.vehicle.deleteMany({ where: { tenantId } });
  await db.equipment.deleteMany({ where: { tenantId } });
  await db.userInvitation.deleteMany({ where: { tenantId } });

  const memberUserIds = await db.tenantMembership.findMany({
    where: { tenantId },
    select: { userId: true },
  });
  await db.tenantMembership.deleteMany({ where: { tenantId } });

  for (const { userId } of memberUserIds) {
    const otherMemberships = await db.tenantMembership.count({ where: { userId } });
    if (otherMemberships === 0) {
      const u = await db.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
      if (!u?.platformRole) {
        await db.session.deleteMany({ where: { userId } });
        await db.user.delete({ where: { id: userId } });
      }
    }
  }

  await db.tenantBranding.deleteMany({ where: { tenantId } });
  await db.tenantSettings.deleteMany({ where: { tenantId } });
  await db.tenantFeature.deleteMany({ where: { tenantId } });
  await db.webhookDelivery.deleteMany({ where: { webhookEndpoint: { tenantId } } });
  await db.tenantWebhookEndpoint.deleteMany({ where: { tenantId } });
  await db.auditLog.deleteMany({ where: { tenantId } });
  await db.tenantSupportSession.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });

  await audit({
    actorId: user.id,
    actorRole: user.platformRole,
    action: "demo.reset",
    entity: "Tenant",
    entityId: tenantId,
    after: { slug: tenant.slug },
  });

  revalidatePath("/platform/tenants");
}
