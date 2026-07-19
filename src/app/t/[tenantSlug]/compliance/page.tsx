import { ShieldCheck, TriangleAlert, FileWarning, Plus } from "lucide-react";
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
import { requireTenantRole } from "@/lib/server/auth";
import { getComplianceOverview } from "@/lib/server/compliance-data";
import { createComplianceDocumentAction } from "@/lib/server/compliance-actions";
import {
  approveComplianceExceptionAction,
  revokeComplianceExceptionAction,
} from "@/lib/server/exception-actions";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";
import {
  complianceEntityLabel,
  complianceLightLabel,
  complianceLightTone,
  complianceSeverityLabel,
  complianceSeverityTone,
  complianceStatusLabel,
  complianceStatusTone,
} from "@/lib/ui/compliance";
import { formatDateShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ENTITY_OPTIONS = Object.entries(complianceEntityLabel);
const SEVERITY_OPTIONS = Object.entries(complianceSeverityLabel);

export default async function CompliancePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
    "SAFETY_MANAGER",
  ]);

  const canManage = hasPermission(membership.role, "tenant.compliance.manage");
  const canApproveExceptions = hasPermission(membership.role, "tenant.exceptions.approve");
  const exceptions = await getDb().complianceException.findMany({
    where: { tenantId: tenant.id, revokedAt: null },
    orderBy: [{ approvedAt: "desc" }],
    take: 50,
  });
  const overview = await getComplianceOverview(tenant.id);

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Cumplimiento" },
          ]}
          description="Registro documental, vencimientos y habilitación operativa."
          meta={
            <StatusBadge
              label={`Semáforo: ${complianceLightLabel[overview.light]}`}
              tone={complianceLightTone[overview.light]}
            />
          }
          title="Cumplimiento y documentos"
        />

        {/* Aviso obligatorio de validación humana */}
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          <p className="font-semibold">Aviso de cumplimiento</p>
          <p className="mt-0.5 text-warning-foreground/90">
            Esta herramienta es un sistema configurable de registro, verificación y alertas.
            No sustituye a las autoridades competentes (ATTT, Aduanas, Bomberos, AMP, PORTCEL,
            terminales, navieras) ni constituye asesoría legal. Valide periódicamente los
            requisitos con las autoridades y asesores correspondientes.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader icon={<FileWarning />} title="Vencidos" />
            <p className="mt-2 text-3xl font-bold text-foreground">{overview.counts.VENCIDO}</p>
          </Card>
          <Card>
            <CardHeader icon={<TriangleAlert />} title="Próximos a vencer" />
            <p className="mt-2 text-3xl font-bold text-foreground">{overview.counts.PROXIMO_A_VENCER}</p>
          </Card>
          <Card>
            <CardHeader icon={<ShieldCheck />} title="Vigentes" />
            <p className="mt-2 text-3xl font-bold text-foreground">{overview.counts.VIGENTE}</p>
          </Card>
          <Card>
            <CardHeader icon={<TriangleAlert />} title="Bloquean despacho" />
            <p className="mt-2 text-3xl font-bold text-foreground">{overview.blockingCount}</p>
          </Card>
        </div>

        {canManage ? (
          <Collapsible icon={<Plus />} summary="Registrar documento" tone="default">
            <form
              action={createComplianceDocumentAction.bind(null, tenantSlug)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <SelectField label="Tipo de entidad" name="entityType">
                {ENTITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <Field help="ID o código de la entidad (placa, código de conductor, etc.)." label="Entidad" name="entityId" placeholder="DRV-001" required />
              <Field label="Tipo de documento" name="documentType" placeholder="Licencia, PPC, Seguro…" required />
              <Field label="Nombre" name="name" placeholder="Licencia categoría C" required />
              <Field label="Número" name="number" placeholder="LC-123456" required={false} />
              <Field label="Autoridad emisora" name="issuingAuthority" placeholder="ATTT" required={false} />
              <Field label="Titular" name="holder" placeholder="Pedro Martínez" required={false} />
              <Field label="Fecha de emisión" name="issuedAt" required={false} type="date" />
              <Field label="Fecha de vencimiento" name="expiresAt" required={false} type="date" />
              <SelectField label="Criticidad" name="criticality">
                {SEVERITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <label className="flex items-center gap-2 self-end text-sm text-foreground">
                <input className="size-4 rounded border-border accent-primary" name="blocksDispatch" type="checkbox" />
                Bloquea el despacho si vence
              </label>
              <div className="sm:col-span-2">
                <TextArea label="Observaciones" name="notes" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Registrar documento</SubmitButton>
              </div>
            </form>
          </Collapsible>
        ) : null}

        <Card>
          <CardHeader description="Documentos registrados y su estado efectivo." icon={<ShieldCheck />} title="Documentos" />
          <div className="mt-4 overflow-x-auto">
            {overview.documents.length ? (
              <DataTable caption="Documentos de cumplimiento">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Entidad</TableHeaderCell>
                    <TableHeaderCell>Documento</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Vence</TableHeaderCell>
                    <TableHeaderCell>Criticidad</TableHeaderCell>
                    <TableHeaderCell>Despacho</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {overview.documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <span className="font-medium text-foreground">{complianceEntityLabel[doc.entityType]}</span>
                        <span className="block text-xs text-muted-foreground">{doc.entityId}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">{doc.name}</span>
                        <span className="block text-xs text-muted-foreground">{doc.documentType}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={complianceStatusLabel[doc.effectiveStatus]}
                          tone={complianceStatusTone[doc.effectiveStatus]}
                        />
                      </TableCell>
                      <TableCell>
                        {doc.expiresAt ? (
                          <>
                            <span className="tabular-nums">{formatDateShort(doc.expiresAt)}</span>
                            {doc.daysUntilExpiry !== null ? (
                              <span className="block text-xs text-muted-foreground">
                                {doc.daysUntilExpiry <= 0
                                  ? `hace ${Math.abs(doc.daysUntilExpiry)} d`
                                  : `en ${doc.daysUntilExpiry} d`}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={complianceSeverityLabel[doc.criticality]}
                          tone={complianceSeverityTone[doc.criticality]}
                        />
                      </TableCell>
                      <TableCell>{doc.blocksDispatch ? "Sí" : "No"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            ) : (
              <EmptyState
                description="Registre licencias, permisos, seguros e inspecciones para controlar sus vencimientos."
                icon={<ShieldCheck />}
                title="Sin documentos de cumplimiento"
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            description="Excepciones aprobadas que permiten un despacho pese a un bloqueo. Requieren justificación, alcance y expiración."
            icon={<ShieldCheck />}
            title="Excepciones vigentes"
          />
          <div className="mt-4 overflow-x-auto">
            {exceptions.length ? (
              <DataTable caption="Excepciones aprobadas">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Motivo (gate)</TableHeaderCell>
                    <TableHeaderCell>Alcance</TableHeaderCell>
                    <TableHeaderCell>Objetivo</TableHeaderCell>
                    <TableHeaderCell>Vence</TableHeaderCell>
                    <TableHeaderCell>Justificación</TableHeaderCell>
                    {canApproveExceptions ? (
                      <TableHeaderCell>
                        <span className="sr-only">Acciones</span>
                      </TableHeaderCell>
                    ) : null}
                  </tr>
                </TableHead>
                <TableBody>
                  {exceptions.map((ex) => (
                    <TableRow key={ex.id}>
                      <TableCell>{ex.gate === "COMPLIANCE" ? "Cumplimiento" : "Mantenimiento"}</TableCell>
                      <TableCell>{ex.scope === "TRIP" ? "Viaje" : "Activo"}</TableCell>
                      <TableCell className="font-mono text-xs">{ex.targetKey}</TableCell>
                      <TableCell numeric>{ex.expiresAt ? formatDateShort(ex.expiresAt) : "—"}</TableCell>
                      <TableCell>
                        <span className="line-clamp-2 text-sm">{ex.justification}</span>
                      </TableCell>
                      {canApproveExceptions ? (
                        <TableCell>
                          <form action={revokeComplianceExceptionAction.bind(null, tenantSlug)}>
                            <input name="exceptionId" type="hidden" value={ex.id} />
                            <button
                              className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20"
                              type="submit"
                            >
                              Revocar
                            </button>
                          </form>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            ) : (
              <EmptyState
                compact
                description="No hay excepciones aprobadas en este momento."
                icon={<ShieldCheck />}
                title="Sin excepciones vigentes"
              />
            )}
          </div>

          {canApproveExceptions ? (
            <details className="mt-4 rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Aprobar excepción
              </summary>
              <form
                action={approveComplianceExceptionAction.bind(null, tenantSlug)}
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <SelectField label="Gate" name="gate">
                  <option value="COMPLIANCE">Cumplimiento</option>
                  <option value="MAINTENANCE">Mantenimiento</option>
                </SelectField>
                <SelectField label="Alcance" name="scope">
                  <option value="ASSET">Activo</option>
                  <option value="TRIP">Viaje específico</option>
                </SelectField>
                <Field
                  help="Alcance ASSET: use VEHICULO:CODIGO / EQUIPO:CODIGO / CONDUCTOR:CODIGO. Alcance TRIP: id del viaje."
                  label="Objetivo"
                  name="targetKey"
                  placeholder="VEHICULO:VH-1"
                  required
                />
                <Field label="Vence" name="expiresAt" required={false} type="datetime-local" />
                <div className="sm:col-span-2">
                  <TextArea label="Justificación" name="justification" required />
                </div>
                <Field label="Referencia de evidencia" name="evidenceRef" required={false} />
                <div className="sm:col-span-2">
                  <SubmitButton>Aprobar excepción</SubmitButton>
                </div>
              </form>
            </details>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}
