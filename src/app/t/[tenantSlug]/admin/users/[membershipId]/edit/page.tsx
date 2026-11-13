import { Edit } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  Field,
  PageHeader,
  SelectField,
  SubmitButton,
} from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { updateTenantUserAction } from "@/lib/server/tenant-user-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function EditTenantUserPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; membershipId: string }>;
}) {
  const { tenantSlug, membershipId } = await params;
  const { user, tenant, membership: viewer } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);
  const db = getDb();

  const membership = await db.tenantMembership.findFirst({
    where: { id: membershipId, tenantId: tenant.id },
    include: { user: true },
  });
  if (!membership) notFound();

  const boundAction = updateTenantUserAction.bind(null, tenantSlug, membershipId);

  return (
    <AppShell
      brandContext={tenant.name}
      brandName="Administracion"
      navGroups={getTenantAdminNavGroups(tenantSlug)}
      user={{ name: user.name, role: "Administrador" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Admin", href: `/t/${tenantSlug}/admin` },
            { label: "Usuarios", href: `/t/${tenantSlug}/admin/users` },
            { label: membership.user.name },
          ]}
          description={`Editando ${membership.user.email}`}
          title="Editar usuario"
        />

        <Card className="max-w-lg">
          <CardHeader
            description="Modifique los datos del usuario."
            icon={<Edit />}
            title="Datos del usuario"
          />
          <form action={boundAction} className="mt-4 grid gap-4">
            <Field defaultValue={membership.user.name} label="Nombre completo" name="name" />
            <SelectField defaultValue={membership.role} label="Rol" name="role">
              {/* Sin esta opcion el navegador enviaria TENANT_ADMIN al editar a un propietario.
                  Solo un propietario puede verla/asignarla; el servidor lo vuelve a exigir. */}
              {membership.role === "TENANT_OWNER" || viewer.role === "TENANT_OWNER" ? (
                <option value="TENANT_OWNER">Propietario</option>
              ) : null}
              <option value="TENANT_ADMIN">Administrador</option>
              <option value="OPERATIONS_MANAGER">Gerente de operaciones</option>
              <option value="DISPATCHER">Despachador</option>
              <option value="SAFETY_MANAGER">Gerente de seguridad</option>
              <option value="DRIVER">Conductor</option>
            </SelectField>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                className="size-4 rounded border-border accent-primary"
                defaultChecked={membership.active}
                name="active"
                type="checkbox"
              />
              Usuario activo
            </label>
            <SubmitButton>Guardar cambios</SubmitButton>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
