import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma";

// Precedencia: variables exportadas > .env.local > .env (dotenv no pisa lo ya definido).
config({ path: ".env.local" });
config({ path: ".env" });

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { isDemo: true },
    select: { id: true, slug: true, name: true },
  });

  if (tenants.length === 0) {
    console.log("No demo tenants found.");
    return;
  }

  for (const tenant of tenants) {
    console.log(`\nResetting demo data for ${tenant.name} (${tenant.slug})...`);

    const deleted = await Promise.all([
      prisma.aiInvocation.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.aiUsageDaily.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.driverAssignmentRecommendation.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.tripRouteEstimate.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.driverWorkSchedule.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.driverAvailabilityException.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.tripStop.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.operationalAlert.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.tenantFeedback.deleteMany({ where: { tenantId: tenant.id } }),
      prisma.tenantAiSetting.deleteMany({ where: { tenantId: tenant.id } }),
    ]);

    const labels = [
      "AI invocations", "AI usage daily", "recommendations",
      "route estimates", "work schedules", "availability exceptions",
      "trip stops", "alerts", "feedback", "AI settings",
    ];
    deleted.forEach((r, i) => {
      if (r.count > 0) console.log(`  - ${r.count} ${labels[i]} eliminados`);
    });
  }

  console.log("\nDemo data reset. Run `pnpm demo:seed` to re-populate.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
