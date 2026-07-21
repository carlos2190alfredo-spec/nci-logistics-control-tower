import type { ReactNode } from "react";
import { GenericOfflineProvider } from "@/components/offline/generic-offline-provider";
import { SupportSessionBanner } from "@/components/support/support-session-banner";
import { requireTenantMembership } from "@/lib/server/auth";
import { getActiveSupportSession } from "@/lib/server/support-data";

/**
 * Layout raíz del tenant. Monta el `GenericOfflineProvider` para que TODA
 * página bajo `/t/[tenantSlug]/**` disponga de la cola offline genérica.
 * También muestra un banner visible cuando hay una sesión de soporte activa
 * (modo soporte auditado con salida visible y cierre auditado).
 *
 * El `owner` (userId, tenantId, tenantSlug) se resuelve en el servidor a
 * partir de la sesión — nunca se confía en un valor del cliente.
 */
type Props = {
  children: ReactNode;
  params: Promise<{ tenantSlug: string }>;
};

export default async function TenantLayout(props: Props) {
  const { tenantSlug } = await props.params;
  const { user, tenant } = await requireTenantMembership(tenantSlug);
  const support = await getActiveSupportSession(tenant.id);

  return (
    <GenericOfflineProvider
      owner={{ userId: user.id, tenantId: tenant.id, tenantSlug: tenant.slug }}
    >
      {support ? <SupportSessionBanner support={support} /> : null}
      {props.children}
    </GenericOfflineProvider>
  );
}
