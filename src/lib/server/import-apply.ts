import { createCodeAllocator } from "@/lib/catalog/codes";
import { MAX_EQUIPMENT_PER_TENANT, MAX_LOCATIONS_PER_TENANT } from "@/lib/catalog/limits";
import { CUSTOMER_CODE_PREFIX } from "@/lib/catalog/codes";
import { comparableKey } from "@/lib/catalog/normalize";
import type { ImportData, ImportKind, ImportValidRow } from "@/lib/import/catalogs";
import { assertWithinPlanLimit } from "@/lib/server/plan-limits";
import { lockTenantForCreate, type Tx } from "@/lib/server/trip-creation";

/**
 * Aplica una importacion CSV ya validada (ADR-038). Sin "use server": la llama `importCatalogCsvAction` dentro de
 * su transaccion. Nada del archivo decide el tenant: `tenantId` viene de la sesion y se escribe en TODAS las filas.
 *
 * - Las filas que ya existen (por codigo, placa o nombre, sin distinguir mayusculas ni tildes) se OMITEN, no se pisan.
 * - Los limites del plan (clientes y vehiculos) y los topes fijos son "todo o nada": si no caben, no se importa nada.
 */
export type ImportOutcome = { created: number; skippedExisting: number };

const BATCH = 500;

/**
 * Escribe en lotes y devuelve cuántas filas guardó de verdad la base de datos. `skipDuplicates` evita que una fila
 * repetida tumbe el lote, pero también la descarta SIN avisar: por eso se compara lo guardado con lo esperado.
 */
async function chunked<T>(items: T[], write: (batch: T[]) => Promise<{ count: number }>): Promise<number> {
  let written = 0;
  for (let i = 0; i < items.length; i += BATCH) written += (await write(items.slice(i, i + BATCH))).count;
  return written;
}

/**
 * Con el bloqueo del tenant tomado y los duplicados ya descartados en memoria, la base de datos debe guardar TODAS
 * las filas. Si no, algo chocó (p. ej. un código repetido que la comparación no vio): se lanza para revertir la
 * transacción entera en lugar de informar filas "creadas" que no existen.
 */
function assertAllWritten(written: number, expected: number): void {
  if (written !== expected) {
    throw new RangeError(
      `Se esperaba guardar ${expected} filas pero solo se guardaron ${written}: hay códigos o nombres repetidos que no se detectaron. No se importó nada.`,
    );
  }
}

