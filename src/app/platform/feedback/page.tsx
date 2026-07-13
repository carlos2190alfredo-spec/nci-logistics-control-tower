import { MessageSquare } from "lucide-react";
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

const feedbackTypeBadge: Record<string, { label: string; tone: StatusTone }> = {
  BUG: { label: "Bug", tone: "danger" },
  FEATURE_REQUEST: { label: "Feature", tone: "info" },
  UX: { label: "UX", tone: "neutral" },
  PERFORMANCE: { label: "Rendimiento", tone: "warning" },
  INTEGRATION: { label: "Integracion", tone: "neutral" },
  OTHER: { label: "Otro", tone: "neutral" },
};

const feedbackStatusBadge: Record<string, { label: string; tone: StatusTone }> = {
  SUBMITTED: { label: "Enviado", tone: "info" },
  IN_REVIEW: { label: "En revision", tone: "warning" },
  ACKNOWLEDGED: { label: "Reconocido", tone: "neutral" },
  IN_PROGRESS: { label: "En progreso", tone: "progress" },
  RESOLVED: { label: "Resuelto", tone: "success" },
  CLOSED: { label: "Cerrado", tone: "neutral" },
  WONT_FIX: { label: "No se arreglara", tone: "danger" },
};

export default async function PlatformFeedbackPage() {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const db = getDb();
  const feedback = await db.tenantFeedback.findMany({
    include: { tenant: { select: { name: true, slug: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const total = await db.tenantFeedback.count();
  const open = await db.tenantFeedback.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW", "ACKNOWLEDGED", "IN_PROGRESS"] } } });
  const resolved = await db.tenantFeedback.count({ where: { status: { in: ["RESOLVED", "CLOSED"] } } });

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Plataforma", href: "/platform" }, { label: "Feedback" }]}
          description="Feedback recibido de los tenants de la plataforma."
          title="Feedback de Tenants"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={<MessageSquare />} label="Total feedback" value={total} />
          <MetricCard icon={<MessageSquare />} label="Abiertos" tone="warning" value={open} />
          <MetricCard icon={<MessageSquare />} label="Resueltos" tone="success" value={resolved} />
        </div>

        <Card>
          <CardHeader
            description="Ultimos 50 reportes de feedback de tenants."
            icon={<MessageSquare />}
            title="Feedback reciente"
          />
          <div className="mt-4">
            <DataTable caption="Feedback de tenants">
              <TableHead>
                <tr>
                  <TableHeaderCell>Tenant</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Titulo</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Prioridad</TableHeaderCell>
                  <TableHeaderCell>Reportado por</TableHeaderCell>
                  <TableHeaderCell>Fecha</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {feedback.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-faint-foreground py-8">
                      No hay feedback registrado aun.
                    </TableCell>
                  </TableRow>
                ) : (
                  feedback.map((f) => {
                    const typeBadge = feedbackTypeBadge[f.type] ?? { label: f.type, tone: "neutral" as const };
                    const statusBadge = feedbackStatusBadge[f.status] ?? { label: f.status, tone: "neutral" as const };
                    return (
                      <TableRow key={f.id}>
                        <TableCell>
                          <p className="font-semibold text-foreground">{f.tenant.name}</p>
                        </TableCell>
                        <TableCell><StatusBadge label={typeBadge.label} tone={typeBadge.tone} /></TableCell>
                        <TableCell><span className="line-clamp-1">{f.title}</span></TableCell>
                        <TableCell><StatusBadge label={statusBadge.label} tone={statusBadge.tone} /></TableCell>
                        <TableCell>{f.priority}</TableCell>
                        <TableCell>{f.user.name}</TableCell>
                        <TableCell className="text-xs text-faint-foreground">{f.createdAt.toLocaleDateString("es")}</TableCell>
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
