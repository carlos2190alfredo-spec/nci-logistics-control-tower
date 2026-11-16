/**
 * Generación de códigos de catálogo (módulo puro, sin I/O).
 *
 * El código de un cliente, vehículo o equipo es inmutable tras crearse y es el enlace que usan
 * cumplimiento, mantenimiento y autorizaciones de conductores; por eso se genera con el MÁXIMO del
 * sufijo numérico existente (no con `count() + 1`, que choca tras un borrado o una carrera) y quien
 * llama debe reintentar ante `P2002`.
 */

import { SLUG_CODE_MAX_LENGTH } from "./limits";
import { slugCode } from "./normalize";

/** Prefijos oficiales de los códigos generados por el sistema. */
export const CUSTOMER_CODE_PREFIX = "CLI-";

/** Un sufijo con más dígitos que estos se considera "ruido" (un código importado absurdo no debe envenenar la serie). */
const MAX_SEQUENCE_DIGITS = 15;
const DEFAULT_PAD = 4;
// Hasta 15 dígitos el número es entero exacto en un `number` (< 2^53): `max + 1` no pierde precisión.
const NUMERIC_SUFFIX = new RegExp(`^\\d{1,${MAX_SEQUENCE_DIGITS}}$`);

function highestSequence(existing: readonly string[], prefix: string): number {
  const wanted = prefix.toUpperCase();
  let highest = 0;
  for (const raw of existing) {
    if (typeof raw !== "string") continue;
    const code = raw.trim().toUpperCase();
    if (!code.startsWith(wanted)) continue;
    const suffix = code.slice(wanted.length);
    // Solo sufijos puramente numéricos: "CLI-12A", "CLI-" o "CLI-ABC" no cuentan.
    if (!NUMERIC_SUFFIX.test(suffix)) continue;
    const value = Number(suffix);
    if (value > highest) highest = value;
  }
  return highest;
}

function formatSequence(prefix: string, value: number, pad: number): string {
  const width = Number.isFinite(pad) ? Math.max(0, Math.trunc(pad)) : DEFAULT_PAD;
  return `${prefix}${String(value).padStart(width, "0")}`;
}

/**
 * Siguiente código `prefix` + número con relleno de ceros: el MÁXIMO del sufijo numérico entre los
 * códigos que empiezan por `prefix` (sin distinguir mayúsculas), más uno. Ignora el resto.
 * Si el número necesita más dígitos que `pad`, crece (`CLI-9999` → `CLI-10000`).
 *
 * @example nextCodeFromExisting(["CLI-0001", "CLI-0007", "OTRO"], "CLI-") // "CLI-0008"
 */
export function nextCodeFromExisting(existing: readonly string[], prefix: string, pad = DEFAULT_PAD): string {
  return formatSequence(prefix, highestSequence(existing, prefix) + 1, pad);
}

/**
 * Reserva códigos consecutivos sin recalcular: útil al importar muchas filas, donde cada código
 * generado debe contar como ya usado para el siguiente. Cada llamada devuelve un código nuevo.
 */
export function createCodeAllocator(existing: readonly string[], prefix: string, pad = DEFAULT_PAD): () => string {
  let current = highestSequence(existing, prefix);
  return () => {
    current += 1;
    return formatSequence(prefix, current, pad);
  };
}

/**
 * Devuelve `base` si no está en `taken`; si no, `base_2`, `base_3`, … hasta encontrar uno libre,
 * recortando la base para no pasar de 40 caracteres. La comparación no distingue mayúsculas.
 * `base` se normaliza con `slugCode`; si queda vacía se usa `fallback`.
 */
export function uniqueSlugCode(base: string, taken: ReadonlySet<string>, fallback = "CODIGO"): string {
  const takenUpper = new Set<string>();
  for (const code of taken) takenUpper.add(String(code).toUpperCase());

  const root = slugCode(base) || slugCode(fallback) || "CODIGO";
  if (!takenUpper.has(root)) return root;

  // Hay a lo sumo `takenUpper.size` candidatos ocupados: en `size + 1` intentos aparece uno libre.
  for (let n = 2; n <= takenUpper.size + 2; n += 1) {
    const suffix = `_${n}`;
    const head = root.slice(0, SLUG_CODE_MAX_LENGTH - suffix.length).replace(/_+$/, "");
    const candidate = `${head}${suffix}`;
    if (!takenUpper.has(candidate)) return candidate;
  }
  /* c8 ignore next 2 -- inalcanzable por el principio del palomar; evita un retorno implícito */
  throw new Error("No se pudo generar un código único.");
}
