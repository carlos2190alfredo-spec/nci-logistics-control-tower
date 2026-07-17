import { Route } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { TripOperationsCard } from "@/components/operations/trip-operations-card";
import { requireTenantMembership } from "@/lib/server/auth";
import {
  getTenantActiveTrips,
  getTenantDrivers,
  getTenantEquipment,
  getTenantVehicles,
} from "@/lib/server/tenant-dashboard-data";
import { getTripsEligibility } from "@/lib/server/compliance-data";
import { getBlockedAssets } from "@/lib/server/maintenance-data";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

export default async function TenantTripsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const [trips, vehicles, equipment, drivers, blockedAssets] = await Promise.all([
    getTenantActiveTrips(tenant.id),
    getTenantVehicles(tenant.id),
    getTenantEquipment(tenant.id),
    getTenantDrivers(tenant.id),
    getBlockedAssets(tenant.id),
  ]);

  // Elegibilidad advisory (no bloquea): una sola consulta para todos los viajes.
  const eligibility = await getTripsEligibility(
    tenant.id,
    trips.map((t) => ({
      id: t.id,
      driver: t.driver ? { code: t.driver.code } : null,
      vehicle: t.vehicle ? { code: t.vehicle.code, plate: t.vehicle.plate } : null,
    })),
  );

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Viajes activos" },
          ]}
          description={
            trips.length === 0
              ? "No hay servicios en curso."
              : `${trips.length} servicio(s) en curso, ordenados por fecha programada.`
          }
          meta={<StatusBadge label="Operacion en vivo" pulse tone="success" />}
          title="Viajes activos"
        />

        {trips.length ? (
          <div className="grid gap-4">
            {trips.map((trip, i) => (
              <TripOperationsCard
                blockedAssets={blockedAssets}
                drivers={drivers}
                eligibilityLight={eligibility.get(trip.id)}
                equipment={equipment}
                index={i}
                key={trip.id}
                role={membership.role}
                tenantSlug={tenantSlug}
                trip={trip}
                vehicles={vehicles}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            description="Confirme una solicitud de cliente para iniciar un nuevo servicio."
            icon={<Route />}
            title="No hay viajes activos"
          />
        )}
      </div>
    </AppShell>
  );
}
