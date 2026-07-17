import Link from "next/link";
import { Flame, ShieldAlert, TriangleAlert, Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  Collapsible,
  DataTable,
  EmptyState,
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
import { ExportCsvButton } from "@/components/tenant/export-csv-button";
import { requireTenantRole } from "@/lib/server/auth";
import { getHazmatShipments, summarizeHazmat } from "@/lib/server/hazmat-data";
import { createHazmatShipmentAction } from "@/lib/server/hazmat-actions";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";
import {
  hazmatClassLabel,
  hazmatComplianceLabel,
  hazmatComplianceTone,
  hazmatStatusLabel,
  hazmatStatusTone,
} from "@/lib/ui/hazmat";

export const dynamic = "force-dynamic";

export default async function HazmatPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
    "DISPATCHER",
    "SAFETY_MANAGER",
  ]);

  const shipments = await getHazmatShipments(tenant.id);
  const counts = summarizeHazmat(shipments);
  const canManage = hasPermission(membership.role, "tenant.hazmat.manage");

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          actions={
            <ExportCsvButton
              href={`/api/t/${tenantSlug}/export/hazmat`}
              label="Exportar hazmat"
            />
          }
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Combustible / Hazmat" },
          ]}
          description="Órdenes de combustible y mercancías peligrosas: documentación, permisos y aptitud."
          title="Combustible y mercancías peligrosas"
        />

        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          <p className="font-semibold">Aviso de cumplimiento</p>
          <p className="mt-0.5 text-warning-foreground/90">
            Este módulo administra cumplimiento, documentación y trazabilidad. No controla
            válvulas, bombas, cisternas ni equipos de despacho, ni sustituye a las autoridades
            (ATTT, Bomberos, autoridades aeroportuarias/portuarias). La aptitud se calcula de
            forma determinista sobre datos verificados; la IA no autoriza despachos.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader icon={<Flame />} title="Total" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.total}</p>
          </Card>
          <Card>
            <CardHeader icon={<Flame />} title="Activas" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.active}</p>
          </Card>
          <Card>
            <CardHeader icon={<ShieldAlert />} title="No cumplen" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.blocked}</p>
          </Card>
          <Card>
            <CardHeader icon={<TriangleAlert />} title="Por revisar" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.needsReview}</p>
          </Card>
        </div>

        {canManage ? (
          <Collapsible icon={<Plus />} summary="Registrar orden de carga peligrosa" tone="default">
            <form
              action={createHazmatShipmentAction.bind(null, tenantSlug)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <Field label="Referencia" name="reference" placeholder="EMPRESA-HZ-0001" required />
              <Field label="Producto" name="productName" placeholder="Diésel / Jet-A / …" required />
              <Field label="Número ONU" name="unNumber" placeholder="UN1202" required={false} />
              <SelectField label="Clase de peligro" name="hazardClass">
                <option value="NO_APLICA">No aplica</option>
                <option value="CLASE_3_LIQUIDOS_INFLAMABLES">Clase 3 · Líquidos inflamables</option>
                <option value="CLASE_2_GASES">Clase 2 · Gases</option>
                <option value="CLASE_1_EXPLOSIVOS">Clase 1 · Explosivos</option>
                <option value="CLASE_4_SOLIDOS_INFLAMABLES">Clase 4 · Sólidos inflamables</option>
                <option value="CLASE_5_COMBURENTES">Clase 5 · Comburentes</option>
                <option value="CLASE_6_TOXICOS">Clase 6 · Tóxicos</option>
                <option value="CLASE_7_RADIACTIVOS">Clase 7 · Radiactivos</option>
                <option value="CLASE_8_CORROSIVOS">Clase 8 · Corrosivos</option>
                <option value="CLASE_9_VARIOS">Clase 9 · Varios</option>
              </SelectField>
              <Field label="Hoja de seguridad (ref.)" name="safetyDataSheetRef" required={false} />
              <Field label="Propietario de la carga" name="cargoOwner" required={false} />
              <Field label="Punto de carga" name="loadPoint" required={false} />
              <Field label="Punto de entrega" name="deliveryPoint" required={false} />
              <Field label="Cantidad" name="quantity" required={false} type="number" />
              <Field label="Unidad" name="unit" placeholder="galones / litros" required={false} />
              <Field label="Conductor (código)" name="driverCode" placeholder="DR-1" required={false} />
              <Field label="Cabezal (código)" name="vehicleCode" placeholder="VH-1" required={false} />
              <Field label="Cisterna (código)" name="tankCode" required={false} />
              <Field label="Ruta autorizada" name="authorizedRoute" required={false} />
              <Field label="Horario autorizado" name="authorizedSchedule" required={false} />
              <Field label="Plan de contingencia (ref.)" name="contingencyPlanRef" required={false} />
              <div className="sm:col-span-2">
                <TextArea label="Observaciones" name="notes" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Registrar orden</SubmitButton>
              </div>
            </form>
          </Collapsible>
        ) : null}

        <Card>
          <CardHeader description="Órdenes registradas y su aptitud de cumplimiento." icon={<Flame />} title="Órdenes" />
          <div className="mt-4 overflow-x-auto">
            {shipments.length ? (
              <DataTable caption="Órdenes de carga peligrosa">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Referencia</TableHeaderCell>
                    <TableHeaderCell>Producto</TableHeaderCell>
                    <TableHeaderCell>Clase</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Cumplimiento</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {shipments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          className="font-mono font-semibold text-primary hover:underline"
                          href={`/t/${tenantSlug}/hazmat/${s.id}`}
                        >
                          {s.reference}
                        </Link>
                        {s.unNumber ? (
                          <span className="block text-xs text-muted-foreground">{s.unNumber}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{s.productName}</TableCell>
                      <TableCell>{hazmatClassLabel[s.hazardClass]}</TableCell>
                      <TableCell>
                        <StatusBadge label={hazmatStatusLabel[s.status]} tone={hazmatStatusTone[s.status]} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={hazmatComplianceLabel[s.complianceState]} tone={hazmatComplianceTone[s.complianceState]} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            ) : (
              <EmptyState
                description="Registre órdenes de combustible o mercancías peligrosas para controlar permisos, hojas de seguridad y aptitud."
                icon={<Flame />}
                title="Sin órdenes registradas"
              />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
