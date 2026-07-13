import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
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
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getPlatformNavGroups, platformRoleLabel } from "@/lib/ui/platform-nav";
import { tenantStatusLabel, tenantStatusTone } from "@/lib/ui/status";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function TenantsPage() {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const db = getDb();
  const tenants = await db.tenant.findMany({
    include: {
      plan: true,
      settings: true,
      _count: { select: { trips: true, customers: true, memberships: true, feedback: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Plataforma", href: "/platform" }, { label: "Tenants" }]}
          description={`${tenants.length} tenant(s) registrados en la plataforma.`}
          title="Gestion de Tenants"
        />

        <Card>
          <CardHeader
            description="Todos los tenants con su estado, plan y metricas."
            icon={<Building2 />}
            title="Tenants registrados"
          />
          <div className="mt-4">
            <DataTable caption="Lista completa de tenants">
              <TableHead>
                <tr>
                  <TableHeaderCell>Tenant</TableHeaderCell>
                  <TableHeaderCell>Slug</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Plan</TableHeaderCell>
                  <TableHeaderCell>Suscripcion</TableHeaderCell>
                  <TableHeaderCell className="text-right">Usuarios</TableHeaderCell>
                  <TableHeaderCell className="text-right">Clientes</TableHeaderCell>
                  <TableHeaderCell className="text-right">Viajes</TableHeaderCell>
                  <TableHeaderCell className="text-right">Feedback</TableHeaderCell>
                  <TableHeaderCell><span className="sr-only">Acciones</span></TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <p className="font-semibold text-foreground">{tenant.name}</p>
                      <p className="text-xs text-faint-foreground">{tenant.legalName}</p>
                    </TableCell>
                    <TableCell><code className="text-xs">/{tenant.slug}</code></TableCell>
                    <TableCell>
                      <StatusBadge label={tenantStatusLabel[tenant.status]} tone={tenantStatusTone[tenant.status]} />
                    </TableCell>
                    <TableCell>{tenant.plan.name}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={tenant.subscriptionStatus}
                        tone={tenant.subscriptionStatus === "ACTIVE" ? "success" : tenant.subscriptionStatus === "TRIAL" ? "info" : "warning"}
                      />
                    </TableCell>
                    <TableCell className="text-right" numeric>{tenant._count.memberships}</TableCell>
                    <TableCell className="text-right" numeric>{tenant._count.customers}</TableCell>
                    <TableCell className="text-right" numeric>{tenant._count.trips}</TableCell>
                    <TableCell className="text-right" numeric>{tenant._count.feedback}</TableCell>
                    <TableCell>
                      <Link
                        className="inline-flex items-center gap-1 font-semibold text-primary transition-colors hover:text-primary-hover"
                        href={`/t/${tenant.slug}`}
                      >
                        Abrir <ArrowRight aria-hidden className="size-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
