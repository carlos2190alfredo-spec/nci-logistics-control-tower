import type { ReactNode } from "react";
import { GenericOfflineProvider } from "@/components/offline/generic-offline-provider";
import { requireTenantMembership } from "@/lib/server/auth";

/**
 * Layout raíz del tenant. Monta el `GenericOfflineProvider` para que TODA
 * página bajo `/t/[tenantSlug]/**` disponga de la cola offline genérica.
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

  return (
    <GenericOfflineProvider
      owner={{ userId: user.id, tenantId: tenant.id, tenantSlug: tenant.slug }}
    >
      {props.children}
    </GenericOfflineProvider>
  );
}
