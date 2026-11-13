import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Alert,
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
} from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { createInvitation, listPendingInvitations } from "@/lib/server/invitation-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const roleLabel: Record<string, string> = {
  TENANT_ADMIN: "Administrador",
  OPERATIONS_MANAGER: "Gerente operaciones",
  DISPATCHER: "Despachador",
  SAFETY_MANAGER: "Gerente seguridad",
  DRIVER: "Conductor",
};

/** Avisos del resultado de enviar una invitacion (codigos fijos, no texto reflejado). */
const NOTICES: Record<string, { tone: "success" | "warning" | "danger"; text: string }> = {
  sent: { tone: "success", text: "Invitacion enviada." },
  mail_failed: {
    tone: "warning",
    text: "No se pudo enviar el correo de invitacion. Revise la configuracion de correo y vuelva a enviarla.",
  },
  role_not_allowed: { tone: "danger", text: "Rol no permitido para invitacion." },
  invalid_email: { tone: "danger", text: "Correo invalido." },
  already_member: { tone: "danger", text: "El usuario ya es miembro de este tenant." },
  already_pending: { tone: "danger", text: "Ya existe una invitacion pendiente para este correo." },
  rate_limited: { tone: "danger", text: "Se alcanzo el limite de correos de alta por hora. Intente de nuevo mas tarde." },
};

export default async function TenantInvitationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { tenantSlug } = await params;
  const { notice } = await searchParams;
  const noticeData = notice ? NOTICES[notice] : undefined;
  const { user, tenant } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);

  const invitations = await listPendingInvitations(tenantSlug);

  async function handleInvite(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    const role = formData.get("role") as string;
    const result = await createInvitation(tenantSlug, email, role as "TENANT_ADMIN");
    const code = !result.ok ? result.code.toLowerCase() : result.warning ? "mail_failed" : "sent";
    redirect(`/t/${tenantSlug}/admin/invitations?notice=${code}`);
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
            { label: "Invitaciones" },
          ]}
          description="Invita usuarios al tenant via correo electronico."
          title="Invitaciones"
        />

        {noticeData ? <Alert tone={noticeData.tone}>{noticeData.text}</Alert> : null}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
          <Card>
            <CardHeader description="Invitaciones pendientes de aceptacion." icon={<Mail />} title="Pendientes" />
            <div className="mt-4">
              <DataTable caption="Invitaciones pendientes">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Correo</TableHeaderCell>
                    <TableHeaderCell>Rol</TableHeaderCell>
                    <TableHeaderCell>Invitado por</TableHeaderCell>
                    <TableHeaderCell>Expira</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {invitations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-faint-foreground py-8">
                        No hay invitaciones pendientes.
                      </TableCell>
                    </TableRow>
                  ) : (
                    invitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-semibold">{inv.email}</TableCell>
                        <TableCell><StatusBadge label={roleLabel[inv.role] ?? inv.role} tone="info" /></TableCell>
                        <TableCell>{inv.invitedBy.name}</TableCell>
                        <TableCell className="text-xs text-faint-foreground">
                          {inv.expiresAt.toLocaleDateString("es")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </DataTable>
            </div>
          </Card>

          <Card>
            <CardHeader description="Envia una invitacion a un nuevo usuario." icon={<Mail />} title="Nueva invitacion" />
            <form action={handleInvite} className="mt-4 grid gap-3.5">
              <Field label="Correo electronico" name="email" placeholder="usuario@ejemplo.com" type="email" />
              <SelectField label="Rol" name="role">
                <option value="TENANT_ADMIN">Administrador</option>
                <option value="OPERATIONS_MANAGER">Gerente de operaciones</option>
                <option value="DISPATCHER">Despachador</option>
                <option value="SAFETY_MANAGER">Gerente de seguridad</option>
                <option value="DRIVER">Conductor</option>
              </SelectField>
              <SubmitButton>Enviar invitacion</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
