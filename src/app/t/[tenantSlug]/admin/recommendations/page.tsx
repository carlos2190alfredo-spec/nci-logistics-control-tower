import { Brain, Sparkles } from "lucide-react";
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
  SubmitButton,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { parsePagination, paginatedResult, buildPageUrl } from "@/lib/pagination/parse";
import {
  changeRecommendationStatusAction,
  generateRecommendationsAction,
  toggleAiSettingAction,
} from "@/lib/server/ai-actions";
import type { StatusTone } from "@/lib/ui/status";
import type { Prisma } from "@/generated/prisma";
import { AiRecommendationStatus, AiRecommendationType } from "@/generated/prisma";

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
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const pg = parsePagination(await searchParams, {
    defaultPageSize: 20,
    filterKeys: ["status", "type"],
  });

  const db = getDb();
  const baseWhere: Prisma.AiRecommendationWhereInput = { tenantId: tenant.id };

  if (pg.search) {
    baseWhere.OR = [
      { title: { contains: pg.search, mode: "insensitive" } },
      { description: { contains: pg.search, mode: "insensitive" } },
    ];
  }
  if (pg.filters.status) {
    baseWhere.status = pg.filters.status as AiRecommendationStatus;
  }
  if (pg.filters.type) {
    baseWhere.type = pg.filters.type as AiRecommendationType;
  }

  const [recommendations, total, pending, acted, aiSetting] = await Promise.all([
    db.aiRecommendation.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    db.aiRecommendation.count({ where: baseWhere }),
    db.aiRecommendation.count({ where: { tenantId: tenant.id, status: "PENDING" } }),
    db.aiRecommendation.count({ where: { tenantId: tenant.id, status: "ACTED" } }),
    db.tenantAiSetting.findUnique({ where: { tenantId: tenant.id } }),
  ]);

  const result = paginatedResult(recommendations, total, pg);
  const basePath = `/t/${tenantSlug}/admin/recommendations`;
  const aiEnabled = aiSetting?.enabled ?? false;

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

        <div className="grid gap-4 sm:grid-cols-4">
          <MetricCard icon={<Brain />} label="Total" value={total} />
          <MetricCard
            icon={<Brain />}
            label="Pendientes"
            tone={pending > 0 ? "warning" : "success"}
            value={pending}
          />
          <MetricCard icon={<Brain />} label="Actuadas" tone="success" value={acted} />
          <MetricCard
            icon={<Sparkles />}
            label="Motor IA"
            tone={aiEnabled ? "success" : "warning"}
            value={aiEnabled ? "Activo" : "Inactivo"}
          />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
          <div className="grid gap-4">
            <SearchToolbar
              filters={[
                {
                  key: "status",
                  label: "Estado",
                  options: [
                    { value: "PENDING", label: "Pendiente" },
                    { value: "VIEWED", label: "Visto" },
                    { value: "ACTED", label: "Actuado" },
                    { value: "DISMISSED", label: "Descartado" },
                  ],
                },
                {
                  key: "type",
                  label: "Tipo",
                  options: [
                    { value: "OPTIMIZATION", label: "Optimizacion" },
                    { value: "ALERT", label: "Alerta" },
                    { value: "INSIGHT", label: "Analisis" },
                    { value: "SUGGESTION", label: "Sugerencia" },
                  ],
                },
              ]}
              placeholder="Buscar recomendaciones..."
            />

            <Card>
              <CardHeader
                description="Recomendaciones del motor IA basado en reglas."
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
                      <TableHeaderCell><span className="sr-only">Acciones</span></TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {recommendations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-faint-foreground py-8">
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
                          <TableCell>
                            <p className="line-clamp-1 font-semibold text-foreground">{r.title}</p>
                            <p className="line-clamp-1 text-xs text-faint-foreground">{r.description}</p>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={statusLabel[r.status] ?? r.status}
                              tone={r.status === "ACTED" ? "success" : r.status === "PENDING" ? "warning" : "neutral"}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-faint-foreground">
                            {r.createdAt.toLocaleDateString("es")}
                          </TableCell>
                          <TableCell>
                            {r.status === "PENDING" && (
                              <div className="flex gap-1">
                                <form action={changeRecommendationStatusAction}>
                                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                                  <input type="hidden" name="recommendationId" value={r.id} />
                                  <input type="hidden" name="status" value="ACTED" />
                                  <button className="text-xs font-semibold text-success hover:text-success/80 px-1.5 py-0.5" type="submit">
                                    Actuar
                                  </button>
                                </form>
                                <form action={changeRecommendationStatusAction}>
                                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                                  <input type="hidden" name="recommendationId" value={r.id} />
                                  <input type="hidden" name="status" value="DISMISSED" />
                                  <button className="text-xs font-semibold text-faint-foreground hover:text-foreground px-1.5 py-0.5" type="submit">
                                    Descartar
                                  </button>
                                </form>
                              </div>
                            )}
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

          <div className="grid gap-4">
            <Card>
              <CardHeader description="Configura el motor de recomendaciones." icon={<Sparkles />} title="Motor IA" />
              <div className="mt-4 grid gap-3">
                <p className="text-sm text-faint-foreground">
                  El motor IA analiza la operacion del tenant usando reglas deterministas para
                  generar recomendaciones de optimizacion, alertas y sugerencias. No utiliza
                  APIs externas ni modelos de IA.
                </p>
                <form action={toggleAiSettingAction} className="mt-2">
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <SubmitButton>
                    {aiEnabled ? "Desactivar motor IA" : "Activar motor IA"}
                  </SubmitButton>
                </form>
              </div>
            </Card>

            {aiEnabled && (
              <Card>
                <CardHeader description="Ejecutar analisis manual." icon={<Brain />} title="Generar recomendaciones" />
                <div className="mt-4 grid gap-3">
                  <p className="text-sm text-faint-foreground">
                    Ejecuta el motor de reglas para analizar la operacion actual y generar
                    nuevas recomendaciones.
                  </p>
                  <form action={generateRecommendationsAction}>
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <SubmitButton>Generar ahora</SubmitButton>
                  </form>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
