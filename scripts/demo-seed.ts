import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

async function main() {
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
