import { z } from "zod";

/**
 * Protocolo genérico para acciones offline de cualquier rol autenticado
 * (operaciones, admin, dispatcher, cliente, etc). Complemento — no
 * reemplazo — del protocolo de conductor (`protocol.ts`), que sigue vivo
 * para acciones específicas del trip.
 *
 * Cambios de estructura DEBEN incrementar SYNC_ACTION_SCHEMA_VERSION.
 */
export const SYNC_ACTION_SCHEMA_VERSION = 1;

/** Máximo de campos por acción — límite defensivo contra payloads gigantes. */
const MAX_FIELDS = 64;
/** Máximo bytes por valor — evita adjuntos grandes; los archivos se suben
 *  siempre online usando el pipeline de cuarentena. */
const MAX_VALUE_LEN = 8_192;

const fieldValue = z
  .union([z.string().max(MAX_VALUE_LEN), z.number()])
  .transform((v) => (typeof v === "number" ? String(v) : v));

const formDataRecord = z
  .record(z.string().min(1).max(64), fieldValue)
  .refine((v) => Object.keys(v).length <= MAX_FIELDS, {
    message: `Máximo ${MAX_FIELDS} campos por acción`,
  });

export const syncActionSchema = z.object({
  schemaVersion: z.literal(SYNC_ACTION_SCHEMA_VERSION),
  idempotencyKey: z.string().uuid(),
  clientQueuedAt: z.string().datetime({ offset: true }),
  localSequence: z.number().int().nonnegative(),
  tenantSlug: z.string().min(1).max(64),
  actionId: z.string().min(1).max(64),
  formData: formDataRecord,
});

export type SyncAction = z.infer<typeof syncActionSchema>;

export const syncActionRequestSchema = z.object({
  schemaVersion: z.literal(SYNC_ACTION_SCHEMA_VERSION),
  actions: z.array(syncActionSchema).min(1).max(25),
});

export type SyncActionRequest = z.infer<typeof syncActionRequestSchema>;

export const SYNC_ACTION_RESULT_STATUS = [
  "ACCEPTED",
  "DUPLICATE",
  "REJECTED",
  "FAILED",
  "RETRYABLE",
  "UNAUTHORIZED",
] as const;

export type SyncActionResultStatus = (typeof SYNC_ACTION_RESULT_STATUS)[number];

export type SyncActionResult = {
  idempotencyKey: string;
  status: SyncActionResultStatus;
  serverEntityId?: string;
  serverTimestamp: string;
  errorCode?: string;
  retryable: boolean;
};

export type SyncActionResponse = {
  schemaVersion: number;
  results: SyncActionResult[];
};

/** Serialización determinista para hashear el payload (idempotencia). */
export function canonicalizeAction(action: SyncAction): string {
  return JSON.stringify(action, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[key] = (value as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return value;
  });
}

/** Convierte un FormData del browser en el record del protocolo. */
export function formDataToRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      record[key] = value;
    } else {
      // Archivos NO se sincronizan por esta ruta. Los uploads pasan por el
      // pipeline de cuarentena (`/api/upload`) que ya funciona online.
      record[key] = "[FILE_OMITTED]";
    }
  }
  return record;
}

/** Convierte el record de vuelta a FormData para pasarle a la Server Action. */
export function recordToFormData(record: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(record)) {
    fd.append(key, value);
  }
  return fd;
}
