import { Eye, EyeOff } from "lucide-react";
import { StatusBadge, Badge } from "@/components/ui";
import {
  incidentPriorityLabel,
  incidentPriorityTone,
  incidentStatusLabel,
  incidentStatusTone,
} from "@/lib/ui/status";
import { formatDateShort } from "@/lib/utils";
import type { Incident } from "@/generated/prisma";

type IncidentWithTrip = Incident & { trip: { reference: string } | null };

export function IncidentCard({ incident }: { incident: IncidentWithTrip }) {
  return (
    <div className="rounded-lg border border-border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{incident.category}</p>
        <StatusBadge label={incidentStatusLabel[incident.status]} tone={incidentStatusTone[incident.status]} />
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
        {incident.customerMessage ?? incident.internalDescription}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint-foreground">
        <Badge tone={incidentPriorityTone[incident.priority]}>
          {incidentPriorityLabel[incident.priority]}
        </Badge>
        {incident.trip ? <span className="font-mono">{incident.trip.reference}</span> : null}
        <span className="tabular-nums">{formatDateShort(incident.createdAt)}</span>
        <span className="inline-flex items-center gap-1">
          {incident.visibleToCustomer ? (
            <>
              <Eye aria-hidden className="size-3" /> Visible al cliente
            </>
          ) : (
            <>
              <EyeOff aria-hidden className="size-3" /> Interna
            </>
          )}
        </span>
      </div>
    </div>
  );
}
