import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  Field,
  PageHeader,
  StatusBadge,
  SubmitButton,
} from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { CONNECTOR_CATALOG } from "@/lib/integrations/registry";
import { saveIntegrationConfigAction } from "@/lib/server/integration-actions";
import type { IntegrationConnectorType } from "@/generated/prisma";
import type { StatusTone } from "@/lib/ui/status";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const statusLabel: Record<string, string> = {
  DISABLED: "Desactivado",
  ENABLED: "Activo",
  ERROR: "Error",
  CONFIGURING: "Configurando",
};

const statusTone: Record<string, StatusTone> = {
  DISABLED: "neutral",
  ENABLED: "success",
  ERROR: "danger",
  CONFIGURING: "warning",
};

export default async function ConfigureIntegrationPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; connectorType: string }>;
}) {
  const { tenantSlug, connectorType } = await params;
  const upperType = connectorType.toUpperCase();
  const catalogEntry = CONNECTOR_CATALOG.find((c) => c.type === upperType);
  if (!catalogEntry) notFound();

  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN",
  ]);
  const db = getDb();

  const connector = await db.integrationConnector.findFirst({
    where: { type: upperType as IntegrationConnectorType },
  });

  let integration = null;
  let savedCredKeys: string[] = [];
  let savedConfig: Record<string, string> = {};

  if (connector) {
    integration = await db.tenantIntegration.findFirst({
      where: { tenantId: tenant.id, connectorId: connector.id },
      include: { credentials: { select: { key: true } } },
    });
    if (integration) {
      savedCredKeys = integration.credentials.map((c) => c.key);
      savedConfig = (integration.config as Record<string, string>) ?? {};
    }
  }

  const boundAction = saveIntegrationConfigAction.bind(null, tenantSlug);
  const currentStatus = integration?.status ?? "DISABLED";

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
            { label: "Integraciones", href: `/t/${tenantSlug}/admin/integrations` },
            { label: catalogEntry.name },
          ]}
          description={catalogEntry.description}
          title={`Configurar ${catalogEntry.name}`}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
          <Card>
            <CardHeader
              description="Ingresa la configuracion y credenciales necesarias para conectar."
              icon={<Link2 />}
              title="Configuracion"
            />
            <form action={boundAction} className="mt-4 grid gap-4">
              <input type="hidden" name="connectorType" value={upperType} />

              {catalogEntry.configSchema.length > 0 && (
                <fieldset className="grid gap-3">
                  <legend className="text-sm font-semibold text-foreground mb-1">Parametros</legend>
                  {catalogEntry.configSchema.map((field) => (
                    <Field
                      key={field.key}
                      defaultValue={savedConfig[field.key] ?? (field.defaultValue?.toString() ?? "")}
                      label={field.label}
                      name={`config_${field.key}`}
                      placeholder={field.defaultValue?.toString()}
                      required={field.required}
                      type={field.type === "number" ? "number" : "text"}
                    />
                  ))}
                </fieldset>
              )}

              {catalogEntry.credentialKeys.length > 0 && (
                <fieldset className="grid gap-3">
                  <legend className="text-sm font-semibold text-foreground mb-1">Credenciales</legend>
                  <p className="text-xs text-faint-foreground">
                    Las credenciales se almacenan cifradas con AES-256-GCM. Deje en blanco para mantener el valor actual.
                  </p>
                  {catalogEntry.credentialKeys.map((credKey) => {
                    const hasSaved = savedCredKeys.includes(credKey);
                    return (
                      <Field
                        key={credKey}
                        label={credKey.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                        name={`cred_${credKey}`}
                        placeholder={hasSaved ? "••••••• (guardada)" : "Ingrese el valor"}
                        required={false}
                        type="password"
                      />
                    );
                  })}
                </fieldset>
              )}

              {catalogEntry.configSchema.length === 0 && catalogEntry.credentialKeys.length === 0 && (
                <p className="text-sm text-faint-foreground py-4">
                  Este conector no requiere configuracion adicional. Solo necesita ser activado.
                </p>
              )}

              <SubmitButton>Guardar configuracion</SubmitButton>
            </form>
          </Card>

          <div className="grid gap-4">
            <Card>
              <CardHeader
                description="Informacion del conector."
                icon={<Link2 />}
                title="Detalles"
              />
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-faint-foreground">Tipo</dt>
                  <dd><code className="text-xs">{catalogEntry.type}</code></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-faint-foreground">Version</dt>
                  <dd>{catalogEntry.version}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-faint-foreground">Estado</dt>
                  <dd>
                    <StatusBadge
                      label={statusLabel[currentStatus] ?? currentStatus}
                      tone={statusTone[currentStatus] ?? "neutral"}
                    />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-faint-foreground">Credenciales guardadas</dt>
                  <dd>{savedCredKeys.length > 0 ? savedCredKeys.join(", ") : "Ninguna"}</dd>
                </div>
                {integration?.enabled !== undefined && (
                  <div className="flex justify-between">
                    <dt className="text-faint-foreground">Habilitado</dt>
                    <dd>
                      <StatusBadge
                        label={integration.enabled ? "Si" : "No"}
                        tone={integration.enabled ? "success" : "neutral"}
                      />
                    </dd>
                  </div>
                )}
                {integration?.lastSyncAt && (
                  <div className="flex justify-between">
                    <dt className="text-faint-foreground">Ultima sincronizacion</dt>
                    <dd className="text-xs">{integration.lastSyncAt.toLocaleString("es")}</dd>
                  </div>
                )}
              </dl>
            </Card>

            <Card>
              <CardHeader
                description="Todas las integraciones estan desactivadas por seguridad."
                icon={<Link2 />}
                title="Nota de seguridad"
              />
              <p className="mt-2 text-sm text-faint-foreground">
                Los conectores no realizan llamadas a APIs externas. La configuracion se
                almacena cifrada y solo se usa cuando se active la integracion en un
                ambiente de produccion verificado.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
