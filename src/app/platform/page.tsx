import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  LifeBuoy,
  PlusCircle,
  Route,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { getPlatformNavGroups, platformRoleLabel } from "@/lib/ui/platform-nav";
import {
  Alert,
  Card,
  CardHeader,
  DataTable,
  MetricCard,
  PageHeader,
  SelectField,
  StatusBadge,
  SubmitButton,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextArea,
} from "@/components/ui";
import { buttonStyles } from "@/components/ui/button-styles";
import { startSupportModeAction } from "@/lib/server/actions";
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { tenantStatusLabel, tenantStatusTone } from "@/lib/ui/status";

export default async function PlatformPage() {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const db = getDb();
  const tenants = await db.tenant.findMany({
    include: { plan: true, _count: { select: { trips: true, customers: true, memberships: true } } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  const totalTenants = await db.tenant.count();
  const active = await db.tenant.count({ where: { status: "ACTIVE" } });
  const suspended = totalTenants - active;
  const trips = tenants.reduce((sum, tenant) => sum + tenant._count.trips, 0);
  const members = tenants.reduce((sum, tenant) => sum + tenant._count.memberships, 0);

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: "NCI Automation" }, { label: "Plataforma" }]}
          description="Administracion general de tenants, planes y soporte de NCI Automation."
          title="Panel de Plataforma"
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard hint="Empresas logisticas registradas" icon={<Building2 />} label="Tenants" tone="primary" value={totalTenants} />
          <MetricCard
            hint={suspended > 0 ? `${suspended} fuera de servicio` : "Toda la base operativa"}
            icon={<CheckCircle2 />}
            label="Tenants activos"
            tone="success"
            value={active}
          />
          <MetricCard hint="Membresias en todos los tenants" icon={<Users />} label="Usuarios" value={members} />
          <MetricCard hint="Historico en la plataforma" icon={<Route />} label="Viajes procesados" value={trips} />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
          <Card className="scroll-mt-20" id="tenants">
            <CardHeader
              description="Estado, plan y volumen operativo por empresa."
              icon={<Building2 />}
              title="Tenants recientes"
            />
            <div className="mt-4">
              <DataTable caption="Listado de tenants registrados en la plataforma">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Tenant</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Plan</TableHeaderCell>
                    <TableHeaderCell className="text-right">Usuarios</TableHeaderCell>
                    <TableHeaderCell className="text-right">Clientes</TableHeaderCell>
                    <TableHeaderCell className="text-right">Viajes</TableHeaderCell>
                    <TableHeaderCell>
                      <span className="sr-only">Acciones</span>
                    </TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <Link className="font-semibold text-foreground hover:text-primary transition-colors" href={`/platform/tenants/${tenant.id}`}>
                          {tenant.name}
                        </Link>
                        <p className="text-xs text-faint-foreground">/{tenant.slug}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={tenantStatusLabel[tenant.status]} tone={tenantStatusTone[tenant.status]} />
                      </TableCell>
                      <TableCell>{tenant.plan.code}</TableCell>
                      <TableCell className="text-right" numeric>
                        {tenant._count.memberships}
                      </TableCell>
                      <TableCell className="text-right" numeric>
                        {tenant._count.customers}
                      </TableCell>
                      <TableCell className="text-right" numeric>
                        {tenant._count.trips}
                      </TableCell>
                      <TableCell>
                        <Link
                          className="inline-flex items-center gap-1 font-semibold text-primary transition-colors hover:text-primary-hover"
                          href={`/platform/tenants/${tenant.id}`}
                        >
                          Ver
                          <ArrowRight aria-hidden className="size-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
              {totalTenants > 10 && (
                <div className="mt-3 text-right">
                  <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href="/platform/tenants">
                    Ver todos los tenants ({totalTenants})
                  </Link>
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-6">
            <Card>
              <CardHeader
                description="Alta de una nueva empresa logistica con su plan."
                icon={<PlusCircle />}
                title="Crear tenant"
              />
              <div className="mt-4">
                <Link className={buttonStyles({ variant: "primary" })} href="/platform/tenants/new">
                  <PlusCircle aria-hidden className="size-4" />
                  Crear nuevo tenant
                </Link>
              </div>
            </Card>

            <Card className="scroll-mt-20" id="soporte">
              <CardHeader
                description="Acceso temporal al espacio de un tenant para asistencia."
                icon={<LifeBuoy />}
                title="Modo soporte auditado"
              />
              <form action={startSupportModeAction} className="mt-4 grid gap-3.5">
                <SelectField label="Tenant" name="tenantId">
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </SelectField>
                <TextArea
                  help="El motivo queda registrado en la bitacora de auditoria."
                  label="Motivo obligatorio"
                  name="reason"
                  required
                />
                <Alert tone="warning">Toda accion durante la sesion de soporte queda auditada.</Alert>
                <SubmitButton variant="accent">Entrar en soporte</SubmitButton>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
