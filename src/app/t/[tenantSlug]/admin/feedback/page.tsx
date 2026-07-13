import Link from "next/link";
import { MessageSquare, PlusCircle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  DataTable,
  Field,
  MetricCard,
  PageHeader,
  Pagination,
  SearchToolbar,
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
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { audit } from "@/lib/server/audit";
import { parsePagination, paginatedResult, buildPageUrl } from "@/lib/pagination/parse";
import type { StatusTone } from "@/lib/ui/status";
import type { Prisma } from "@/generated/prisma";
import { FeedbackStatus, FeedbackType } from "@/generated/prisma";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const feedbackStatusLabel: Record<string, string> = {
  SUBMITTED: "Enviado",
  IN_REVIEW: "En revision",
  ACKNOWLEDGED: "Reconocido",
  IN_PROGRESS: "En progreso",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
  WONT_FIX: "No se arreglara",
};

const feedbackStatusTone: Record<string, StatusTone> = {
  SUBMITTED: "info",
  IN_REVIEW: "warning",
  ACKNOWLEDGED: "neutral",
  IN_PROGRESS: "progress",
  RESOLVED: "success",
  CLOSED: "neutral",
  WONT_FIX: "danger",
};

const feedbackTypeLabel: Record<string, string> = {
  BUG: "Bug",
  FEATURE_REQUEST: "Feature",
  UX: "UX",
  PERFORMANCE: "Rendimiento",
  INTEGRATION: "Integracion",
  OTHER: "Otro",
};

export default async function TenantFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const pg = parsePagination(await searchParams, {
    defaultPageSize: 20,
    filterKeys: ["status", "type"],
  });

  const db = getDb();
  const baseWhere: Prisma.TenantFeedbackWhereInput = { tenantId: tenant.id };

  if (pg.search) {
    baseWhere.OR = [
      { title: { contains: pg.search, mode: "insensitive" } },
      { description: { contains: pg.search, mode: "insensitive" } },
    ];
  }
  if (pg.filters.status) {
    baseWhere.status = pg.filters.status as FeedbackStatus;
  }
  if (pg.filters.type) {
    baseWhere.type = pg.filters.type as FeedbackType;
  }

  const [feedback, total, openCount] = await Promise.all([
    db.tenantFeedback.findMany({
      where: baseWhere,
      include: {
        user: { select: { name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    db.tenantFeedback.count({ where: baseWhere }),
    db.tenantFeedback.count({
      where: { tenantId: tenant.id, status: { in: ["SUBMITTED", "IN_REVIEW", "ACKNOWLEDGED", "IN_PROGRESS"] } },
    }),
  ]);

  const result = paginatedResult(feedback, total, pg);
  const basePath = `/t/${tenantSlug}/admin/feedback`;

  async function submitFeedback(formData: FormData) {
    "use server";
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const type = formData.get("type") as string;

    if (!title?.trim() || !description?.trim()) return;

    const db2 = (await import("@/lib/server/db")).getDb();
    const ctx = await (await import("@/lib/server/auth")).requireTenantRole(tenantSlug, [
      "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
    ]);

    await db2.tenantFeedback.create({
      data: {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        type: type as FeedbackType,
        title: title.trim().slice(0, 200),
        description: description.trim().slice(0, 2000),
      },
    });

    await (await import("@/lib/server/audit")).audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      actorRole: ctx.membership.role,
      action: "feedback.submit",
      entity: "TenantFeedback",
      after: { title, type },
    });

    const { revalidatePath } = await import("next/cache");
    revalidatePath(basePath);
  }

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
            { label: "Feedback" },
          ]}
          description={`${total} reporte(s) de feedback. ${openCount} abierto(s).`}
          title="Feedback"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={<MessageSquare />} label="Total" value={total} />
          <MetricCard icon={<MessageSquare />} label="Abiertos" tone="warning" value={openCount} />
          <MetricCard icon={<MessageSquare />} label="Resueltos" tone="success" value={total - openCount} />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
          <div className="grid gap-4">
            <SearchToolbar
              filters={[
                {
                  key: "status",
                  label: "Estado",
                  options: [
                    { value: "SUBMITTED", label: "Enviado" },
                    { value: "IN_REVIEW", label: "En revision" },
                    { value: "IN_PROGRESS", label: "En progreso" },
                    { value: "RESOLVED", label: "Resuelto" },
                    { value: "CLOSED", label: "Cerrado" },
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
                    { value: "OTHER", label: "Otro" },
                  ],
                },
              ]}
              placeholder="Buscar por titulo..."
            />

            <Card>
              <CardHeader description="Feedback enviado desde este tenant." icon={<MessageSquare />} title="Historial" />
              <div className="mt-4">
                <DataTable caption="Feedback del tenant">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Tipo</TableHeaderCell>
                      <TableHeaderCell>Titulo</TableHeaderCell>
                      <TableHeaderCell>Estado</TableHeaderCell>
                      <TableHeaderCell>Reportado por</TableHeaderCell>
                      <TableHeaderCell>Comentarios</TableHeaderCell>
                      <TableHeaderCell>Fecha</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {feedback.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-faint-foreground py-8">
                          No hay feedback enviado aun.
                        </TableCell>
                      </TableRow>
                    ) : (
                      feedback.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell>
                            <StatusBadge label={feedbackTypeLabel[f.type] ?? f.type} tone="neutral" />
                          </TableCell>
                          <TableCell>
                            <Link className="font-semibold text-primary hover:text-primary-hover line-clamp-1" href={`${basePath}/${f.id}`}>
                              {f.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={feedbackStatusLabel[f.status] ?? f.status}
                              tone={feedbackStatusTone[f.status] ?? "neutral"}
                            />
                          </TableCell>
                          <TableCell>{f.user.name}</TableCell>
                          <TableCell className="text-sm" numeric>{f._count.comments}</TableCell>
                          <TableCell className="text-xs text-faint-foreground">
                            {f.createdAt.toLocaleDateString("es")}
                          </TableCell>
                        </TableRow>
                      ))
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

          <Card>
            <CardHeader description="Envia un nuevo reporte a la plataforma." icon={<MessageSquare />} title="Nuevo feedback" />
            <form action={submitFeedback} className="mt-4 grid gap-3.5">
              <SelectField label="Tipo" name="type">
                <option value="BUG">Bug</option>
                <option value="FEATURE_REQUEST">Solicitud de funcionalidad</option>
                <option value="UX">Experiencia de usuario</option>
                <option value="PERFORMANCE">Rendimiento</option>
                <option value="INTEGRATION">Integracion</option>
                <option value="OTHER">Otro</option>
              </SelectField>
              <Field label="Titulo" name="title" placeholder="Resumen breve del reporte" />
              <TextArea label="Descripcion" name="description" placeholder="Detalla el problema o la sugerencia..." />
              <SubmitButton>Enviar feedback</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
