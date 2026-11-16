import { templatesToLoad, templateToCreateData } from "@/lib/catalog/service-type-templates";
import type { Tx } from "@/lib/server/trip-creation";

/**
 * Inserta las plantillas de tipo de servicio que aun no existen en el tenant (por codigo) y devuelve los
 * codigos creados. Nunca modifica un tipo existente. Sin "use server": lo usan la accion del boton
 * "Agregar los tipos sugeridos" y la creacion de un tenant nuevo, dentro de su transaccion.
 */
export async function ensureServiceTypeTemplates(tx: Tx, tenantId: string, selectedCodes?: Iterable<string>): Promise<string[]> {
  const existing = await tx.serviceType.findMany({ where: { tenantId }, select: { code: true } });
  const missing = templatesToLoad(existing.map((row) => row.code), selectedCodes);
  if (missing.length === 0) return [];
  await tx.serviceType.createMany({
    data: missing.map((template) => templateToCreateData(template, tenantId)),
    skipDuplicates: true,
  });
  return missing.map((template) => template.code);
}
