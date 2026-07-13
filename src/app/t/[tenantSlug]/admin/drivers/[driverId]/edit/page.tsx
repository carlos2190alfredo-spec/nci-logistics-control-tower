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
import { updateDriverAction } from "@/lib/server/tenant-user-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function EditDriverPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; driverId: string }>;
}) {
  const { tenantSlug, driverId } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const db = getDb();

  const driver = await db.driver.findFirst({
    where: { id: driverId, tenantId: tenant.id },
  });
  if (!driver) notFound();

  const boundAction = updateDriverAction.bind(null, tenantSlug, driverId);

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
            { label: driver.name },
          ]}
          description={`Editando conductor ${driver.code}`}
          title="Editar conductor"
        />

        <Card className="max-w-lg">
          <CardHeader
            description="Modifique los datos del conductor."
            icon={<Edit />}
            title="Datos del conductor"
          />
          <form action={boundAction} className="mt-4 grid gap-4">
            <Field defaultValue={driver.name} label="Nombre completo" name="name" />
            <Field defaultValue={driver.license} label="Numero de licencia" name="license" />
            <Field defaultValue={driver.phone ?? ""} label="Telefono" name="phone" required={false} />
            <SelectField defaultValue={driver.status} label="Estado" name="status">
              <option value="AVAILABLE">Disponible</option>
              <option value="ON_TRIP">En viaje</option>
              <option value="OFF_DUTY">Fuera de servicio</option>
              <option value="INACTIVE">Inactivo</option>
            </SelectField>
            <SubmitButton>Guardar cambios</SubmitButton>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
