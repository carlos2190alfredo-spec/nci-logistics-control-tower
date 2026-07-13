import { MessageSquare } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  DataTable,
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
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { audit } from "@/lib/server/audit";
import type { StatusTone } from "@/lib/ui/status";

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

export default async function TenantFeedbackPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const db = getDb();

  const feedback = await db.tenantFeedback.findMany({
    where: { tenantId: tenant.id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

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
        type: type as "BUG",
        title: title.trim().slice(0, 200),
        description: description.trim().slice(0, 2000),
      },
    });

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      actorRole: ctx.membership.role,
      action: "feedback.submit",
      entity: "TenantFeedback",
      after: { title, type },
    });
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
          description="Reporta problemas, solicita funcionalidades o da feedback a la plataforma."
          title="Feedback"
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
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
                    <TableHeaderCell>Fecha</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {feedback.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-faint-foreground py-8">
                        No hay feedback enviado aun.
                      </TableCell>
                    </TableRow>
                  ) : (
                    feedback.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell><StatusBadge label={f.type} tone="neutral" /></TableCell>
                        <TableCell><span className="line-clamp-1">{f.title}</span></TableCell>
                        <TableCell>
                          <StatusBadge
                            label={feedbackStatusLabel[f.status] ?? f.status}
                            tone={feedbackStatusTone[f.status] ?? "neutral"}
                          />
                        </TableCell>
                        <TableCell>{f.user.name}</TableCell>
                        <TableCell className="text-xs text-faint-foreground">
                          {f.createdAt.toLocaleDateString("es")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </DataTable>
            </div>
          </Card>

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
