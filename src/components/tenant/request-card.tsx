import { StatusBadge, SubmitButton, Badge } from "@/components/ui";
import { requestStatusLabel, requestStatusTone } from "@/lib/ui/status";
import { formatDateShort } from "@/lib/utils";
import { confirmRequestAsTripAction } from "@/lib/server/actions";
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
      <form action={confirmRequestAsTripAction.bind(null, tenantSlug)} className="mt-3">
        <input name="requestId" type="hidden" value={request.id} />
        <SubmitButton className="w-full">Confirmar y convertir</SubmitButton>
      </form>
    </div>
  );
}
