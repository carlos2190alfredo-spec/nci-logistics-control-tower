import { DollarSign, TrendingUp, TrendingDown, Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  Collapsible,
  DataTable,
  EmptyState,
  Field,
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
import { ExportCsvButton } from "@/components/tenant/export-csv-button";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantProfitability } from "@/lib/server/finance-data";
import { addFinancialEntryAction } from "@/lib/server/finance-actions";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";
import { financialCategoryLabel, COST_CATEGORIES, REVENUE_CATEGORIES } from "@/lib/ui/finance";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function FinancePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);

  const { total, trips, byClient, byRoute } = await getTenantProfitability(tenant.id);
  const canManage = hasPermission(membership.role, "tenant.finance.manage");
  const recentTrips = await getDb().trip.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, reference: true },
  });

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Rentabilidad" },
          ]}
          description="Ingresos, costos y margen por servicio."
          title="Rentabilidad"
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader icon={<TrendingUp />} title="Ingresos" />
            <p className="mt-2 text-3xl font-bold text-foreground">{money(total.revenue)}</p>
          </Card>
          <Card>
            <CardHeader icon={<TrendingDown />} title="Costos" />
            <p className="mt-2 text-3xl font-bold text-foreground">{money(total.cost)}</p>
          </Card>
          <Card>
            <CardHeader icon={<DollarSign />} title="Margen" />
            <p className={`mt-2 text-3xl font-bold ${total.margin >= 0 ? "text-success" : "text-danger"}`}>{money(total.margin)}</p>
          </Card>
          <Card>
            <CardHeader icon={<DollarSign />} title="Margen %" />
            <p className={`mt-2 text-3xl font-bold ${total.marginPct >= 0 ? "text-success" : "text-danger"}`}>{total.marginPct}%</p>
          </Card>
        </div>

        {canManage ? (
          <Collapsible icon={<Plus />} summary="Registrar línea financiera" tone="default">
            <form action={addFinancialEntryAction.bind(null, tenantSlug)} className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Viaje" name="tripId">
                {recentTrips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.reference}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Tipo" name="kind">
                <option value="INGRESO">Ingreso</option>
                <option value="COSTO">Costo</option>
              </SelectField>
              <SelectField label="Categoría" name="category">
                <optgroup label="Ingresos">
                  {REVENUE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{financialCategoryLabel[c]}</option>
                  ))}
                </optgroup>
                <optgroup label="Costos">
                  {COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{financialCategoryLabel[c]}</option>
                  ))}
                </optgroup>
              </SelectField>
              <Field label="Monto" name="amount" placeholder="0.00" required type="number" />
              <Field label="Moneda" name="currency" placeholder="USD" required={false} />
              <label className="flex items-center gap-2 self-end text-sm text-foreground">
                <input className="size-4 rounded border-border accent-primary" defaultChecked name="billable" type="checkbox" />
                Facturable al cliente
              </label>
              <div className="sm:col-span-2">
                <TextArea label="Observaciones" name="notes" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Registrar línea</SubmitButton>
              </div>
            </form>
          </Collapsible>
        ) : null}

        <Card>
          <CardHeader description="Rentabilidad por servicio." icon={<DollarSign />} title="Por viaje" />
          <div className="mt-4 overflow-x-auto">
            {trips.length ? (
              <DataTable caption="Rentabilidad por viaje">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Viaje</TableHeaderCell>
                    <TableHeaderCell>Cliente</TableHeaderCell>
                    <TableHeaderCell>Ingresos</TableHeaderCell>
                    <TableHeaderCell>Costos</TableHeaderCell>
                    <TableHeaderCell>Margen</TableHeaderCell>
                    <TableHeaderCell>Margen %</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {trips.map((t) => (
                    <TableRow key={t.tripId}>
                      <TableCell className="font-mono font-semibold text-foreground">{t.reference}</TableCell>
                      <TableCell>{t.customerName}</TableCell>
                      <TableCell numeric>{money(t.summary.revenue)}</TableCell>
                      <TableCell numeric>{money(t.summary.cost)}</TableCell>
                      <TableCell numeric>
                        <StatusBadge label={money(t.summary.margin)} tone={t.summary.margin >= 0 ? "success" : "danger"} />
                      </TableCell>
                      <TableCell numeric>{t.summary.marginPct}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            ) : (
              <EmptyState
                description="Registre ingresos y costos por viaje para ver la rentabilidad."
                icon={<DollarSign />}
                title="Sin datos financieros"
              />
            )}
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          {[
            { title: "Por cliente", rows: byClient, head: "Cliente" },
            { title: "Por ruta", rows: byRoute, head: "Ruta" },
          ].map((group) => (
            <Card key={group.title}>
              <CardHeader description="Margen agregado." icon={<DollarSign />} title={group.title} />
              <div className="mt-4 overflow-x-auto">
                {group.rows.length ? (
                  <DataTable caption={group.title}>
                    <TableHead>
                      <tr>
                        <TableHeaderCell>{group.head}</TableHeaderCell>
                        <TableHeaderCell>Servicios</TableHeaderCell>
                        <TableHeaderCell>Margen</TableHeaderCell>
                        <TableHeaderCell>Margen %</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {group.rows.map((g) => (
                        <TableRow key={g.key}>
                          <TableCell>{g.label}</TableCell>
                          <TableCell numeric>{g.count}</TableCell>
                          <TableCell numeric>
                            <StatusBadge label={money(g.summary.margin)} tone={g.summary.margin >= 0 ? "success" : "danger"} />
                          </TableCell>
                          <TableCell numeric>{g.summary.marginPct}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </DataTable>
                ) : (
                  <EmptyState compact icon={<DollarSign />} title="Sin datos" />
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="flex justify-end">
          <ExportCsvButton href={`/api/t/${tenantSlug}/export/finance`} label="Exportar finanzas" />
        </div>
      </div>
    </AppShell>
  );
}
