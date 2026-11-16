import { notFound } from "next/navigation";
import { Building2, KeyRound, Power } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { CustomerForm } from "@/components/customers/customer-form";
import { PortalUserForm } from "@/components/customers/portal-user-form";
import { Card, CardHeader, ConfirmSubmit, DefinitionList, PageHeader, PageNotice, StatusBadge, SubmitButton } from "@/components/ui";
import { createCustomerUserAction, resendCustomerAccessAction, setCustomerAccessActiveAction } from "@/lib/server/customer-user-actions";
import { customerRoleLabel } from "@/lib/ui/status";
import { requireTenantPermission } from "@/lib/server/auth";
import { setCustomerActiveAction, updateCustomerAction } from "@/lib/server/customer-actions";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { customerNotices } from "@/lib/ui/customer-notices";
import { tenantRoleLabel } from "@/lib/ui/status";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; customerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug, customerId } = await params;
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.view");
  const sp = await searchParams;
  if (!UUID.test(customerId)) notFound();

  const db = getDb();
  const customer = await db.customerAccount.findFirst({ where: { id: customerId, tenantId: tenant.id } });
  if (!customer) notFound();
  const [trips, portalMembers] = await Promise.all([
    db.trip.count({ where: { tenantId: tenant.id, customerAccountId: customer.id } }),
    db.customerMembership.findMany({
      where: { tenantId: tenant.id, customerAccountId: customer.id },
      select: { id: true, role: true, active: true, user: { select: { name: true, email: true, lastLoginAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const portalUsers = portalMembers.filter((member) => member.active).length;
  const canManage = hasPermission(membership.role, "tenant.catalogs.manage");
  const canGrantAccess = hasPermission(membership.role, "tenant.customers.portal");

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid max-w-3xl gap-6 [&>*]:min-w-0">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Clientes", href: `/t/${tenantSlug}/customers` },
            { label: customer.name },
          ]}
          meta={<StatusBadge label={customer.active ? "Activo" : "Inactivo"} tone={customer.active ? "success" : "neutral"} />}
          title={customer.name}
        />

        <PageNotice code={sp.aviso} messages={customerNotices} />

        <Card>
          <CardHeader icon={<Building2 />} title="Resumen" />
          <div className="mt-4">
            <DefinitionList
              items={[
                { term: "Código", description: customer.code },
                { term: "RUC", description: customer.taxId ?? "—" },
                { term: "Viajes registrados", description: String(trips) },
                { term: "Usuarios del portal activos", description: String(portalUsers) },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            description={canManage ? "El código no se puede cambiar." : "Solo lectura: no tiene permiso para editar clientes."}
            icon={<Building2 />}
            title="Datos del cliente"
          />
          <div className="mt-4">
            {canManage ? (
              <CustomerForm
                action={updateCustomerAction.bind(null, tenantSlug, customer.id)}
                initial={customer}
                resetOnSuccess={false}
                submitLabel="Guardar cambios"
              />
            ) : (
              <DefinitionList
                items={[
                  { term: "Contacto", description: customer.contactName ?? "—" },
                  { term: "Correo", description: customer.contactEmail ?? "—" },
                  { term: "Teléfono", description: customer.contactPhone ?? "—" },
                  { term: "Dirección", description: customer.address ?? "—" },
                ]}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            description="Personas de este cliente que pueden entrar al portal para consultar y solicitar servicios."
            icon={<KeyRound />}
            title="Acceso al portal"
          />
          {portalMembers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Todavía nadie de este cliente tiene acceso al portal.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {portalMembers.map((member) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                  data-testid={`portal-user-row-${member.id}`}
                  key={member.id}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{member.user.name}</p>
                    <p className="text-sm text-muted-foreground">{member.user.email}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {customerRoleLabel[member.role]}
                      <StatusBadge label={member.active ? "Activo" : "Acceso desactivado"} tone={member.active ? "success" : "neutral"} />
                      {member.active && !member.user.lastLoginAt ? <span>Aún no ha creado su contraseña</span> : null}
                    </p>
                  </div>
                  {canGrantAccess ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {member.active && !member.user.lastLoginAt ? (
                        <form action={resendCustomerAccessAction.bind(null, tenantSlug, member.id)}>
                          <SubmitButton size="sm" variant="outline">Reenviar enlace</SubmitButton>
                        </form>
                      ) : null}
                      <form action={setCustomerAccessActiveAction.bind(null, tenantSlug, member.id, !member.active)}>
                        <ConfirmSubmit
                          confirmLabel={member.active ? "Sí, desactivar" : "Sí, reactivar"}
                          label={member.active ? "Desactivar acceso" : "Reactivar acceso"}
                          message={member.active ? `¿Desactivar el acceso de ${member.user.name}?` : `¿Reactivar el acceso de ${member.user.name}?`}
                          size="sm"
                          variant={member.active ? "danger" : "primary"}
                        />
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canGrantAccess && customer.active ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-3 text-sm font-semibold text-foreground">Dar acceso a una persona</p>
              <PortalUserForm action={createCustomerUserAction.bind(null, tenantSlug)} customerAccountId={customer.id} />
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              {customer.active ? "Solo el propietario o el administrador pueden dar acceso al portal." : "Reactive el cliente para dar acceso."}
            </p>
          )}
        </Card>

        {canManage ? (
          <Card>
            <CardHeader
              description={
                customer.active
                  ? "Al desactivarlo no podrá recibir viajes nuevos y se desactiva el acceso de todos sus usuarios al portal. Sus viajes e historial se conservan."
                  : "Al reactivarlo vuelve a poder recibir viajes. Los accesos al portal se reactivan uno por uno."
              }
              icon={<Power />}
              title="Estado del cliente"
            />
            <form action={setCustomerActiveAction.bind(null, tenantSlug, customer.id, !customer.active)} className="mt-4">
              <ConfirmSubmit
                confirmLabel={customer.active ? "Sí, desactivar" : "Sí, reactivar"}
                label={customer.active ? "Desactivar cliente" : "Reactivar cliente"}
                message={customer.active ? `¿Desactivar a ${customer.name}?` : `¿Reactivar a ${customer.name}?`}
                variant={customer.active ? "danger" : "primary"}
              />
            </form>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
