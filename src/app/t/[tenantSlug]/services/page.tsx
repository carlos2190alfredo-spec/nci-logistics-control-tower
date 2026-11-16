import Link from "next/link";
import { ListChecks } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { ServiceTypeForm } from "@/components/catalog/catalog-forms";
import {
  Card, CardHeader, DataTable, EmptyState, PageHeader, PageNotice, StatusBadge, SubmitButton,
  TableBody, TableCell, TableHead, TableHeaderCell, TableRow,
} from "@/components/ui";
import { templatesToLoad } from "@/lib/catalog/service-type-templates";
import { requireTenantPermission } from "@/lib/server/auth";
import { createServiceTypeAction, loadServiceTypeTemplatesAction } from "@/lib/server/catalog-actions";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { catalogNotices } from "@/lib/ui/catalog-notices";
import { tenantRoleLabel } from "@/lib/ui/status";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tipos de servicio" };

export default async function ServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.view");
  const sp = await searchParams;
  const canManage = hasPermission(membership.role, "tenant.catalogs.manage");
  const types = await getDb().serviceType.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } });
  const missingTemplates = templatesToLoad(types.map((type) => type.code));

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6 [&>*]:min-w-0">
        <PageHeader
          breadcrumbs={[{ label: tenant.name, href: `/t/${tenantSlug}` }, { label: "Tipos de servicio" }]}
          description="Lo que su empresa ofrece. Cada tipo define si el viaje necesita chasis o remolque."
          title="Tipos de servicio"
        />
        <PageNotice code={sp.aviso} messages={catalogNotices} />

        {canManage && missingTemplates.length > 0 ? (
          <Card>
            <CardHeader
              description="Puede agregarlos todos y luego ajustar o inactivar los que no use."
              icon={<ListChecks />}
              title="Tipos sugeridos"
            />
            <ul className="mt-3 grid gap-1 text-sm text-muted-foreground">
              {missingTemplates.map((template) => (
                <li key={template.code}>
                  {template.name} — {template.requiresEquipment ? "usa chasis o remolque" : "sin chasis ni remolque"}
                </li>
              ))}
            </ul>
            <form action={loadServiceTypeTemplatesAction.bind(null, tenantSlug)} className="mt-4">
              <SubmitButton>Agregar los tipos sugeridos</SubmitButton>
            </form>
          </Card>
        ) : null}

        {canManage ? (
          <Card>
            <CardHeader icon={<ListChecks />} title="Crear un tipo propio" />
            <div className="mt-4">
              <ServiceTypeForm action={createServiceTypeAction.bind(null, tenantSlug)} mode="create" />
            </div>
          </Card>
        ) : null}

        {types.length === 0 ? (
          <EmptyState
            description={canManage ? "Agregue los tipos sugeridos o cree uno propio para poder crear viajes." : "Pídale al propietario o a operaciones que los agregue."}
            icon={<ListChecks />}
            title="Todavía no tiene tipos de servicio"
          />
        ) : (
          <Card>
            <DataTable caption="Tipos de servicio de la empresa">
              <TableHead>
                <tr>
                  <TableHeaderCell>Servicio</TableHeaderCell>
                  <TableHeaderCell>Chasis o remolque</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell><span className="sr-only">Acciones</span></TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {types.map((type) => (
                  <TableRow data-testid={`service-type-row-${type.id}`} key={type.id}>
                    <TableCell>
                      <span className="block font-semibold text-foreground">{type.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{type.code}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={type.requiresEquipment ? "Requerido" : "No necesario"} tone={type.requiresEquipment ? "info" : "neutral"} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={type.active ? "Activo" : "Inactivo"} tone={type.active ? "success" : "neutral"} />
                    </TableCell>
                    <TableCell>
                      <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`/t/${tenantSlug}/services/${type.id}`}>
                        Editar<span className="sr-only"> {type.name}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
