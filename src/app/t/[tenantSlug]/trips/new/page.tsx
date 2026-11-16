import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Plus, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { EmptyState, PageHeader, buttonStyles } from "@/components/ui";
import { NewTripForm } from "@/components/trips/new-trip-form";
import { toTenantLocalInput } from "@/lib/datetime";
import { requireTenantPermission } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { createTripByOperationsAction } from "@/lib/server/trip-create-actions";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nuevo viaje" };

export default async function NewTripPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.trips.create");
  const db = getDb();

  const [customers, serviceTypes, locations] = await Promise.all([
    db.customerAccount.findMany({
      where: { tenantId: tenant.id, active: true },
      select: { id: true, name: true, contactName: true, contactPhone: true },
      orderBy: { name: "asc" },
    }),
    db.serviceType.findMany({
      where: { tenantId: tenant.id, active: true },
      select: { id: true, name: true, requiresEquipment: true },
      orderBy: { name: "asc" },
    }),
    db.location.findMany({
      where: { tenantId: tenant.id, active: true },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  const canManageCatalogs = hasPermission(membership.role, "tenant.catalogs.manage");
  const now = new Date();
  // Proxima hora en punto, en hora de Panama.
  const nextHour = new Date(Math.ceil((now.getTime() + 60_000) / 3_600_000) * 3_600_000);

  const missingCustomers = customers.length === 0;
  const missingServices = serviceTypes.length === 0;

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid max-w-3xl gap-6 [&>*]:min-w-0">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Viajes", href: `/t/${tenantSlug}/trips` },
            { label: "Nuevo viaje" },
          ]}
          description="Registre un pedido que le llegó por teléfono, WhatsApp o correo. Después asigne la unidad y el conductor."
          title="Nuevo viaje"
        />

        {missingCustomers || missingServices ? (
          <EmptyState
            action={
              canManageCatalogs ? (
                <Link
                  className={buttonStyles({ size: "md" })}
                  href={`/t/${tenantSlug}/${missingCustomers ? "customers" : "services"}`}
                >
                  <Plus aria-hidden className="size-4" />
                  {missingCustomers ? "Registrar un cliente" : "Agregar tipos de servicio"}
                </Link>
              ) : undefined
            }
            description={
              canManageCatalogs
                ? missingCustomers
                  ? "Para crear un viaje primero necesita al menos un cliente."
                  : "Para crear un viaje primero necesita al menos un tipo de servicio."
                : "Falta un cliente o un tipo de servicio. Pídale al propietario o a operaciones que lo registre."
            }
            icon={<Users />}
            title={missingCustomers ? "Todavía no hay clientes" : "Todavía no hay tipos de servicio"}
          />
        ) : (
          <NewTripForm
            action={createTripByOperationsAction.bind(null, tenantSlug)}
            clientRequestKey={randomUUID()}
            customers={customers}
            defaultScheduledAt={toTenantLocalInput(nextHour)}
            minScheduledAt={toTenantLocalInput(now)}
            places={locations.map((place) => place.name)}
            serviceTypes={serviceTypes}
          />
        )}
      </div>
    </AppShell>
  );
}
