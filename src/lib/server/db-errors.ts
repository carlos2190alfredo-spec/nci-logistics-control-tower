/**
 * Clasificación de errores conocidos de Prisma, compartida por las acciones de servidor.
 *
 * Módulo sin "use server": un módulo "use server" solo puede exportar funciones async y cada export
 * suyo es un endpoint público (ver `action-result.ts`).
 *
 * La detección es estructural (`error.code`), no `instanceof PrismaClientKnownRequestError`: el error
 * cruza la frontera de `$transaction` y de los mocks de las pruebas, y una copia duplicada del módulo de
 * Prisma haría fallar `instanceof` sin avisar.
 */

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

/**
 * Normaliza un nombre de campo, columna o restricción a `snake_case` en minúsculas. Prisma informa
 * `meta.target` con nombres de columna (`client_request_key`) pero el código habla de campos
 * (`clientRequestKey`): ambos deben poder compararse sin importar cuál de las dos formas llegue.
 */
function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

/** `meta.target` de un P2002: lista de columnas (PostgreSQL) o nombre del índice (otros motores). */
function uniqueTarget(error: unknown): unknown {
  const meta = (error as { meta?: unknown }).meta;
  return typeof meta === "object" && meta !== null ? (meta as { target?: unknown }).target : undefined;
}

function targetContainsField(target: unknown, fieldHint: string): boolean {
  const hint = toSnakeCase(fieldHint);
  if (Array.isArray(target)) {
    // Lista de columnas: coincidencia exacta de elemento (`code` no debe coincidir con `postal_code`).
    return target.some((column) => typeof column === "string" && toSnakeCase(column) === hint);
  }
  if (typeof target === "string") {
    // Nombre de índice (`vehicles_tenant_id_plate_key`): el campo debe aparecer entre guiones bajos. Es una
    // aproximación: un índice no separa las columnas (`postal_code` también contiene `code`). PostgreSQL con
    // Prisma informa una lista de columnas, que sí se compara completa; esto solo cubre otros motores.
    return `_${toSnakeCase(target)}_`.includes(`_${hint}_`);
  }
  return false;
}

/**
 * `true` si el error es una violación de unicidad de Prisma (`P2002`).
 *
 * Con `fieldHint` (nombre de campo o de columna, p. ej. `"plate"` o `"clientRequestKey"`) exige además
 * que `meta.target` incluya ese campo; sirve para distinguir cuál de varias restricciones únicas falló.
 * Si Prisma no informa `meta.target` (algunos adaptadores), una pista nunca coincide: el llamador debe
 * tratar "P2002 sin identificar" como el caso general. Una pista vacía equivale a no pasar pista.
 */
export function isUniqueViolation(error: unknown, fieldHint?: string): boolean {
  if (errorCode(error) !== "P2002") return false;
  if (fieldHint === undefined || toSnakeCase(fieldHint) === "") return true;
  return targetContainsField(uniqueTarget(error), fieldHint);
}

/** `true` si el error es una violación de clave foránea de Prisma (`P2003`). */
export function isForeignKeyViolation(error: unknown): boolean {
  return errorCode(error) === "P2003";
}
