import { UserPlus } from "lucide-react";
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
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { createTenantUserAction } from "@/lib/server/tenant-user-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function NewTenantUserPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);
  const boundAction = createTenantUserAction.bind(null, tenantSlug);

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
            { label: "Nuevo" },
          ]}
          description="Crear un nuevo usuario con acceso al tenant."
          title="Crear usuario"
        />

        <Card className="max-w-lg">
          <CardHeader
            description="Complete los datos del nuevo usuario."
            icon={<UserPlus />}
            title="Datos del usuario"
          />
          <form action={boundAction} className="mt-4 grid gap-4">
            <Field label="Nombre completo" name="name" placeholder="Juan Perez" />
            <Field label="Correo electronico" name="email" placeholder="usuario@empresa.com" type="email" />
            <Field
              help="Minimo 8 caracteres."
              label="Contrasena"
              name="password"
              type="password"
            />
            <SelectField label="Rol" name="role">
              <option value="TENANT_ADMIN">Administrador</option>
              <option value="OPERATIONS_MANAGER">Gerente de operaciones</option>
              <option value="DISPATCHER">Despachador</option>
              <option value="SAFETY_MANAGER">Gerente de seguridad</option>
              <option value="DRIVER">Conductor</option>
            </SelectField>
            <SubmitButton>Crear usuario</SubmitButton>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
