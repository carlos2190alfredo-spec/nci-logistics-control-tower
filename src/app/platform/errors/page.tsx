import { AlertTriangle } from "lucide-react";
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

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const severityTone: Record<string, "danger" | "warning" | "neutral"> = {
  P0: "danger",
  P1: "warning",
  P2: "neutral",
};

export default async function PlatformErrorsPage() {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const db = getDb();
  const alerts = await db.operationalAlert.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: 50,
  });

  const active = await db.operationalAlert.count({ where: { status: "ACTIVE" } });
  const resolved = await db.operationalAlert.count({ where: { status: "RESOLVED" } });

  const failedJobs = await db.jobRun.findMany({
    where: { status: { in: ["FAILED", "PARTIAL"] } },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Plataforma", href: "/platform" }, { label: "Errores" }]}
          description="Alertas operativas y errores recientes del sistema."
          title="Errores y Alertas"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard icon={<AlertTriangle />} label="Alertas activas" tone="danger" value={active} />
          <MetricCard icon={<AlertTriangle />} label="Resueltas" tone="success" value={resolved} />
        </div>

        <Card>
          <CardHeader description="Ultimas 50 alertas operativas." icon={<AlertTriangle />} title="Alertas" />
          <div className="mt-4">
            <DataTable caption="Alertas operativas">
              <TableHead>
                <tr>
                  <TableHeaderCell>Severidad</TableHeaderCell>
                  <TableHeaderCell>Fuente</TableHeaderCell>
                  <TableHeaderCell>Titulo</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell className="text-right">Ocurrencias</TableHeaderCell>
                  <TableHeaderCell>Ultima vez</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {alerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-faint-foreground py-8">
                      No hay alertas registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  alerts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <StatusBadge label={a.severity} tone={severityTone[a.severity] ?? "neutral"} />
                      </TableCell>
                      <TableCell>{a.source}</TableCell>
                      <TableCell><span className="line-clamp-1">{a.title}</span></TableCell>
                      <TableCell>
                        <StatusBadge
                          label={a.status === "ACTIVE" ? "Activa" : a.status === "RESOLVED" ? "Resuelta" : "Reconocida"}
                          tone={a.status === "ACTIVE" ? "danger" : a.status === "RESOLVED" ? "success" : "warning"}
                        />
                      </TableCell>
                      <TableCell className="text-right" numeric>{a.occurrenceCount}</TableCell>
                      <TableCell className="text-xs text-faint-foreground">
                        {a.lastSeenAt.toLocaleString("es")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </DataTable>
          </div>
        </Card>

        {failedJobs.length > 0 && (
          <Card>
            <CardHeader description="Jobs que fallaron recientemente." icon={<AlertTriangle />} title="Jobs fallidos" />
            <div className="mt-4">
              <DataTable caption="Jobs con errores">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Job</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Error</TableHeaderCell>
                    <TableHeaderCell>Duracion</TableHeaderCell>
                    <TableHeaderCell>Fecha</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {failedJobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-semibold">{j.jobName}</TableCell>
                      <TableCell>
                        <StatusBadge label={j.status} tone={j.status === "FAILED" ? "danger" : "warning"} />
                      </TableCell>
                      <TableCell><span className="line-clamp-1 text-xs">{j.safeErrorMessage ?? "—"}</span></TableCell>
                      <TableCell>{j.durationMs ? `${j.durationMs}ms` : "—"}</TableCell>
                      <TableCell className="text-xs text-faint-foreground">
                        {j.startedAt.toLocaleString("es")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
