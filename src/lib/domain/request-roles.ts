import type { TenantRole } from "@/generated/prisma";

/**
 * Roles que operan solicitudes y viajes desde operaciones: revisar y convertir solicitudes y crear
 * viajes ("Nuevo viaje", ADR-038). Es la fuente unica: la comparten `request-actions.ts` y el mapa de
 * permisos (`tenant.trips.create`).
 *
 * TENANT_ADMIN queda fuera a proposito: hoy tampoco convierte ni asigna viajes. Unificar la matriz de
 * roles de operacion es trabajo de una fase posterior; hasta entonces no se amplia aqui por accidente.
 *
 * Modulo sin "use server": un modulo "use server" solo puede exportar funciones async.
 */
export const REQUEST_OPERATIONS_ROLES: readonly TenantRole[] = ["OPERATIONS_MANAGER", "DISPATCHER", "TENANT_OWNER"];
