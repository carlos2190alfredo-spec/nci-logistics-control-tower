import { Calendar, Clock, Plus, Trash2, Truck } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  SelectField,
  StatusBadge,
  SubmitButton,
  TextArea,
  DataTable,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  Alert,
} from "@/components/ui";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { tenantRoleLabel } from "@/lib/ui/status";
import {
  saveDriverScheduleAction,
  addAvailabilityExceptionAction,
  deleteAvailabilityExceptionAction,
} from "@/lib/server/driver-schedule-actions";
import { Collapsible } from "@/components/ui/collapsible";

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miercoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sabado",
  SUNDAY: "Domingo",
};

const DAYS_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  DAY_OFF: "Dia libre",
  VACATION: "Vacaciones",
  SICK_LEAVE: "Incapacidad",
  EXTRA_SHIFT: "Turno extra",
  CUSTOM_UNAVAILABLE: "No disponible",
};

export default async function DriverSchedulePage({
  params,
}: {
  params: Promise<{ tenantSlug: string; driverId: string }>;
}) {
  const { tenantSlug, driverId } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
  ]);

  const db = getDb();

  const driver = await db.driver.findFirstOrThrow({
    where: { id: driverId, tenantId: tenant.id },
  });

  const schedules = await db.driverWorkSchedule.findMany({
    where: { tenantId: tenant.id, driverId: driver.id },
    orderBy: { dayOfWeek: "asc" },
  });

  const exceptions = await db.driverAvailabilityException.findMany({
    where: { tenantId: tenant.id, driverId: driver.id },
    orderBy: { date: "desc" },
    take: 20,
  });

  const todayTrips = await db.trip.count({
    where: {
      tenantId: tenant.id,
      driverId: driver.id,
      status: { notIn: ["CANCELLED", "CLOSED"] },
    },
  });

  const scheduleMap = new Map(schedules.map((s) => [s.dayOfWeek, s]));

  const basePath = `/t/${tenantSlug}/admin`;
  const navGroups = getTenantAdminNavGroups(tenantSlug);

  return (
    <AppShell
      brandContext="Administracion"
      brandName={tenant.name}
      navGroups={navGroups}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name },
            { label: "Conductores", href: `${basePath}/drivers` },
            { label: driver.name },
            { label: "Horario" },
          ]}
          description={`Gestiona el horario laboral y las excepciones de disponibilidad de ${driver.name}.`}
          meta={
            <StatusBadge
              label={driver.status === "AVAILABLE" ? "Disponible" : driver.status}
              tone={driver.status === "AVAILABLE" ? "success" : "warning"}
            />
          }
          title={`Horario — ${driver.name}`}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-sunken/50 p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{schedules.filter((s) => s.isActive).length}</p>
            <p className="text-sm text-muted-foreground">Dias activos</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-sunken/50 p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{exceptions.length}</p>
            <p className="text-sm text-muted-foreground">Excepciones registradas</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-sunken/50 p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{todayTrips}</p>
            <p className="text-sm text-muted-foreground">Viajes activos hoy</p>
          </div>
        </div>

        <Card>
          <CardHeader
            description="Define los dias y horarios laborales del conductor."
            icon={<Clock />}
            title="Horario semanal"
          />
          <form action={saveDriverScheduleAction} className="mt-4">
            <input name="tenantSlug" type="hidden" value={tenantSlug} />
            <input name="driverId" type="hidden" value={driver.id} />

            <div className="grid gap-3">
              {DAYS_ORDER.map((day) => {
                const existing = scheduleMap.get(day);
                return (
                  <div
                    className="grid items-center gap-3 rounded-lg border border-border bg-surface-sunken/50 p-3 sm:grid-cols-[140px_1fr_1fr_1fr_1fr_auto]"
                    key={day}
                  >
                    <span className="font-medium text-foreground">{DAY_LABELS[day]}</span>
                    <Field
                      defaultValue={existing?.startTimeLocal ?? "08:00"}
                      label="Inicio"
                      name={`${day}_start`}
                      type="time"
                    />
                    <Field
                      defaultValue={existing?.endTimeLocal ?? "17:00"}
                      label="Fin"
                      name={`${day}_end`}
                      type="time"
                    />
                    <Field
                      defaultValue={existing?.breakStartLocal ?? ""}
                      label="Descanso desde"
                      name={`${day}_breakStart`}
                      required={false}
                      type="time"
                    />
                    <Field
                      defaultValue={existing?.breakEndLocal ?? ""}
                      label="Descanso hasta"
                      name={`${day}_breakEnd`}
                      required={false}
                      type="time"
                    />
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        defaultChecked={existing?.isActive ?? true}
                        name={`${day}_active`}
                        type="checkbox"
                        value="true"
                      />
                      Activo
                    </label>
                  </div>
                );
              })}
            </div>

            <input
              name="schedules"
              type="hidden"
              value="__PLACEHOLDER__"
            />

            <Alert className="mt-4" tone="info">
              Para guardar los horarios, use el formulario interactivo del componente cliente. Esta vista muestra la
              configuracion actual.
            </Alert>

            <div className="mt-4 flex justify-end">
              <SubmitButton>Guardar horario</SubmitButton>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader
            description="Registra dias libres, vacaciones, incapacidades o turnos extra."
            icon={<Calendar />}
            title="Excepciones de disponibilidad"
          />

          <Collapsible icon={<Plus />} summary="Agregar excepcion">
            <form action={addAvailabilityExceptionAction} className="grid gap-3 sm:grid-cols-2">
              <input name="tenantSlug" type="hidden" value={tenantSlug} />
              <input name="driverId" type="hidden" value={driver.id} />
              <Field label="Fecha" name="date" type="date" />
              <SelectField label="Tipo" name="type">
                <option value="DAY_OFF">Dia libre</option>
                <option value="VACATION">Vacaciones</option>
                <option value="SICK_LEAVE">Incapacidad</option>
                <option value="EXTRA_SHIFT">Turno extra</option>
                <option value="CUSTOM_UNAVAILABLE">No disponible</option>
              </SelectField>
              <Field label="Hora inicio" name="startTimeLocal" required={false} type="time" />
              <Field label="Hora fin" name="endTimeLocal" required={false} type="time" />
              <div className="sm:col-span-2">
                <TextArea label="Razon" name="reason" required={false} rows={2} />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <SubmitButton>Agregar excepcion</SubmitButton>
              </div>
            </form>
          </Collapsible>

          <div className="mt-4">
            {exceptions.length > 0 ? (
              <DataTable caption="Excepciones de disponibilidad">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Fecha</TableHeaderCell>
                    <TableHeaderCell>Tipo</TableHeaderCell>
                    <TableHeaderCell>Horario</TableHeaderCell>
                    <TableHeaderCell>Razon</TableHeaderCell>
                    <TableHeaderCell>Accion</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {exceptions.map((exc) => (
                    <TableRow key={exc.id}>
                      <TableCell className="tabular-nums">
                        {exc.date.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={EXCEPTION_TYPE_LABELS[exc.type] ?? exc.type}
                          tone={exc.type === "EXTRA_SHIFT" ? "success" : "warning"}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {exc.startTimeLocal && exc.endTimeLocal
                          ? `${exc.startTimeLocal} - ${exc.endTimeLocal}`
                          : "Todo el dia"}
                      </TableCell>
                      <TableCell>{exc.reason ?? "—"}</TableCell>
                      <TableCell>
                        <form action={deleteAvailabilityExceptionAction}>
                          <input name="tenantSlug" type="hidden" value={tenantSlug} />
                          <input name="exceptionId" type="hidden" value={exc.id} />
                          <button
                            className="text-danger-strong hover:text-danger-strong/80"
                            title="Eliminar excepcion"
                            type="submit"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            ) : (
              <EmptyState
                compact
                description="No hay excepciones registradas para este conductor."
                icon={<Calendar />}
                title="Sin excepciones"
              />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
