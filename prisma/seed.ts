import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma";
import { hashPassword } from "../src/lib/server/crypto";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

function demoUuid(seed: string, suffix: string) {
  return `${seed.slice(0, 8)}-${suffix}`;
}

const credentials = [
  ["platform@nci.local", "NCIPlatform2026!", "Administrador Plataforma"],
  ["owner@panatruck.local", "PanatruckOwner2026!", "Owner Panatruck Demo"],
  ["operaciones@panatruck.local", "Operaciones2026!", "Operaciones Panatruck"],
  ["despacho@panatruck.local", "Despacho2026!", "Despacho Panatruck"],
  ["conductor1@panatruck.local", "Conductor2026!", "Conductor Panatruck"],
  ["cliente@clienteportuario.local", "Cliente2026!", "Cliente Portuario"],
  ["owner@translogistica.local", "TransLogistica2026!", "Owner TransLogistica"],
  ["cliente@distribuciones.local", "Distribuciones2026!", "Cliente Distribuciones"],
] as const;

async function user(email: string, password: string, name: string, platformRole?: "PLATFORM_SUPER_ADMIN") {
  return prisma.user.upsert({
    where: { email },
    update: { name, platformRole },
    create: {
      email,
      name,
      platformRole,
      passwordHash: await hashPassword(password),
    },
  });
}

