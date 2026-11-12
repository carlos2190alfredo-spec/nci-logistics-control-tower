import { ActionForm, Badge, Collapsible, SelectField, StatusBadge, SubmitButton, TextArea } from "@/components/ui";
import { requestStatusLabel, requestStatusTone } from "@/lib/ui/status";
import { formatDateShort } from "@/lib/utils";
import { confirmRequestAsTripAction, reviewRequestAction } from "@/lib/server/request-actions";
import { availableRequestActions } from "@/lib/domain/request-state-machine";
import type { ServiceRequest, CustomerAccount, ServiceType } from "@/generated/prisma";

type Request = ServiceRequest & { customerAccount: CustomerAccount; serviceType: ServiceType };

export function RequestCard({
  request,
  tenantSlug,
  index,
}: {
  request: Request;
  tenantSlug: string;
  index?: number;
}) {
  const actions = availableRequestActions(request.status, "OPERATIONS");
  const canConvert = actions.includes("convert");
  const reviewActions = actions.filter((action) => action === "request_info" || action === "reject");

  return (
    <div
      className="anim-item rounded-lg border border-border bg-surface-sunken/50 p-3.5"
      data-testid={`request-card-${request.id}`}
      style={index !== undefined ? ({ "--stagger": index } as React.CSSProperties) : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-sm font-bold text-foreground">{request.reference}</p>
        <StatusBadge label={requestStatusLabel[request.status]} tone={requestStatusTone[request.status]} />
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{request.customerAccount.name}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {request.origin} → {request.destination}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-faint-foreground">
        <span className="tabular-nums">{formatDateShort(request.requestedDate)}</span>
        {request.priority === "URGENT" ? <Badge tone="danger">Urgente</Badge> : null}
        <span>{request.serviceType.name}</span>
      </div>
      {request.status === "INFORMATION_REQUIRED" && request.statusReason ? (
        <p className="mt-2 text-xs text-warning-strong">Esperando al cliente: {request.statusReason}</p>
      ) : null}
      {canConvert ? (
        <ActionForm action={confirmRequestAsTripAction.bind(null, tenantSlug)} className="mt-3 grid gap-2">
          <input name="requestId" type="hidden" value={request.id} />
          <SubmitButton className="w-full">Confirmar y convertir</SubmitButton>
        </ActionForm>
      ) : null}
      {reviewActions.length ? (
        <div className="mt-2">
          <Collapsible summary="Pedir informacion o rechazar">
            <ActionForm action={reviewRequestAction.bind(null, tenantSlug)} className="grid gap-2.5">
              <input name="requestId" type="hidden" value={request.id} />
              <SelectField label="Accion" name="decision">
                {reviewActions.map((action) => (
                  <option key={action} value={action}>
                    {action === "reject" ? "Rechazar solicitud" : "Pedir informacion al cliente"}
                  </option>
                ))}
              </SelectField>
              <TextArea
                help="El cliente vera este mensaje en su portal."
                label="Mensaje para el cliente"
                name="reason"
                required
                rows={2}
              />
              <SubmitButton variant="secondary">Enviar</SubmitButton>
            </ActionForm>
          </Collapsible>
        </div>
      ) : null}
    </div>
  );
}
