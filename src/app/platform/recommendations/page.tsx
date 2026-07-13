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
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getPlatformNavGroups, platformRoleLabel } from "@/lib/ui/platform-nav";
import type { StatusTone } from "@/lib/ui/status";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const typeBadge: Record<string, { label: string; tone: StatusTone }> = {
  OPTIMIZATION: { label: "Optimizacion", tone: "info" },
  ALERT: { label: "Alerta", tone: "danger" },
  INSIGHT: { label: "Insight", tone: "neutral" },
  SUGGESTION: { label: "Sugerencia", tone: "success" },
};

const priorityTone: Record<string, "danger" | "warning" | "neutral"> = {
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

export default async function PlatformRecommendationsPage() {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const db = getDb();
  const recommendations = await db.aiRecommendation.findMany({
    include: { tenant: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const total = await db.aiRecommendation.count();
  const pending = await db.aiRecommendation.count({ where: { status: "PENDING" } });
  const acted = await db.aiRecommendation.count({ where: { status: "ACTED" } });

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Plataforma", href: "/platform" }, { label: "Recomendaciones IA" }]}
          description="Recomendaciones generadas por el motor de reglas para todos los tenants."
          title="Recomendaciones IA"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={<Brain />} label="Total recomendaciones" value={total} />
          <MetricCard icon={<Brain />} label="Pendientes" tone="warning" value={pending} />
          <MetricCard icon={<Brain />} label="Actuadas" tone="success" value={acted} />
        </div>

        <Card>
          <CardHeader
            description="Ultimas 50 recomendaciones generadas por el motor de IA basado en reglas."
            icon={<Brain />}
            title="Recomendaciones recientes"
          />
          <div className="mt-4">
            <DataTable caption="Recomendaciones IA">
              <TableHead>
                <tr>
                  <TableHeaderCell>Tenant</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Prioridad</TableHeaderCell>
                  <TableHeaderCell>Titulo</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Regla</TableHeaderCell>
                  <TableHeaderCell>Fecha</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {recommendations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-faint-foreground py-8">
                      No hay recomendaciones generadas aun. Activa el motor IA para un tenant desde su configuracion.
                    </TableCell>
                  </TableRow>
                ) : (
                  recommendations.map((r) => {
                    const tb = typeBadge[r.type] ?? { label: r.type, tone: "neutral" as const };
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-semibold">{r.tenant.name}</TableCell>
                        <TableCell><StatusBadge label={tb.label} tone={tb.tone} /></TableCell>
                        <TableCell>
                          <StatusBadge label={r.priority} tone={priorityTone[r.priority] ?? "neutral"} />
                        </TableCell>
                        <TableCell><span className="line-clamp-1">{r.title}</span></TableCell>
                        <TableCell>{r.status}</TableCell>
                        <TableCell><code className="text-xs">{r.ruleId}</code></TableCell>
                        <TableCell className="text-xs text-faint-foreground">{r.createdAt.toLocaleDateString("es")}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </DataTable>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
