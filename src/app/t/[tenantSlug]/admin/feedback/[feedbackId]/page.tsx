import { MessageSquare } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  PageHeader,
  SelectField,
  StatusBadge,
  SubmitButton,
  TextArea,
  TimelineItem,
} from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import {
  changeFeedbackStatusAction,
  addFeedbackCommentAction,
} from "@/lib/server/feedback-actions";
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

export default async function TenantFeedbackDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; feedbackId: string }>;
}) {
  const { tenantSlug, feedbackId } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const db = getDb();

  const feedback = await db.tenantFeedback.findFirst({
    where: { id: feedbackId, tenantId: tenant.id },
    include: {
      user: { select: { name: true, email: true } },
      comments: {
        where: { isInternal: false },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!feedback) notFound();

  const typeBadge = feedbackTypeBadge[feedback.type] ?? { label: feedback.type, tone: "neutral" as const };
  const statusBadge = feedbackStatusBadge[feedback.status] ?? { label: feedback.status, tone: "neutral" as const };

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
            { label: "Feedback", href: `/t/${tenantSlug}/admin/feedback` },
            { label: feedback.title },
          ]}
          description={`Reportado por ${feedback.user.name}`}
          title={feedback.title}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
          <div className="grid gap-6">
            <Card>
              <CardHeader description="Detalle del reporte." icon={<MessageSquare />} title="Informacion" />
              <div className="mt-4 grid gap-3">
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={typeBadge.label} tone={typeBadge.tone} />
                  <StatusBadge label={statusBadge.label} tone={statusBadge.tone} />
                  <StatusBadge label={`Prioridad: ${feedback.priority}`} tone={feedback.priority === "HIGH" ? "danger" : feedback.priority === "LOW" ? "neutral" : "warning"} />
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{feedback.description}</p>
                <dl className="grid gap-1 text-sm mt-2">
                  <div className="flex gap-2">
                    <dt className="text-faint-foreground">Reportado por:</dt>
                    <dd>{feedback.user.name} ({feedback.user.email})</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-faint-foreground">Fecha:</dt>
                    <dd>{feedback.createdAt.toLocaleString("es")}</dd>
                  </div>
                </dl>

                {feedback.response && (
                  <div className="mt-4 rounded-lg border border-border bg-surface-hover p-3">
                    <p className="text-xs font-semibold text-faint-foreground mb-1">Respuesta de la plataforma</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{feedback.response}</p>
                    {feedback.respondedAt && (
                      <p className="text-xs text-faint-foreground mt-1">
                        {feedback.respondedAt.toLocaleString("es")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader description="Conversacion." icon={<MessageSquare />} title="Comentarios" />
              <div className="mt-4">
                {feedback.comments.length === 0 ? (
                  <p className="text-sm text-faint-foreground py-4 text-center">Sin comentarios aun.</p>
                ) : (
                  <div className="grid gap-0">
                    {feedback.comments.map((c, i) => (
                      <TimelineItem
                        key={c.id}
                        title={c.author.name}
                        description={c.body}
                        meta={c.createdAt.toLocaleString("es")}
                        isLast={i === feedback.comments.length - 1}
                      />
                    ))}
                  </div>
                )}

                <form action={addFeedbackCommentAction} className="mt-4 grid gap-3 border-t border-border pt-4">
                  <input type="hidden" name="feedbackId" value={feedbackId} />
                  <input type="hidden" name="context" value="tenant" />
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <TextArea label="Nuevo comentario" name="body" placeholder="Escribe un comentario..." />
                  <SubmitButton>Agregar comentario</SubmitButton>
                </form>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader description="Cambiar el estado del reporte." icon={<MessageSquare />} title="Cambiar estado" />
            <form action={changeFeedbackStatusAction} className="mt-4 grid gap-3">
              <input type="hidden" name="feedbackId" value={feedbackId} />
              <input type="hidden" name="context" value="tenant" />
              <input type="hidden" name="tenantSlug" value={tenantSlug} />
              <SelectField defaultValue={feedback.status} label="Estado" name="status">
                <option value="SUBMITTED">Enviado</option>
                <option value="IN_REVIEW">En revision</option>
                <option value="ACKNOWLEDGED">Reconocido</option>
                <option value="IN_PROGRESS">En progreso</option>
                <option value="RESOLVED">Resuelto</option>
                <option value="CLOSED">Cerrado</option>
              </SelectField>
              <SubmitButton>Actualizar estado</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
