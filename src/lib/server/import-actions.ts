"use server";

import { revalidatePath } from "next/cache";
import { BULK_TRANSACTION_OPTIONS, MAX_IMPORT_BYTES } from "@/lib/catalog/limits";
import { IMPORT_KIND_LABEL, isImportKind, validateImport } from "@/lib/import/catalogs";
import { parseCsv } from "@/lib/import/csv";
import { actionError, actionOk, type ActionResult } from "@/lib/server/action-result";
import { audit } from "@/lib/server/audit";
import { requireTenantPermission } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { applyCatalogImport } from "@/lib/server/import-apply";
import { PlanLimitError, planLimitMessage } from "@/lib/server/plan-limits";
import { enforceRateLimit } from "@/lib/server/rate-limit";

/**
 * Importacion CSV de catalogos (ADR-038). El panel muestra una vista previa en el navegador, pero aqui se
 * revalida TODO: el servidor recibe texto, nunca confia en la vista previa ni en un tenant del archivo.
 */
export async function importCatalogCsvAction(
  tenantSlug: string,
  kindInput: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  if (!isImportKind(kindInput)) return actionError("Tipo de importación no válido.");
  const kind = kindInput;

  const limit = await enforceRateLimit({
    scope: "catalog.import",
    key: `${tenant.id}:${user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });
  if (!limit.allowed) return actionError("Demasiadas importaciones seguidas. Espere unos minutos e intente de nuevo.");

  const csv = formData.get("csv");
  if (typeof csv !== "string" || csv.trim() === "") return actionError("Seleccione un archivo CSV.");
  if (Buffer.byteLength(csv, "utf8") > MAX_IMPORT_BYTES) {
    return actionError("El archivo es demasiado grande. Divídalo en partes más pequeñas.");
  }

  const parsed = parseCsv(csv);
  if (!parsed.ok) return actionError(parsed.error);
  // Caracteres ilegibles (codificacion equivocada): no se guardan datos corruptos.
  if (parsed.warnings.length > 0) return actionError(parsed.warnings[0]);

  const validation = validateImport(kind, parsed);
  if (validation.headerIssues.length > 0) return actionError(validation.headerIssues.join(" "));
  if (validation.valid.length === 0) {
    return actionError(
      validation.invalid.length > 0
        ? `Ninguna fila es válida (${validation.invalid.length} con problemas). Revise el archivo con la vista previa.`
        : "El archivo no tiene filas para importar.",
    );
  }

  try {
    const outcome = await getDb().$transaction(
      (tx) => applyCatalogImport(tx, { tenantId: tenant.id, kind, rows: validation.valid }),
      BULK_TRANSACTION_OPTIONS,
    );

    await audit({
      tenantId: tenant.id,
      actorId: user.id,
      actorRole: membership.role,
      action: "catalog.import",
      entity: "Catalog",
      entityId: tenant.id,
      after: { kind, created: outcome.created, skippedExisting: outcome.skippedExisting, invalid: validation.invalid.length },
    });
    revalidatePath(`/t/${tenantSlug}`, "layout");

    const label = IMPORT_KIND_LABEL[kind].toLowerCase();
    const parts = [`Se importaron ${outcome.created} ${label}.`];
    if (outcome.skippedExisting > 0) parts.push(`${outcome.skippedExisting} ya existían y se omitieron.`);
    if (validation.invalid.length > 0) {
      parts.push(`${validation.invalid.length} ${validation.invalid.length === 1 ? "fila tenía problemas y no se importó" : "filas tenían problemas y no se importaron"}.`);
    }
    if (outcome.created === 0) return actionError(`No se importó nada: ${parts.slice(1).join(" ") || "todas las filas ya existían."}`);
    return actionOk(parts.join(" "));
  } catch (error) {
    if (error instanceof PlanLimitError) return actionError(planLimitMessage(error, "import"));
    if (error instanceof RangeError) return actionError(error.message);
    throw error;
  }
}