async function main() {
  const starter = await prisma.tenantPlan.upsert({
    where: { code: "STARTER" },
    update: {},
    create: { code: "STARTER", name: "Starter", maxUsers: 12, maxDrivers: 10, maxVehicles: 10, maxCustomers: 6, maxDocuments: 250 },
  });
  const professional = await prisma.tenantPlan.upsert({
    where: { code: "PROFESSIONAL" },
    update: {},
    create: {
      code: "PROFESSIONAL",
      name: "Professional",
      maxUsers: 40,
      maxDrivers: 50,
      maxVehicles: 50,
      maxCustomers: 30,
      maxDocuments: 2500,
      integrationsEnabled: true,
    },
  });
  await prisma.tenantPlan.upsert({
    where: { code: "ENTERPRISE" },
    update: {},
    create: {
      code: "ENTERPRISE",
      name: "Enterprise",
      maxUsers: 200,
      maxDrivers: 400,
      maxVehicles: 400,
      maxCustomers: 200,
      maxDocuments: 25000,
      integrationsEnabled: true,
    },
  });

  const users = Object.fromEntries(
    await Promise.all(credentials.map(async ([email, password, name]) => [email, await user(email, password, name)])),
  );
  await prisma.user.update({ where: { email: "platform@nci.local" }, data: { platformRole: "PLATFORM_SUPER_ADMIN" } });

  const tenants = [
    {
      name: "Panatruck Demo",
      legalName: "Panatruck Demo S.A.",
      slug: "panatruck-demo",
      planId: professional.id,
      primary: "#0f2d46",
      secondary: "#1d4ed8",
      accent: "#f97316",
      customers: ["Cliente Portuario Panama", "Aviacion del Istmo", "Industrias del Pacifico"],
      owner: "owner@panatruck.local",
      customerUser: "cliente@clienteportuario.local",
      driverUser: "conductor1@panatruck.local",
      tripCount: 10,
    },
    {
      name: "TransLogistica Demo",
      legalName: "TransLogistica Demo S.A.",
      slug: "translogistica-demo",
      planId: starter.id,
      primary: "#064e3b",
      secondary: "#0f766e",
      accent: "#2563eb",
      customers: ["Distribuciones Nacionales Demo", "Construcciones del Istmo Demo"],
      owner: "owner@translogistica.local",
      customerUser: "cliente@distribuciones.local",
      driverUser: "conductor1@panatruck.local",
      tripCount: 5,
    },
  ];

  for (const tenantInput of tenants) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: tenantInput.slug },
      update: { name: tenantInput.name, legalName: tenantInput.legalName, planId: tenantInput.planId },
      create: {
        name: tenantInput.name,
        legalName: tenantInput.legalName,
        slug: tenantInput.slug,
        planId: tenantInput.planId,
        isDemo: true,
        status: "ACTIVE",
        subscriptionStatus: "TRIAL",
        activatedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.tenantBranding.upsert({
      where: { tenantId: tenant.id },
      update: { wordmark: tenantInput.name, primary: tenantInput.primary, secondary: tenantInput.secondary, accent: tenantInput.accent },
      create: {
        tenantId: tenant.id,
        wordmark: tenantInput.name,
        primary: tenantInput.primary,
        secondary: tenantInput.secondary,
        accent: tenantInput.accent,
        supportMail: `soporte@${tenantInput.slug}.local`,
        footerText: "Tecnologia desarrollada por NCI Automation",
      },
    });
    await prisma.tenantSettings.upsert({ where: { tenantId: tenant.id }, update: {}, create: { tenantId: tenant.id } });
    for (const key of ["portal", "driver_app", "notifications", "reports", "branding", "integrations"]) {
      await prisma.tenantFeature.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key } },
        update: { enabled: key !== "integrations" || tenantInput.slug === "panatruck-demo" },
        create: { tenantId: tenant.id, key, enabled: key !== "integrations" || tenantInput.slug === "panatruck-demo" },
      });
    }

    const tenantOwner = users[tenantInput.owner];
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId_role: { tenantId: tenant.id, userId: tenantOwner.id, role: "TENANT_OWNER" } },
      update: { active: true },
      create: { tenantId: tenant.id, userId: tenantOwner.id, role: "TENANT_OWNER" },
    });
    if (tenantInput.slug === "panatruck-demo") {
      for (const [email, role] of [
        ["operaciones@panatruck.local", "OPERATIONS_MANAGER"],
        ["despacho@panatruck.local", "DISPATCHER"],
        ["conductor1@panatruck.local", "DRIVER"],
      ] as const) {
        await prisma.tenantMembership.upsert({
          where: { tenantId_userId_role: { tenantId: tenant.id, userId: users[email].id, role } },
          update: { active: true },
          create: { tenantId: tenant.id, userId: users[email].id, role },
        });
      }
    }

    const serviceTypes = [
      ["CONTAINER", "Transporte de contenedor"],
      ["FUEL", "Transporte de combustible"],
      ["SPECIAL", "Carga terrestre o especial"],
    ] as const;
    const createdTypes = [];
    for (const [code, name] of serviceTypes) {
      createdTypes.push(
        await prisma.serviceType.upsert({
          where: { tenantId_code: { tenantId: tenant.id, code } },
          update: { name, active: true },
          create: { tenantId: tenant.id, code, name, optionalFields: {}, requiredDocs: ["orden", "evidencia"] },
        }),
      );
    }

    const customerAccounts = [];
    for (let index = 0; index < tenantInput.customers.length; index += 1) {
      const name = tenantInput.customers[index];
      const customer = await prisma.customerAccount.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: `CUST-${index + 1}` } },
        update: { name },
        create: { tenantId: tenant.id, code: `CUST-${index + 1}`, name },
      });
      customerAccounts.push(customer);
    }
    const customerUser = users[tenantInput.customerUser];
    await prisma.customerMembership.upsert({
      where: { customerAccountId_userId_role: { customerAccountId: customerAccounts[0].id, userId: customerUser.id, role: "CUSTOMER_ADMIN" } },
      update: { active: true },
      create: { tenantId: tenant.id, customerAccountId: customerAccounts[0].id, userId: customerUser.id, role: "CUSTOMER_ADMIN" },
    });

    for (let index = 1; index <= 5; index += 1) {
      await prisma.vehicle.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: `VH-${index}` } },
        update: {},
        create: { tenantId: tenant.id, code: `VH-${index}`, plate: `${tenantInput.slug.slice(0, 3).toUpperCase()}-${100 + index}`, type: index % 2 ? "Tracto camion" : "Camion rigido" },
      });
      await prisma.equipment.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: `EQ-${index}` } },
        update: {},
        create: { tenantId: tenant.id, code: `EQ-${index}`, type: index % 2 ? "Chasis portacontenedor" : "Tanque demo" },
      });
      const linkedUser = index === 1 && tenantInput.slug === "panatruck-demo" ? users["conductor1@panatruck.local"].id : undefined;
      await prisma.driver.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: `DR-${index}` } },
        update: { userId: linkedUser },
        create: {
          tenantId: tenant.id,
          userId: linkedUser,
          code: `DR-${index}`,
          name: `${tenantInput.name} Conductor ${index}`,
          phone: `+507 6000-00${index}`,
          license: `LIC-${tenantInput.slug}-${index}`,
          authorizations: ["CONTAINER", "FUEL", "SPECIAL"],
        },
      });
    }

    const vehicles = await prisma.vehicle.findMany({ where: { tenantId: tenant.id }, orderBy: { code: "asc" } });
    const equipment = await prisma.equipment.findMany({ where: { tenantId: tenant.id }, orderBy: { code: "asc" } });
    const drivers = await prisma.driver.findMany({ where: { tenantId: tenant.id }, orderBy: { code: "asc" } });
    const statuses = ["REQUESTED", "CONFIRMED", "ASSIGNED", "DRIVER_CONFIRMED", "IN_TRANSIT", "ARRIVED_AT_DESTINATION", "EVIDENCE_SUBMITTED", "CLOSED", "ASSIGNED", "IN_TRANSIT"] as const;

    for (let index = 1; index <= tenantInput.tripCount; index += 1) {
      const customer = customerAccounts[(index - 1) % customerAccounts.length];
      const type = createdTypes[(index - 1) % createdTypes.length];
      const status = statuses[(index - 1) % statuses.length];
      const request = await prisma.serviceRequest.upsert({
        where: { tenantId_reference: { tenantId: tenant.id, reference: `${tenant.slug.toUpperCase()}-SR-${String(index).padStart(4, "0")}` } },
        update: {},
        create: {
          tenantId: tenant.id,
          customerAccountId: customer.id,
          serviceTypeId: type.id,
          reference: `${tenant.slug.toUpperCase()}-SR-${String(index).padStart(4, "0")}`,
          status: "CONVERTED",
          origin: index % 2 ? "Manzanillo International Terminal" : "Bahia Las Minas",
          destination: index % 2 ? "Puerto de Balboa" : "Aeropuerto de Tocumen",
          requestedDate: new Date(Date.now() + index * 60 * 60 * 1000),
          cargoDetails: { demo: true, container: `NCIU${100000 + index}` },
        },
      });

      const trip = await prisma.trip.upsert({
        where: { tenantId_reference: { tenantId: tenant.id, reference: `${tenant.slug.toUpperCase()}-TR-${String(index).padStart(4, "0")}` } },
        update: {
          status,
          customerVisibleStatus: status === "CLOSED" ? "Servicio cerrado" : status === "IN_TRANSIT" ? "En transito" : "Servicio confirmado",
        },
        create: {
          tenantId: tenant.id,
          customerAccountId: customer.id,
          serviceRequestId: request.id,
          serviceTypeId: type.id,
          vehicleId: vehicles[(index - 1) % vehicles.length].id,
          equipmentId: equipment[(index - 1) % equipment.length].id,
          driverId: drivers[(index - 1) % drivers.length].id,
          reference: `${tenant.slug.toUpperCase()}-TR-${String(index).padStart(4, "0")}`,
          status,
          origin: request.origin,
          destination: request.destination,
          scheduledAt: request.requestedDate,
          eta: new Date(request.requestedDate.getTime() + 4 * 60 * 60 * 1000),
          routePoints: [
            { label: request.origin, lat: 9.36, lng: -79.88 },
            { label: "Las Cumbres", lat: 9.09, lng: -79.54 },
            { label: request.destination, lat: 8.95, lng: -79.56 },
          ],
          simulationStartedAt: status === "IN_TRANSIT" ? new Date(Date.now() - 30 * 60 * 1000) : null,
          expectedDuration: 7200,
          customerVisibleStatus: status === "CLOSED" ? "Servicio cerrado" : status === "IN_TRANSIT" ? "En transito" : "Servicio confirmado",
          proofReady: status === "CLOSED",
        },
      });

      if ((await prisma.tripEvent.count({ where: { tripId: trip.id } })) === 0) {
        await prisma.tripEvent.create({
          data: {
            tenantId: tenant.id,
            tripId: trip.id,
            toStatus: status,
            note: "Evento demo inicial.",
            visibleToCustomer: true,
          },
        });
      }

      if (status === "CLOSED") {
        await prisma.proofOfDelivery.upsert({
          where: { tripId: trip.id },
          update: {},
          create: {
            tenantId: tenant.id,
            tripId: trip.id,
            receiverName: "Receptor Demo",
            observation: "Entrega demo validada.",
            approvedAt: new Date(),
            signatureSvg: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"360\" height=\"120\"><path d=\"M20 80 C 80 20, 160 120, 240 55 S 330 70, 345 42\" fill=\"none\" stroke=\"#0f2d46\" stroke-width=\"5\"/></svg>",
          },
        });
      }
    }

    const incidentTrip = await prisma.trip.findFirst({ where: { tenantId: tenant.id, status: "IN_TRANSIT" } });
    if (incidentTrip) {
      await prisma.incident.upsert({
        where: { id: `${tenant.id.slice(0, 8)}-0000-4000-8000-000000000001` },
        update: {},
        create: {
          id: `${tenant.id.slice(0, 8)}-0000-4000-8000-000000000001`,
          tenantId: tenant.id,
          customerAccountId: incidentTrip.customerAccountId,
          tripId: incidentTrip.id,
          category: "Retraso",
          priority: "MEDIUM",
          internalDescription: "Demora demo por espera operativa.",
          customerMessage: "El servicio presenta una demora controlada. Operaciones esta dando seguimiento.",
          visibleToCustomer: true,
        },
      });
    }

    await prisma.notificationDelivery.upsert({
      where: { id: demoUuid(tenant.id, "0000-4000-8000-000000000101") },
      update: {},
      create: {
          id: demoUuid(tenant.id, "0000-4000-8000-000000000101"),
          tenantId: tenant.id,
          channel: "PORTAL",
          status: "SENT",
          subject: "Servicio confirmado",
          body: "Notificacion demo visible en portal.",
          recipient: "portal",
      },
    });
    await prisma.notificationDelivery.upsert({
      where: { id: demoUuid(tenant.id, "0000-4000-8000-000000000102") },
      update: {},
      create: {
          id: demoUuid(tenant.id, "0000-4000-8000-000000000102"),
          tenantId: tenant.id,
          channel: "MOCK_WHATSAPP",
          status: "DELIVERED",
          subject: "Unidad asignada",
          body: "Mensaje simulado de WhatsApp.",
          recipient: "+50760000000",
      },
    });

    await prisma.auditLog.upsert({
      where: { id: demoUuid(tenant.id, "0000-4000-8000-000000000201") },
      update: {},
      create: {
        id: demoUuid(tenant.id, "0000-4000-8000-000000000201"),
        tenantId: tenant.id,
        action: "demo.seed",
        entity: "Tenant",
        entityId: tenant.id,
        after: { slug: tenant.slug, seeded: true },
      },
    });
  }

  console.log("Seed completed. Demo credentials are documented in README.md.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
