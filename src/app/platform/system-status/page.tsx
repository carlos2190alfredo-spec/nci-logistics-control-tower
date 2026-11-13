import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  Heart,
  Shield,
  ShieldAlert,
  Wifi,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { getPlatformNavGroups, platformRoleLabel } from "@/lib/ui/platform-nav";
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
import { runHealthChecks } from "@/lib/observability/health";
import { collectMetrics } from "@/lib/observability/metrics";
import { getActiveAlerts } from "@/lib/observability/alerts";
import type { ServiceStatus } from "@/lib/observability/health";

const statusTone: Record<ServiceStatus, "success" | "warning" | "danger" | "neutral"> = {
  HEALTHY: "success",
  DEGRADED: "warning",
  UNHEALTHY: "danger",
  UNKNOWN: "neutral",
};

const statusLabel: Record<ServiceStatus, string> = {
  HEALTHY: "Saludable",
  DEGRADED: "Degradado",
  UNHEALTHY: "No disponible",
  UNKNOWN: "Desconocido",
};

export default async function SystemStatusPage() {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const [health, metrics, alerts] = await Promise.all([
    runHealthChecks(),
    collectMetrics(),
    getActiveAlerts(),
  ]);

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: "NCI Automation" }, { label: "Plataforma", href: "/platform" }, { label: "Estado del sistema" }]}
          description="Salud de servicios, metricas operativas y alertas activas."
          title="Estado del Sistema"
        />

        {/* Estado general */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Heart />}
            label="Estado general"
            tone={statusTone[health.status] === "success" ? "success" : "danger"}
            value={statusLabel[health.status]}
          />
          <MetricCard
            icon={<Database />}
            label="Tenants"
            value={metrics.database.tenants}
          />
          <MetricCard
            icon={<Shield />}
            label="Sesiones activas"
            value={metrics.database.activeSessions}
          />
          <MetricCard
            icon={<ShieldAlert />}
            label="Alertas activas"
            tone={metrics.alerts.totalActive > 0 ? "danger" : "success"}
            value={metrics.alerts.totalActive}
          />
        </div>

        {/* Health checks */}
        <Card>
          <CardHeader icon={<Heart />} title="Servicios" description="Estado de cada componente del sistema." />
          <div className="mt-4">
            <DataTable caption="Estado de servicios del sistema">
              <TableHead>
                <tr>
                  <TableHeaderCell>Servicio</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell className="text-right">Latencia</TableHeaderCell>
                  <TableHeaderCell>Mensaje</TableHeaderCell>
                  <TableHeaderCell>Remediacion</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {health.checks.map((check) => (
                  <TableRow key={check.name}>
                    <TableCell className="font-semibold capitalize">{check.name}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={statusLabel[check.status]}
                        tone={statusTone[check.status]}
                      />
                    </TableCell>
                    <TableCell className="text-right" numeric>{check.durationMs} ms</TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {check.message ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {check.remediation ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* Metricas de archivos */}
          <Card>
            <CardHeader icon={<HardDrive />} title="Archivos y ClamAV" description="Estado del pipeline de archivos." />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MiniMetric label="Disponibles" value={metrics.files.available} tone="success" />
              <MiniMetric label="Pendientes de scan" value={metrics.files.pendingScan} tone={metrics.files.pendingScan > 5 ? "warning" : "neutral"} />
              <MiniMetric label="En cuarentena" value={metrics.files.quarantine} tone="neutral" />
              <MiniMetric label="Infectados" value={metrics.files.infected} tone={metrics.files.infected > 0 ? "danger" : "neutral"} />
              <MiniMetric label="Rechazados" value={metrics.files.rejected} tone={metrics.files.rejected > 0 ? "warning" : "neutral"} />
              <MiniMetric label="Escaneando" value={metrics.files.scanning} tone="neutral" />
            </div>
          </Card>

          {/* Seguridad */}
          <Card>
            <CardHeader icon={<Shield />} title="Seguridad" description="Indicadores de seguridad recientes." />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MiniMetric label="Login failures" value={metrics.security.recentLoginFailures} tone={metrics.security.recentLoginFailures > 5 ? "warning" : "neutral"} />
              <MiniMetric label="Rate limits activos" value={metrics.security.recentRateLimits} tone={metrics.security.recentRateLimits > 0 ? "warning" : "neutral"} />
              <MiniMetric label="Sesiones MFA" value={metrics.security.activeSessions} tone="success" />
              <MiniMetric label="Revocadas 24h" value={metrics.security.revokedSessions24h} tone="neutral" />
              <MiniMetric label="Archivos infectados" value={metrics.security.infectedFiles} tone={metrics.security.infectedFiles > 0 ? "danger" : "neutral"} />
              <MiniMetric label="Uploads rechazados" value={metrics.security.rejectedFiles} tone={metrics.security.rejectedFiles > 0 ? "warning" : "neutral"} />
            </div>
          </Card>

          {/* Offline sync */}
          <Card>
            <CardHeader icon={<Wifi />} title="Offline y PWA" description="Estado de sincronizacion offline." />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniMetric label="Conflictos offline" value={metrics.offline.conflictReceipts} tone={metrics.offline.conflictReceipts > 0 ? "warning" : "neutral"} />
              <MiniMetric label="Fallos offline" value={metrics.offline.failedReceipts} tone={metrics.offline.failedReceipts > 0 ? "danger" : "neutral"} />
            </div>
          </Card>

          {/* Base de datos */}
          <Card>
            <CardHeader icon={<Database />} title="Base de datos" description="Contadores principales." />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MiniMetric label="Usuarios" value={metrics.database.users} tone="neutral" />
              <MiniMetric label="Viajes activos" value={metrics.database.tripsActive} tone="neutral" />
              <MiniMetric label="Viajes cerrados" value={metrics.database.tripsClosed} tone="neutral" />
              <MiniMetric label="Solicitudes" value={metrics.database.serviceRequests} tone="neutral" />
              <MiniMetric label="Audit logs" value={metrics.database.auditLogs} tone="neutral" />
              <MiniMetric label="Sesiones activas" value={metrics.database.activeSessions} tone="neutral" />
            </div>
          </Card>
        </div>

        {/* Alertas activas */}
        {alerts.length > 0 && (
          <Card>
            <CardHeader icon={<AlertTriangle />} title="Alertas activas" description="Eventos que requieren atencion." />
            <div className="mt-4">
              <DataTable caption="Alertas activas del sistema">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Severidad</TableHeaderCell>
                    <TableHeaderCell>Titulo</TableHeaderCell>
                    <TableHeaderCell>Fuente</TableHeaderCell>
                    <TableHeaderCell className="text-right">Ocurrencias</TableHeaderCell>
                    <TableHeaderCell>Ultima vez</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <StatusBadge
                          label={alert.severity}
                          tone={alert.severity === "P0" ? "danger" : alert.severity === "P1" ? "warning" : "neutral"}
                        />
                      </TableCell>
                      <TableCell className="font-semibold">{alert.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{alert.source}</TableCell>
                      <TableCell className="text-right" numeric>{alert.occurrenceCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {alert.lastSeenAt.toISOString().replace("T", " ").slice(0, 19)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            </div>
          </Card>
        )}

        {alerts.length === 0 && (
          <Card>
            <div className="flex items-center gap-3 p-6">
              <CheckCircle2 className="size-5 text-success" />
              <p className="text-sm text-muted-foreground">No hay alertas activas. Todos los sistemas operan normalmente.</p>
            </div>
          </Card>
        )}

        {/* Backups */}
        <Card>
          <CardHeader icon={<HardDrive />} title="Backups" description="Estado del ultimo backup y drill." />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniMetric
              label="Ultimo backup"
              value={metrics.backups.lastJobRun ? metrics.backups.lastJobRun.status : "Sin registro"}
              tone={metrics.backups.lastJobRun?.status === "SUCCESS" ? "success" : "warning"}
            />
            <MiniMetric
              label="Ultimo DR drill"
              value={metrics.backups.lastDrillRun ? metrics.backups.lastDrillRun.status : "Sin registro"}
              tone={metrics.backups.lastDrillRun?.status === "SUCCESS" ? "success" : "warning"}
            />
          </div>
        </Card>

        <p className="text-xs text-faint-foreground">
          Ultima actualizacion: {health.checkedAt.replace("T", " ").slice(0, 19)} UTC — Uptime: {formatUptime(health.uptime)}
        </p>
      </div>
    </AppShell>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string | number; tone: "success" | "warning" | "danger" | "neutral" }) {
  const colors = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    neutral: "text-foreground",
  };
  return (
    <div className="rounded-lg border border-border bg-surface-alt p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Estado del Sistema",
  robots: { index: false, follow: false },
};
