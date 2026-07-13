import { ClipboardList } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  DataTable,
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
import type { StatusTone } from "@/lib/ui/status";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const actionTone: Record<string, StatusTone> = {
  create: "success",
  update: "info",
  delete: "danger",
  login: "neutral",
  logout: "neutral",
};

function getActionTone(action: string): StatusTone {
  const prefix = action.split(".")[0];
  return actionTone[prefix] ?? "neutral";
}

export default async function TenantActivityPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN",
  ]);
  const db = getDb();

  const logs = await db.auditLog.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))] as string[];
  const actors = actorIds.length > 0
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a.name]));

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
            { label: "Actividad" },
          ]}
          description="Registro de auditoria de acciones en el tenant."
          title="Actividad"
        />

        <Card>
          <CardHeader
            description={`Ultimas ${logs.length} acciones registradas.`}
            icon={<ClipboardList />}
            title="Log de auditoria"
          />
          <div className="mt-4">
            <DataTable caption="Registro de actividad">
              <TableHead>
                <tr>
                  <TableHeaderCell>Accion</TableHeaderCell>
                  <TableHeaderCell>Entidad</TableHeaderCell>
                  <TableHeaderCell>Usuario</TableHeaderCell>
                  <TableHeaderCell>Rol</TableHeaderCell>
                  <TableHeaderCell>Fecha</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-faint-foreground py-8">
                      No hay actividad registrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <StatusBadge label={log.action} tone={getActionTone(log.action)} />
                      </TableCell>
                      <TableCell className="text-sm">{log.entity ?? "—"}</TableCell>
                      <TableCell className="font-semibold">
                        {log.actorId ? (actorMap.get(log.actorId) ?? "Desconocido") : "Sistema"}
                      </TableCell>
                      <TableCell className="text-xs text-faint-foreground">{log.actorRole ?? "—"}</TableCell>
                      <TableCell className="text-xs text-faint-foreground">
                        {log.createdAt.toLocaleString("es", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </DataTable>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
