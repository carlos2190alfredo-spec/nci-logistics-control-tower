import { KeyRound, Lock, ShieldCheck } from "lucide-react";
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
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function TenantSecurityPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
  ]);

  const db = getDb();
  const [members, auditCount, recentAudit, mfaCount] = await Promise.all([
    db.tenantMembership.findMany({
      where: { tenantId: tenant.id, active: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            mfaSecret: { select: { verifiedAt: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.count({ where: { tenantId: tenant.id } }),
    db.auditLog.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        entity: true,
        actorRole: true,
        createdAt: true,
      },
    }),
    db.tenantMembership.count({
      where: {
        tenantId: tenant.id,
        active: true,
        user: { mfaSecret: { verifiedAt: { not: null } } },
      },
    }),
  ]);

  const totalMembers = members.length;
  const mfaPercent = totalMembers > 0 ? Math.round((mfaCount / totalMembers) * 100) : 0;

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
            { label: "Seguridad" },
          ]}
          description="Resumen de seguridad, MFA y registros de auditoria del tenant."
          title="Seguridad"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={<ShieldCheck />} label="Adopcion MFA" tone="primary" value={`${mfaPercent}%`} />
          <MetricCard icon={<KeyRound />} label="Usuarios con MFA" value={`${mfaCount} / ${totalMembers}`} />
          <MetricCard icon={<Lock />} label="Eventos de auditoria" value={auditCount} />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader
              description="Estado de autenticacion multifactor por usuario."
              icon={<KeyRound />}
              title="Estado MFA por usuario"
            />
            <div className="mt-4">
              <DataTable caption="Usuarios y estado MFA">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Usuario</TableHeaderCell>
                    <TableHeaderCell>Correo</TableHeaderCell>
                    <TableHeaderCell>Rol</TableHeaderCell>
                    <TableHeaderCell>MFA</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {members.map((m) => {
                    const hasMfa = !!m.user.mfaSecret?.verifiedAt;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-semibold">{m.user.name}</TableCell>
                        <TableCell className="text-xs">{m.user.email}</TableCell>
                        <TableCell><code className="text-xs">{m.role}</code></TableCell>
                        <TableCell>
                          <StatusBadge
                            label={hasMfa ? "Activo" : "Sin configurar"}
                            tone={hasMfa ? "success" : "warning"}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </DataTable>
            </div>
          </Card>

          <Card>
            <CardHeader
              description="Ultimos 10 eventos de auditoria del tenant."
              icon={<Lock />}
              title="Auditoria reciente"
            />
            <div className="mt-4">
              <DataTable caption="Eventos de auditoria recientes">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Accion</TableHeaderCell>
                    <TableHeaderCell>Entidad</TableHeaderCell>
                    <TableHeaderCell>Rol</TableHeaderCell>
                    <TableHeaderCell>Fecha</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {recentAudit.length === 0 ? (
                    <TableRow>
                      <TableCell className="text-center text-faint-foreground" colSpan={4}>
                        Sin eventos de auditoria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentAudit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-semibold text-xs">{a.action}</TableCell>
                        <TableCell className="text-xs">{a.entity}</TableCell>
                        <TableCell><code className="text-xs">{a.actorRole ?? "—"}</code></TableCell>
                        <TableCell className="text-xs">
                          {a.createdAt.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
                          {" "}
                          {a.createdAt.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </DataTable>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
