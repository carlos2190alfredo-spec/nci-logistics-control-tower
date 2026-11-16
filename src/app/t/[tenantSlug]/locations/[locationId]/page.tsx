import { notFound } from "next/navigation";
import { Power, MapPin } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { LocationForm } from "@/components/catalog/catalog-forms";
import { Card, CardHeader, ConfirmSubmit, PageHeader, PageNotice, StatusBadge } from "@/components/ui";
import { requireTenantPermission } from "@/lib/server/auth";
import { updateLocationAction, setLocationActiveAction } from "@/lib/server/catalog-actions";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { catalogNotices } from "@/lib/ui/catalog-notices";
import { tenantRoleLabel } from "@/lib/ui/status";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; locationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug, locationId } = await params;
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.view");
  const sp = await searchParams;
  if (!UUID.test(locationId)) notFound();
  const item = await getDb().location.findFirst({ where: { id: locationId, tenantId: tenant.id } });
  if (!item) notFound();
  const canManage = hasPermission(membership.role, "tenant.catalogs.manage");

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
            { label: "Lugares", href: `/t/${tenantSlug}/locations` },
            { label: item.name },
          ]}
          meta={<StatusBadge label={item.active ? "Activo" : "Inactivo"} tone={item.active ? "success" : "neutral"} />}
          title={item.name}
        />
        <PageNotice code={sp.aviso} messages={catalogNotices} />

        <Card>
          <CardHeader icon={<MapPin />} title="Datos" />
          <div className="mt-4 grid gap-4">
            
            {canManage ? (
              <LocationForm action={updateLocationAction.bind(null, tenantSlug, item.id)} initial={{ name: item.name, address: item.address }} mode="edit" />
            ) : null}
          </div>
        </Card>

        {canManage ? (
          <Card>
            <CardHeader description="Un lugar inactivo ya no se sugiere al crear viajes; los viajes existentes no cambian." icon={<Power />} title="Estado" />
            <form action={setLocationActiveAction.bind(null, tenantSlug, item.id, !item.active)} className="mt-4">
              <ConfirmSubmit
                confirmLabel={item.active ? "Sí, inactivar" : "Sí, reactivar"}
                label={item.active ? "Inactivar" : "Reactivar"}
                message={item.active ? `¿Inactivar ${item.name}?` : `¿Reactivar ${item.name}?`}
                variant={item.active ? "danger" : "primary"}
              />
            </form>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
