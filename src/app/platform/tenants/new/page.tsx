import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  Field,
  PageHeader,
  SelectField,
  SubmitButton,
  TextArea,
} from "@/components/ui";
import { PlusCircle } from "lucide-react";
import { requirePlatformRole } from "@/lib/server/auth";
import { getPlatformNavGroups, platformRoleLabel } from "@/lib/ui/platform-nav";
import { createTenantFullAction } from "@/lib/server/tenant-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function NewTenantPage() {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);

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
            { label: "Nuevo" },
          ]}
          description="Alta de una nueva empresa logistica en la plataforma."
          title="Crear tenant"
        />

        <Card className="max-w-2xl">
          <CardHeader
            description="Complete los campos para registrar un nuevo tenant."
            icon={<PlusCircle />}
            title="Datos del tenant"
          />
          <form action={createTenantFullAction} className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre comercial" name="name" placeholder="Transportes Istmo" required />
              <Field label="Nombre legal" name="legalName" placeholder="Transportes Istmo S.A." required />
            </div>

            <Field
              help="Identificador de la URL: minusculas, numeros y guiones."
              label="Slug"
              name="slug"
              placeholder="transportes-istmo"
              required
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label="Plan" name="planCode">
                <option value="STARTER">Starter</option>
                <option value="PROFESSIONAL">Professional</option>
                <option value="ENTERPRISE">Enterprise</option>
                <option value="DEMO">Demo</option>
              </SelectField>
              <Field label="Pais" name="country" placeholder="PA" required={false} />
              <Field label="Moneda" name="currency" placeholder="USD" required={false} />
            </div>

            <fieldset className="grid gap-4 rounded-lg border border-border p-4">
              <legend className="px-2 text-sm font-medium text-foreground">Contacto</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre de contacto" name="contactName" placeholder="Juan Perez" required={false} />
                <Field label="Correo de contacto" name="contactEmail" placeholder="contacto@empresa.com" required={false} type="email" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telefono" name="contactPhone" placeholder="+507 6000-0000" required={false} />
                <Field label="RUC / Tax ID" name="taxId" placeholder="2-123-456" required={false} />
              </div>
            </fieldset>

            <TextArea
              help="Solo visible para administradores de la plataforma."
              label="Notas internas"
              name="internalNotes"
            />

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input className="size-4 rounded border-border accent-primary" name="isDemo" type="checkbox" />
              Marcar como tenant de demostracion
            </label>

            <SubmitButton>Crear tenant</SubmitButton>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
