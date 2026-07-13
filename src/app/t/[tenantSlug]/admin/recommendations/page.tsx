import { Brain } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  DataTable,
  MetricCard,
  PageHeader,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import type { StatusTone } from "@/lib/ui/status";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const typeLabel: Record<string, string> = {
  OPTIMIZATION: "Optimizacion",
  ALERT: "Alerta",
  INSIGHT: "Analisis",
  SUGGESTION: "Sugerencia",
};

const typeTone: Record<string, StatusTone> = {
  OPTIMIZATION: "info",
  ALERT: "danger",
  INSIGHT: "neutral",
  SUGGESTION: "success",
};

const priorityTone: Record<string, StatusTone> = {
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

const statusLabel: Record<string, string> = {
  PENDING: "Pendiente",
  VIEWED: "Visto",
  ACTED: "Actuado",
  DISMISSED: "Descartado",
};

export default async function TenantRecommendationsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const db = getDb();

  const [recommendations, total, pending, acted] = await Promise.all([
    db.aiRecommendation.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.aiRecommendation.count({ where: { tenantId: tenant.id } }),
    db.aiRecommendation.count({ where: { tenantId: tenant.id, status: "PENDING" } }),
    db.aiRecommendation.count({ where: { tenantId: tenant.id, status: "ACTED" } }),
  ]);

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
            { label: "Recomendaciones" },
          ]}
          description="Recomendaciones generadas por el motor de reglas deterministas."
          title="Recomendaciones IA"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={<Brain />} label="Total" value={total} />
          <MetricCard
            icon={<Brain />}
            label="Pendientes"
            tone={pending > 0 ? "warning" : "default"}
            value={pending}
          />
          <MetricCard icon={<Brain />} label="Actuadas" tone="success" value={acted} />
        </div>

        <Card>
          <CardHeader
            description="Ultimas recomendaciones del motor IA."
            icon={<Brain />}
            title="Historial"
          />
          <div className="mt-4">
            <DataTable caption="Recomendaciones IA">
              <TableHead>
                <tr>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Prioridad</TableHeaderCell>
                  <TableHeaderCell>Titulo</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Fecha</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {recommendations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-faint-foreground py-8">
                      No hay recomendaciones generadas aun.
                    </TableCell>
                  </TableRow>
                ) : (
                  recommendations.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <StatusBadge
                          label={typeLabel[r.type] ?? r.type}
                          tone={typeTone[r.type] ?? "neutral"}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={r.priority}
                          tone={priorityTone[r.priority] ?? "neutral"}
                        />
                      </TableCell>
                      <TableCell><span className="line-clamp-1">{r.title}</span></TableCell>
                      <TableCell>
                        <StatusBadge
                          label={statusLabel[r.status] ?? r.status}
                          tone={r.status === "ACTED" ? "success" : r.status === "PENDING" ? "warning" : "neutral"}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-faint-foreground">
                        {r.createdAt.toLocaleDateString("es")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </DataTable>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
