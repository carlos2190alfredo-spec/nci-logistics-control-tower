import { Edit } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import {
  Alert,
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
import { linkDriverUserAction } from "@/lib/server/driver-link-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const LINK_NOTICES: Record<string, { tone: "success" | "warning"; message: string }> = {
  vinculado: { tone: "success", message: "Cuenta vinculada. El conductor ya ve sus viajes en la app." },
  desvinculado: { tone: "success", message: "Cuenta desvinculada." },
  "usuario-no-valido": { tone: "warning", message: "Esa cuenta no está disponible: debe ser un usuario con rol Conductor que no esté vinculado a otra ficha." },
};

export default async function EditDriverPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; driverId: string }>;
  searchParams: Promise<{ aviso?: string | string[] }>;
}) {
  const { tenantSlug, driverId } = await params;
  const { aviso } = await searchParams;
  const notice = typeof aviso === "string" ? LINK_NOTICES[aviso] : undefined;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const db = getDb();

  const driver = await db.driver.findFirst({
    where: { id: driverId, tenantId: tenant.id },
  });
  if (!driver) notFound();

  const boundAction = updateDriverAction.bind(null, tenantSlug, driverId);
  // Cuentas con rol Conductor de este tenant que aun no estan vinculadas a otra ficha (o la de esta ficha).
  const driverUsers = await db.tenantMembership.findMany({
    where: { tenantId: tenant.id, role: "DRIVER", active: true },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  const linkedElsewhere = new Set(
    (await db.driver.findMany({ where: { tenantId: tenant.id, userId: { not: null }, id: { not: driverId } }, select: { userId: true } })).map((row) => row.userId),
  );
  const candidates = driverUsers.map((row) => row.user).filter((account) => !linkedElsewhere.has(account.id));

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

        {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}

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

        <Card className="max-w-lg">
          <CardHeader
            description="Para que el conductor vea sus viajes en la app, vincule su ficha con su cuenta de usuario (rol Conductor)."
            icon={<Edit />}
            title="Cuenta de acceso a la app"
          />
          {candidates.length === 0 && !driver.userId ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No hay cuentas con rol Conductor disponibles. Cree el usuario en Usuarios (rol Conductor) y vuelva aquí.
            </p>
          ) : (
            <form action={linkDriverUserAction.bind(null, tenantSlug, driverId)} className="mt-4 grid gap-3">
              <SelectField
                allowEmpty
                defaultValue={driver.userId ?? ""}
                label="Cuenta del conductor"
                name="userId"
                options={candidates.map((account) => ({ value: account.id, label: `${account.name} (${account.email})` }))}
                placeholder="Sin cuenta vinculada"
              />
              <SubmitButton>Guardar vínculo</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