export async function applyCatalogImport<K extends ImportKind>(
  tx: Tx,
  input: { tenantId: string; kind: K; rows: ImportValidRow<K>[] },
): Promise<ImportOutcome> {
  const { tenantId, kind } = input;
  await lockTenantForCreate(tx, tenantId);

  switch (kind) {
    case "customers": {
      const rows = input.rows as ImportValidRow<"customers">[];
      const existing = await tx.customerAccount.findMany({ where: { tenantId }, select: { code: true, name: true } });
      const codes = new Set(existing.map((row) => comparableKey(row.code)));
      const names = new Set(existing.map((row) => comparableKey(row.name)));
      const toCreate: ImportData["customers"][] = [];
      for (const { data } of rows) {
        const duplicate = data.code ? codes.has(comparableKey(data.code)) : names.has(comparableKey(data.name));
        if (duplicate) continue;
        toCreate.push(data);
        if (data.code) codes.add(comparableKey(data.code));
        names.add(comparableKey(data.name));
      }
      if (toCreate.length > 0) await assertWithinPlanLimit(tx, { tenantId, resource: "customers", adding: toCreate.length });
      // Los códigos explícitos del propio archivo también cuentan como usados: si no, el generador podría asignar a una
      // fila el mismo código que otra pidió (p. ej. CLI-0001) y una de las dos se perdería.
      const nextCode = createCodeAllocator(
        [...existing.map((row) => row.code), ...toCreate.flatMap((data) => (data.code ? [data.code] : []))],
        CUSTOMER_CODE_PREFIX,
      );
      const written = await chunked(toCreate, (batch) =>
        tx.customerAccount.createMany({
          skipDuplicates: true,
          data: batch.map((data) => ({
            tenantId,
            code: data.code ?? nextCode(),
            name: data.name,
            taxId: data.taxId ?? null,
            contactName: data.contactName ?? null,
            contactEmail: data.contactEmail ?? null,
            contactPhone: data.contactPhone ?? null,
            address: data.address ?? null,
            internalNotes: data.internalNotes ?? null,
          })),
        }),
      );
      assertAllWritten(written, toCreate.length);
      return { created: written, skippedExisting: rows.length - toCreate.length };
    }
    case "vehicles": {
      const rows = input.rows as ImportValidRow<"vehicles">[];
      const existing = await tx.vehicle.findMany({ where: { tenantId }, select: { plate: true, code: true } });
      // Placa y codigo comparten un unico espacio de identidad.
      const taken = new Set(existing.flatMap((row) => [comparableKey(row.plate), comparableKey(row.code)]));
      const toCreate: ImportData["vehicles"][] = [];
      for (const { data } of rows) {
        if (taken.has(comparableKey(data.plate)) || taken.has(comparableKey(data.code))) continue;
        toCreate.push(data);
        taken.add(comparableKey(data.plate));
        taken.add(comparableKey(data.code));
      }
      if (toCreate.length > 0) await assertWithinPlanLimit(tx, { tenantId, resource: "vehicles", adding: toCreate.length });
      const written = await chunked(toCreate, (batch) =>
        tx.vehicle.createMany({
          skipDuplicates: true,
          data: batch.map((data) => ({ tenantId, plate: data.plate, code: data.code, type: data.type })),
        }),
      );
      assertAllWritten(written, toCreate.length);
      return { created: written, skippedExisting: rows.length - toCreate.length };
    }
    case "equipment": {
      const rows = input.rows as ImportValidRow<"equipment">[];
      const existing = await tx.equipment.findMany({ where: { tenantId }, select: { code: true } });
      const taken = new Set(existing.map((row) => comparableKey(row.code)));
      const toCreate: ImportData["equipment"][] = [];
      for (const { data } of rows) {
        if (taken.has(comparableKey(data.code))) continue;
        toCreate.push(data);
        taken.add(comparableKey(data.code));
      }
      if (existing.length + toCreate.length > MAX_EQUIPMENT_PER_TENANT) {
        throw new RangeError(
          `La importación agregaría ${toCreate.length} equipos y superaría el máximo de ${MAX_EQUIPMENT_PER_TENANT}. No se importó nada.`,
        );
      }
      const written = await chunked(toCreate, (batch) =>
        tx.equipment.createMany({
          skipDuplicates: true,
          data: batch.map((data) => ({ tenantId, code: data.code, type: data.type })),
        }),
      );
      assertAllWritten(written, toCreate.length);
      return { created: written, skippedExisting: rows.length - toCreate.length };
    }
    case "locations": {
      const rows = input.rows as ImportValidRow<"locations">[];
      const existing = await tx.location.findMany({ where: { tenantId }, select: { name: true } });
      const taken = new Set(existing.map((row) => comparableKey(row.name)));
      const toCreate: ImportData["locations"][] = [];
      for (const { data } of rows) {
        if (taken.has(comparableKey(data.name))) continue;
        toCreate.push(data);
        taken.add(comparableKey(data.name));
      }
      if (existing.length + toCreate.length > MAX_LOCATIONS_PER_TENANT) {
        throw new RangeError(
          `La importación agregaría ${toCreate.length} lugares y superaría el máximo de ${MAX_LOCATIONS_PER_TENANT}. No se importó nada.`,
        );
      }
      const written = await chunked(toCreate, (batch) =>
        tx.location.createMany({
          skipDuplicates: true,
          data: batch.map((data) => ({
            tenantId,
            name: data.name,
            address: data.address,
            latitude: data.latitude,
            longitude: data.longitude,
          })),
        }),
      );
      assertAllWritten(written, toCreate.length);
      return { created: written, skippedExisting: rows.length - toCreate.length };
    }
    default:
      throw new RangeError("Tipo de importación no válido.");
  }
}
