import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, Field, SubmitButton, TextArea } from "@/components/ui";
import { createTenantAction, startSupportModeAction } from "@/lib/server/actions";
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export default async function PlatformPage() {
  await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const db = getDb();
  const tenants = await db.tenant.findMany({
    include: { plan: true, _count: { select: { trips: true, customers: true, memberships: true } } },
    orderBy: { createdAt: "asc" },
  });
  const active = tenants.filter((tenant) => tenant.status === "ACTIVE").length;
  const trips = tenants.reduce((sum, tenant) => sum + tenant._count.trips, 0);

  return (
    <AppShell title="Panel de Plataforma" subtitle="Administracion general de NCI Automation">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Tenants</p>
          <p className="mt-2 text-3xl font-bold">{tenants.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Activos</p>
          <p className="mt-2 text-3xl font-bold">{active}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Viajes agregados</p>
          <p className="mt-2 text-3xl font-bold">{trips}</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
        <Card>
          <h2 className="text-lg font-bold">Tenants registrados</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Tenant</th>
                  <th>Estado</th>
                  <th>Plan</th>
                  <th>Usuarios</th>
                  <th>Clientes</th>
                  <th>Viajes</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr className="border-t border-slate-100" key={tenant.id}>
                    <td className="py-3">
                      <p className="font-semibold">{tenant.name}</p>
                      <p className="text-xs text-slate-500">/{tenant.slug}</p>
                    </td>
                    <td><Badge tone={tenant.status === "ACTIVE" ? "green" : "orange"}>{tenant.status}</Badge></td>
                    <td>{tenant.plan.code}</td>
                    <td>{tenant._count.memberships}</td>
                    <td>{tenant._count.customers}</td>
                    <td>{tenant._count.trips}</td>
                    <td>
                      <Link className="font-semibold text-blue-700" href={`/t/${tenant.slug}`}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card>
            <h2 className="text-lg font-bold">Crear tenant</h2>
            <form action={createTenantAction} className="mt-4 grid gap-3">
              <Field label="Nombre comercial" name="name" />
              <Field label="Nombre legal" name="legalName" />
              <Field label="Slug" name="slug" />
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Plan
                <select className="min-h-10 rounded-md border border-slate-300 px-3" name="planCode">
                  <option>STARTER</option>
                  <option>PROFESSIONAL</option>
                  <option>ENTERPRISE</option>
                </select>
              </label>
              <SubmitButton>Crear</SubmitButton>
            </form>
          </Card>

          <Card>
            <h2 className="text-lg font-bold">Modo soporte auditado</h2>
            <form action={startSupportModeAction} className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Tenant
                <select className="min-h-10 rounded-md border border-slate-300 px-3" name="tenantId">
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                  ))}
                </select>
              </label>
              <TextArea label="Motivo obligatorio" name="reason" required />
              <SubmitButton className="bg-orange-600 hover:bg-orange-700">Entrar en soporte</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
