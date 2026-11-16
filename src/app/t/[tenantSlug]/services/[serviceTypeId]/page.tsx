import { notFound } from "next/navigation";
import { Power, ListChecks } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { ServiceTypeForm } from "@/components/catalog/catalog-forms";
import { Card, CardHeader, ConfirmSubmit, DefinitionList, PageHeader, PageNotice, StatusBadge } from "@/components/ui";
import { requireTenantPermission } from "@/lib/server/auth";
import { updateServiceTypeAction, setServiceTypeActiveAction } from "@/lib/server/catalog-actions";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { catalogNotices } from "@/lib/ui/catalog-notices";
import { tenantRoleLabel } from "@/lib/ui/status";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ServiceTypeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; serviceTypeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug, serviceTypeId } = await params;
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.view");
  const sp = await searchParams;
  if (!UUID.test(serviceTypeId)) notFound();
  const item = await getDb().serviceType.findFirst({ where: { id: serviceTypeId, tenantId: tenant.id } });
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
            { label: "Tipos de servicio", href: `/t/${tenantSlug}/services` },
            { label: item.name },
          ]}
          meta={<StatusBadge label={item.active ? "Activo" : "Inactivo"} tone={item.active ? "success" : "neutral"} />}
          title={item.name}
        />
        <PageNotice code={sp.aviso} messages={catalogNotices} />

        <Card>
          <CardHeader icon={<ListChecks />} title="Datos" />
          <div className="mt-4 grid gap-4">
            <DefinitionList items={[{ term: "Código", description: item.code }]} />
            <p className="text-xs text-muted-foreground">El código no se puede cambiar: se usa para autorizar conductores a este servicio.</p>
            {canManage ? (
              <ServiceTypeForm action={updateServiceTypeAction.bind(null, tenantSlug, item.id)} initial={{ name: item.name, requiresEquipment: item.requiresEquipment }} mode="edit" />
            ) : null}
          </div>
        </Card>

        {canManage ? (
          <Card>
            <CardHeader description="Un servicio inactivo ya no se puede elegir en viajes nuevos; los viajes existentes no cambian." icon={<Power />} title="Estado" />
            <form action={setServiceTypeActiveAction.bind(null, tenantSlug, item.id, !item.active)} className="mt-4">
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
