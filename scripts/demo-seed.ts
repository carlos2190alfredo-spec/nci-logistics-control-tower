import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma";
import { guardDbTarget } from "./lib/db-target";

// Precedencia: variables exportadas > .env.local > .env (dotenv no pisa lo ya definido).
config({ path: ".env.local" });
config({ path: ".env" });

const prisma = new PrismaClient();

async function main() {
  // Muestra el destino y se niega a correr el perfil local contra un host remoto (F4).
  guardDbTarget("demo", "demo:seed");

  const tenants = await prisma.tenant.findMany({
    where: { isDemo: true },
    select: { id: true, slug: true, name: true },
  });

  if (tenants.length === 0) {
    console.log("No demo tenants found. Run `pnpm db:seed` first.");
    return;
  }

  for (const tenant of tenants) {
    console.log(`\nSeeding demo data for ${tenant.name} (${tenant.slug})...`);

    const drivers = await prisma.driver.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    });

    for (const driver of drivers) {
      const existing = await prisma.driverWorkSchedule.count({ where: { driverId: driver.id } });
      if (existing > 0) continue;
      for (const day of ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const) {
        await prisma.driverWorkSchedule.create({
          data: {
            tenantId: tenant.id,
            driverId: driver.id,
            dayOfWeek: day,
            startTimeLocal: "06:00",
            endTimeLocal: "18:00",
          },
        });
      }
    }
    console.log(`  - ${drivers.length} conductores con horarios laborales`);

    const trips = await prisma.trip.findMany({
      where: { tenantId: tenant.id, status: { notIn: ["CANCELLED", "CLOSED"] } },
      select: { id: true, origin: true, destination: true },
      take: 5,
    });

    let estimatesCreated = 0;
    for (const trip of trips) {
      const existing = await prisma.tripRouteEstimate.count({ where: { tripId: trip.id } });
      if (existing > 0) continue;
      await prisma.tripRouteEstimate.create({
        data: {
          tenantId: tenant.id,
          tripId: trip.id,
          provider: "SIMULATED",
          status: "ESTIMATED",
          distanceMeters: 85000 + Math.floor(Math.random() * 50000),
          durationSeconds: 5400 + Math.floor(Math.random() * 3600),
          calculatedAt: new Date(),
        },
      });
      estimatesCreated++;
    }
    console.log(`  - ${estimatesCreated} estimaciones de ruta creadas`);

    let recsCreated = 0;
    for (const trip of trips) {
      const existing = await prisma.driverAssignmentRecommendation.count({ where: { tripId: trip.id } });
      if (existing > 0) continue;

      for (let i = 0; i < Math.min(drivers.length, 3); i++) {
        await prisma.driverAssignmentRecommendation.create({
          data: {
            tenantId: tenant.id,
            tripId: trip.id,
            driverId: drivers[i].id,
            score: 90 - i * 15,
            rank: i + 1,
            riskLevel: i === 0 ? "LOW" : i === 1 ? "MEDIUM" : "HIGH",
            recommendationTitle: `Recomendacion #${i + 1} para viaje`,
            explanation: `Conductor ${drivers[i].code} ${i === 0 ? "tiene mejor puntuacion por disponibilidad y experiencia" : "es una alternativa viable"}.`,
            reasonsJson: [
              "Horario compatible",
              i === 0 ? "Sin conflictos" : "Un conflicto menor",
              "Vehiculo compatible",
            ],
            warningsJson: i > 0 ? ["Carga moderada"] : [],
            status: "GENERATED",
            generatedBy: "RULES_ENGINE",
          },
        });
        recsCreated++;
      }
    }
    console.log(`  - ${recsCreated} recomendaciones de conductor creadas`);

    // Trip stops (at least one trip with multiple stops)
    let stopsCreated = 0;
    if (trips.length > 0) {
      const firstTrip = trips[0];
      const existingStops = await prisma.tripStop.count({ where: { tripId: firstTrip.id } });
      if (existingStops === 0) {
        const stops = [
          { type: "START" as const, seq: 1, label: "Terminal de origen", addr: firstTrip.origin },
          { type: "PICKUP" as const, seq: 2, label: "Recogida en almacen", addr: "Almacen Central, Panama" },
          { type: "DELIVERY" as const, seq: 3, label: "Entrega parcial", addr: "Centro Logistico Norte" },
          { type: "DELIVERY" as const, seq: 4, label: "Entrega final", addr: firstTrip.destination },
        ];
        for (const s of stops) {
          await prisma.tripStop.create({
            data: {
              tenantId: tenant.id,
              tripId: firstTrip.id,
              type: s.type,
              sequence: s.seq,
              label: s.label,
              addressText: s.addr,
            },
          });
          stopsCreated++;
        }
      }
    }
    console.log(`  - ${stopsCreated} paradas de viaje creadas`);

    // Availability exceptions
    let exceptionsCreated = 0;
    if (drivers.length >= 2) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(0, 0, 0, 0);

      const existingExceptions = await prisma.driverAvailabilityException.count({
        where: { tenantId: tenant.id },
      });
      if (existingExceptions === 0) {
        await prisma.driverAvailabilityException.create({
          data: {
            tenantId: tenant.id,
            driverId: drivers[0].id,
            date: tomorrow,
            type: "DAY_OFF",
            reason: "Dia libre programado demo",
          },
        });
        await prisma.driverAvailabilityException.create({
          data: {
            tenantId: tenant.id,
            driverId: drivers[1].id,
            date: nextWeek,
            type: "VACATION",
            reason: "Vacaciones demo",
          },
        });
        exceptionsCreated = 2;
      }
    }
    console.log(`  - ${exceptionsCreated} excepciones de disponibilidad creadas`);

    // Integration connectors (global, not per tenant — only seed once)
    const existingConnectors = await prisma.integrationConnector.count();
    if (existingConnectors === 0) {
      const connectors = [
        { type: "GPS" as const, name: "GPS Disabled", description: "Proveedor GPS desactivado por diseno", enabled: false },
        { type: "WHATSAPP" as const, name: "WhatsApp Disabled", description: "Notificaciones WhatsApp desactivadas", enabled: false },
        { type: "CRM" as const, name: "CRM Disabled", description: "Integracion CRM desactivada", enabled: false },
        { type: "BILLING" as const, name: "Billing Disabled", description: "Facturacion electronica desactivada", enabled: false },
        { type: "AI" as const, name: "AI Rules Engine", description: "Motor de reglas determinista local", enabled: true },
      ];
      for (const c of connectors) {
        await prisma.integrationConnector.create({ data: c });
      }
      console.log(`  - ${connectors.length} conectores de integracion creados`);
    }

    await prisma.tenantAiSetting.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: { tenantId: tenant.id, enabled: true, config: {} },
    });
    console.log(`  - AI habilitada para tenant`);

    const owner = await prisma.tenantMembership.findFirst({
      where: { tenantId: tenant.id, role: "TENANT_OWNER" },
      select: { userId: true },
    });
    if (owner) {
      const feedbackTypes = ["BUG", "FEATURE_REQUEST", "UX", "PERFORMANCE", "OTHER", "INTEGRATION"] as const;
      let feedbackCreated = 0;
      const existingFeedback = await prisma.tenantFeedback.count({ where: { tenantId: tenant.id } });
      if (existingFeedback === 0) {
        const titles = [
          "Mejorar notificaciones de ETA",
          "Excelente servicio de seguimiento",
          "Problema con evidencia fotografica",
          "Solicitar mas opciones de ruta",
          "Conductor muy profesional",
          "Demora en la confirmacion del servicio",
        ];
        for (let i = 0; i < 6; i++) {
          await prisma.tenantFeedback.create({
            data: {
              tenantId: tenant.id,
              userId: owner.userId,
              type: feedbackTypes[i % feedbackTypes.length],
              title: titles[i],
              description: `Feedback demo ${i + 1} para pruebas del copiloto.`,
              status: i < 3 ? "SUBMITTED" : "IN_REVIEW",
            },
          });
          feedbackCreated++;
        }
      }
      console.log(`  - ${feedbackCreated} feedback entries creados`);
    }
  }

  console.log("\nDemo data seeded successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
