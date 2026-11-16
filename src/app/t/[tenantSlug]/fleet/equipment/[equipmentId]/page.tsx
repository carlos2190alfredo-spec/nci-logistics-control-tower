import { notFound } from "next/navigation";
import { Truck, Power } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { EquipmentForm } from "@/components/fleet/fleet-forms";
import { Card, CardHeader, ConfirmSubmit, DefinitionList, PageHeader, PageNotice, StatusBadge } from "@/components/ui";
import { assetStatusText, assetStatusToneFor } from "@/lib/catalog/labels";
import { requireTenantPermission } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { updateEquipmentAction, setAssetActiveAction } from "@/lib/server/fleet-actions";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { fleetNotices } from "@/lib/ui/fleet-notices";
import { tenantRoleLabel } from "@/lib/ui/status";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; equipmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug, equipmentId } = await params;
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.view");
  const sp = await searchParams;
  if (!UUID.test(equipmentId)) notFound();
  const asset = await getDb().equipment.findFirst({ where: { id: equipmentId, tenantId: tenant.id } });
  if (!asset) notFound();
  const canManage = hasPermission(membership.role, "tenant.catalogs.manage");
  const inactive = asset.status === "INACTIVE";
  const title = asset.code;

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
            { label: "Flota", href: `/t/${tenantSlug}/fleet?vista=equipos` },
            { label: title },
          ]}
          meta={<StatusBadge label={assetStatusText(asset.status)} tone={assetStatusToneFor(asset.status)} />}
          title={title}
        />
        <PageNotice code={sp.aviso} messages={fleetNotices} />

        <Card>
          <CardHeader icon={<Truck />} title="Datos" />
          <div className="mt-4 grid gap-4">
            <DefinitionList items={[{ term: "Código", description: asset.code }]} />
            <p className="text-xs text-muted-foreground">
              El código no se puede cambiar: sus documentos y órdenes de mantenimiento se vinculan por este código.
            </p>
            {canManage ? (
              <EquipmentForm
                action={updateEquipmentAction.bind(null, tenantSlug, asset.id)}
                initial={{ type: asset.type }}
                mode="edit"
              />
            ) : null}
          </div>
        </Card>

        {canManage ? (
          <Card>
            <CardHeader
              description={
                inactive
                  ? "Al reactivarlo vuelve a aparecer al asignar viajes."
                  : "Un registro inactivo ya no aparece al asignar viajes; su historial se conserva. No se puede inactivar si tiene viajes activos."
              }
              icon={<Power />}
              title="Estado"
            />
            <form action={setAssetActiveAction.bind(null, tenantSlug, "equipment", asset.id, inactive)} className="mt-4">
              <ConfirmSubmit
                confirmLabel={inactive ? "Sí, reactivar" : "Sí, inactivar"}
                label={inactive ? "Reactivar" : "Inactivar"}
                message={inactive ? `¿Reactivar ${title}?` : `¿Inactivar ${title}?`}
                variant={inactive ? "primary" : "danger"}
              />
            </form>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
