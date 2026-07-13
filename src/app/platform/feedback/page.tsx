import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  DataTable,
  MetricCard,
  PageHeader,
  Pagination,
  SearchToolbar,
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
import { parsePagination, paginatedResult, buildPageUrl } from "@/lib/pagination/parse";
import type { StatusTone } from "@/lib/ui/status";
import type { Prisma } from "@/generated/prisma";
import { FeedbackStatus, FeedbackType } from "@/generated/prisma";

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

export default async function PlatformFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const pg = parsePagination(await searchParams, {
    defaultPageSize: 20,
    filterKeys: ["status", "type"],
  });

  const db = getDb();
  const where: Prisma.TenantFeedbackWhereInput = {};

  if (pg.search) {
    where.OR = [
      { title: { contains: pg.search, mode: "insensitive" } },
      { description: { contains: pg.search, mode: "insensitive" } },
      { tenant: { name: { contains: pg.search, mode: "insensitive" } } },
    ];
  }
  if (pg.filters.status) {
    where.status = pg.filters.status as FeedbackStatus;
  }
  if (pg.filters.type) {
    where.type = pg.filters.type as FeedbackType;
  }

  const [feedback, total, openCount, resolvedCount] = await Promise.all([
    db.tenantFeedback.findMany({
      where,
      include: {
        tenant: { select: { name: true, slug: true } },
        user: { select: { name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    db.tenantFeedback.count({ where }),
    db.tenantFeedback.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW", "ACKNOWLEDGED", "IN_PROGRESS"] } } }),
    db.tenantFeedback.count({ where: { status: { in: ["RESOLVED", "CLOSED"] } } }),
  ]);

  const result = paginatedResult(feedback, total, pg);
  const basePath = "/platform/feedback";

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
          description={`${total} reporte(s) de feedback.`}
          title="Feedback de Tenants"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={<MessageSquare />} label="Total feedback" value={total} />
          <MetricCard icon={<MessageSquare />} label="Abiertos" tone="warning" value={openCount} />
          <MetricCard icon={<MessageSquare />} label="Resueltos" tone="success" value={resolvedCount} />
        </div>

        <SearchToolbar
          filters={[
            {
              key: "status",
              label: "Estado",
              options: [
                { value: "SUBMITTED", label: "Enviado" },
                { value: "IN_REVIEW", label: "En revision" },
                { value: "ACKNOWLEDGED", label: "Reconocido" },
                { value: "IN_PROGRESS", label: "En progreso" },
                { value: "RESOLVED", label: "Resuelto" },
                { value: "CLOSED", label: "Cerrado" },
                { value: "WONT_FIX", label: "No se arreglara" },
              ],
            },
            {
              key: "type",
              label: "Tipo",
              options: [
                { value: "BUG", label: "Bug" },
                { value: "FEATURE_REQUEST", label: "Feature" },
                { value: "UX", label: "UX" },
                { value: "PERFORMANCE", label: "Rendimiento" },
                { value: "INTEGRATION", label: "Integracion" },
                { value: "OTHER", label: "Otro" },
              ],
            },
          ]}
          placeholder="Buscar por titulo, descripcion o tenant..."
        />

        <Card>
          <CardHeader
            description="Reportes de feedback de los tenants."
            icon={<MessageSquare />}
            title="Feedback"
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
                  <TableHeaderCell>Comentarios</TableHeaderCell>
                  <TableHeaderCell>Fecha</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {feedback.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-faint-foreground py-8">
                      No hay feedback registrado aun.
                    </TableCell>
                  </TableRow>
                ) : (
                  feedback.map((f) => {
                    const typeBadge = feedbackTypeBadge[f.type] ?? { label: f.type, tone: "neutral" as const };
                    const statusBd = feedbackStatusBadge[f.status] ?? { label: f.status, tone: "neutral" as const };
                    return (
                      <TableRow key={f.id}>
                        <TableCell>
                          <p className="font-semibold text-foreground">{f.tenant.name}</p>
                        </TableCell>
                        <TableCell><StatusBadge label={typeBadge.label} tone={typeBadge.tone} /></TableCell>
                        <TableCell>
                          <Link className="font-semibold text-primary hover:text-primary-hover line-clamp-1" href={`${basePath}/${f.id}`}>
                            {f.title}
                          </Link>
                        </TableCell>
                        <TableCell><StatusBadge label={statusBd.label} tone={statusBd.tone} /></TableCell>
                        <TableCell>{f.priority}</TableCell>
                        <TableCell>{f.user.name}</TableCell>
                        <TableCell className="text-sm" numeric>{f._count.comments}</TableCell>
                        <TableCell className="text-xs text-faint-foreground">{f.createdAt.toLocaleDateString("es")}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </DataTable>
          </div>
          <div className="mt-4">
            <Pagination
              buildUrl={(p) => buildPageUrl(basePath, pg, p)}
              hasNext={result.hasNext}
              hasPrev={result.hasPrev}
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
