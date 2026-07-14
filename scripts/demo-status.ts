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
    console.log(`\n=== ${tenant.name} (${tenant.slug}) ===`);

    const [
      users, drivers, trips, vehicles, customers,
      schedules, estimates, recommendations,
      incidents, feedback, alerts,
      aiSetting, aiInvocations, aiUsage,
    ] = await Promise.all([
      prisma.tenantMembership.count({ where: { tenantId: tenant.id } }),
      prisma.driver.count({ where: { tenantId: tenant.id } }),
      prisma.trip.count({ where: { tenantId: tenant.id } }),
      prisma.vehicle.count({ where: { tenantId: tenant.id } }),
      prisma.customerAccount.count({ where: { tenantId: tenant.id } }),
      prisma.driverWorkSchedule.count({ where: { tenantId: tenant.id } }),
      prisma.tripRouteEstimate.count({ where: { tenantId: tenant.id } }),
      prisma.driverAssignmentRecommendation.count({ where: { tenantId: tenant.id } }),
      prisma.incident.count({ where: { tenantId: tenant.id } }),
      prisma.tenantFeedback.count({ where: { tenantId: tenant.id } }),
      prisma.operationalAlert.count({ where: { tenantId: tenant.id } }),
      prisma.tenantAiSetting.findUnique({ where: { tenantId: tenant.id } }),
      prisma.aiInvocation.count({ where: { tenantId: tenant.id } }),
      prisma.aiUsageDaily.findFirst({ where: { tenantId: tenant.id }, orderBy: { date: "desc" } }),
    ]);

    console.log(`  Usuarios:          ${users}`);
    console.log(`  Conductores:       ${drivers}`);
    console.log(`  Vehiculos:         ${vehicles}`);
    console.log(`  Clientes:          ${customers}`);
    console.log(`  Viajes:            ${trips}`);
    console.log(`  Horarios:          ${schedules}`);
    console.log(`  Estimaciones ruta: ${estimates}`);
    console.log(`  Recomendaciones:   ${recommendations}`);
    console.log(`  Incidencias:       ${incidents}`);
    console.log(`  Feedback:          ${feedback}`);
    console.log(`  Alertas:           ${alerts}`);
    console.log(`  IA habilitada:     ${aiSetting?.enabled ?? false}`);
    console.log(`  Invocaciones IA:   ${aiInvocations}`);
    if (aiUsage) {
      console.log(`  Uso IA ultimo dia: ${aiUsage.requestCount} req, ${aiUsage.successCount} ok, ${aiUsage.failureCount} fail`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
