import { notFound } from "next/navigation";
import { Edit } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  Field,
  PageHeader,
  SubmitButton,
  TextArea,
} from "@/components/ui";
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getPlatformNavGroups, platformRoleLabel } from "@/lib/ui/platform-nav";
import { updateTenantAction } from "@/lib/server/tenant-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);
  const { tenantId } = await params;
  const db = getDb();

  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) notFound();

  const boundAction = updateTenantAction.bind(null, tenantId);

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: "Plataforma", href: "/platform" },
            { label: "Tenants", href: "/platform/tenants" },
            { label: tenant.name, href: `/platform/tenants/${tenantId}` },
            { label: "Editar" },
          ]}
          description={`Editando ${tenant.name} (/${tenant.slug})`}
          title="Editar tenant"
        />

        <Card className="max-w-2xl">
          <CardHeader
            description="Modifique los campos necesarios."
            icon={<Edit />}
            title="Datos del tenant"
          />
          <form action={boundAction} className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field defaultValue={tenant.name} label="Nombre comercial" name="name" required />
              <Field defaultValue={tenant.legalName} label="Nombre legal" name="legalName" required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field defaultValue={tenant.country} label="Pais" name="country" />
              <Field defaultValue={tenant.currency} label="Moneda" name="currency" />
            </div>

            <fieldset className="grid gap-4 rounded-lg border border-border p-4">
              <legend className="px-2 text-sm font-medium text-foreground">Contacto</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field defaultValue={tenant.contactName ?? ""} label="Nombre de contacto" name="contactName" required={false} />
                <Field defaultValue={tenant.contactEmail ?? ""} label="Correo de contacto" name="contactEmail" required={false} type="email" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field defaultValue={tenant.contactPhone ?? ""} label="Telefono" name="contactPhone" required={false} />
                <Field defaultValue={tenant.taxId ?? ""} label="RUC / Tax ID" name="taxId" required={false} />
              </div>
            </fieldset>

            <TextArea
              defaultValue={tenant.internalNotes ?? ""}
              help="Solo visible para administradores de la plataforma."
              label="Notas internas"
              name="internalNotes"
            />

            <SubmitButton>Guardar cambios</SubmitButton>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
