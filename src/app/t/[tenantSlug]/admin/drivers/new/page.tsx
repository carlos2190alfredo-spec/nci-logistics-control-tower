import { UserPlus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  Field,
  PageHeader,
  SubmitButton,
} from "@/components/ui";
import { OfflineForm } from "@/components/offline/offline-form";
import { requireTenantRole } from "@/lib/server/auth";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { createDriverAction } from "@/lib/server/tenant-user-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function NewDriverPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const boundAction = createDriverAction.bind(null, tenantSlug);

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
            { label: "Conductores", href: `/t/${tenantSlug}/admin/drivers` },
            { label: "Nuevo" },
          ]}
          description="Registrar un nuevo conductor en el tenant."
          title="Crear conductor"
        />

        <Card className="max-w-lg">
          <CardHeader
            description="Complete los datos del conductor."
            icon={<UserPlus />}
            title="Datos del conductor"
          />
          <OfflineForm
            action={boundAction}
            actionId="driver.create"
            className="mt-4 grid gap-4"
            offlineLabel="Crear conductor"
          >
            <Field label="Nombre completo" name="name" placeholder="Pedro Martinez" />
            <Field help="Codigo unico dentro del tenant." label="Codigo" name="code" placeholder="DRV-001" />
            <Field label="Numero de licencia" name="license" placeholder="LC-123456" />
            <Field label="Telefono" name="phone" placeholder="+507 6000-0000" required={false} />
            <SubmitButton>Crear conductor</SubmitButton>
          </OfflineForm>
        </Card>
      </div>
    </AppShell>
  );
}
