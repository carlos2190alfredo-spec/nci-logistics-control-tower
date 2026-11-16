import { getDb } from "@/lib/server/db";
import type { StartupCounts } from "@/lib/onboarding/startup-steps";

/** Conteos de la lista de arranque: una sola rafaga de `count`, siempre acotada por `tenantId`. */
export async function getStartupCounts(tenantId: string): Promise<StartupCounts> {
  const db = getDb();
  const [serviceTypes, serviceTypesRequiringEquipment, customers, vehicles, equipment, drivers, trips] = await Promise.all([
    db.serviceType.count({ where: { tenantId, active: true } }),
    db.serviceType.count({ where: { tenantId, active: true, requiresEquipment: true } }),
    db.customerAccount.count({ where: { tenantId, active: true } }),
    db.vehicle.count({ where: { tenantId, status: { not: "INACTIVE" } } }),
    db.equipment.count({ where: { tenantId, status: { not: "INACTIVE" } } }),
    db.driver.count({ where: { tenantId, status: { not: "INACTIVE" } } }),
    db.trip.count({ where: { tenantId } }),
  ]);
  return { serviceTypes, serviceTypesRequiringEquipment, customers, vehicles, equipment, drivers, trips };
}
