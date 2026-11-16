import Link from "next/link";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import type { StartupStep } from "@/lib/onboarding/startup-steps";
import { cn } from "@/lib/utils";

/** "Primeros pasos": se oculta solo cuando todo esta completo (el llamador ya lo comprueba). */
export function StartupChecklist({ steps }: { steps: StartupStep[] }) {
  const completed = steps.filter((step) => step.done).length;
  if (steps.length === 0 || completed === steps.length) return null;

  return (
    <div data-testid="startup-checklist">
      <Card>
        <CardHeader
          description={`${completed} de ${steps.length} pasos completados. Complételos para crear y asignar su primer viaje.`}
          icon={<ListChecks />}
          title="Primeros pasos"
        />
        <ol className="mt-4 grid gap-0.5">
          {steps.map((step) => {
            const content = (
              <>
                {step.done ? (
                  <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-faint-foreground" />
                )}
                <span>
                  <span className={cn("block text-sm font-semibold", step.done ? "text-faint-foreground line-through" : "text-foreground")}>
                    {step.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{step.description}</span>
                  <span className="sr-only">{step.done ? "Completado" : "Pendiente"}</span>
                </span>
              </>
            );
            const className = "flex items-start gap-3 rounded-lg p-3";
            return (
              <li data-testid={`startup-step-${step.key}`} key={step.key}>
                {step.href ? (
                  <Link className={cn(className, "transition-colors hover:bg-muted/60")} href={step.href}>
                    {content}
                  </Link>
                ) : (
                  <div className={className}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
