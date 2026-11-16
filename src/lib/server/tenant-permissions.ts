import type { TenantRole } from "@/generated/prisma";
import { REQUEST_OPERATIONS_ROLES } from "@/lib/domain/request-roles";

export type TenantPermission =
  | "tenant.view"
  | "tenant.settings.edit"
  | "tenant.users.view"
  | "tenant.users.manage"
  | "tenant.users.invite"
  | "tenant.drivers.view"
  | "tenant.drivers.manage"
  | "tenant.integrations.view"
  | "tenant.integrations.manage"
  | "tenant.feedback.submit"
  | "tenant.feedback.view"
  | "tenant.recommendations.view"
  | "tenant.activity.view"
  | "tenant.security.manage"
  | "tenant.roles.view"
  | "tenant.compliance.view"
  | "tenant.compliance.manage"
  | "tenant.compliance.verify"
  | "tenant.containers.view"
  | "tenant.containers.manage"
  | "tenant.hazmat.view"
  | "tenant.hazmat.manage"
  | "tenant.hazmat.approve"
  | "tenant.finance.view"
  | "tenant.finance.manage"
  | "tenant.maintenance.view"
  | "tenant.maintenance.manage"
  | "tenant.exceptions.view"
  | "tenant.exceptions.approve"
  | "tenant.catalogs.view"
  | "tenant.catalogs.manage"
  | "tenant.customers.portal"
  | "tenant.trips.create";

const PERMISSION_MAP: Record<TenantPermission, TenantRole[]> = {
  "tenant.view": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER"],
  "tenant.settings.edit": ["TENANT_OWNER", "TENANT_ADMIN"],
  "tenant.users.view": ["TENANT_OWNER", "TENANT_ADMIN"],
  "tenant.users.manage": ["TENANT_OWNER", "TENANT_ADMIN"],
  "tenant.users.invite": ["TENANT_OWNER", "TENANT_ADMIN"],
  "tenant.drivers.view": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER"],
  "tenant.drivers.manage": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER"],
  "tenant.integrations.view": ["TENANT_OWNER", "TENANT_ADMIN"],
  "tenant.integrations.manage": ["TENANT_OWNER"],
  "tenant.feedback.submit": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER"],
  "tenant.feedback.view": ["TENANT_OWNER", "TENANT_ADMIN"],
  "tenant.recommendations.view": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER"],
  "tenant.activity.view": ["TENANT_OWNER", "TENANT_ADMIN"],
  "tenant.security.manage": ["TENANT_OWNER"],
  "tenant.roles.view": ["TENANT_OWNER"],
  "tenant.compliance.view": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "SAFETY_MANAGER"],
  "tenant.compliance.manage": ["TENANT_OWNER", "TENANT_ADMIN", "SAFETY_MANAGER"],
  "tenant.compliance.verify": ["TENANT_OWNER", "TENANT_ADMIN", "SAFETY_MANAGER"],
  "tenant.containers.view": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER"],
  "tenant.containers.manage": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"],
  "tenant.hazmat.view": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER"],
  "tenant.hazmat.manage": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "SAFETY_MANAGER"],
  // Aprobar el despacho de carga peligrosa: solo roles de mando/seguridad.
  "tenant.hazmat.approve": ["TENANT_OWNER", "TENANT_ADMIN", "SAFETY_MANAGER"],
  // Finanzas: rentabilidad, costos e ingresos. Datos comerciales sensibles.
  "tenant.finance.view": ["TENANT_OWNER", "TENANT_ADMIN"],
  "tenant.finance.manage": ["TENANT_OWNER", "TENANT_ADMIN"],
  "tenant.maintenance.view": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "SAFETY_MANAGER"],
  "tenant.maintenance.manage": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER"],
  // Excepciones de despacho: solo mando/seguridad pueden aprobar.
  "tenant.exceptions.view": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "SAFETY_MANAGER"],
  "tenant.exceptions.approve": ["TENANT_OWNER", "TENANT_ADMIN", "SAFETY_MANAGER"],
  // Catalogos base (clientes, flota, lugares, tipos de servicio; ADR-038): ver = vista operativa; administrar = mando.
  "tenant.catalogs.view": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER"],
  "tenant.catalogs.manage": ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER"],
  // Crear y gestionar el acceso de usuarios externos (portal del cliente): solo roles con MFA obligatorio.
  "tenant.customers.portal": ["TENANT_OWNER", "TENANT_ADMIN"],
  // Crear viajes desde operaciones (pedidos por telefono, WhatsApp o correo): los roles que ya convierten solicitudes.
  "tenant.trips.create": [...REQUEST_OPERATIONS_ROLES],
};

export function hasPermission(role: TenantRole, permission: TenantPermission): boolean {
  return PERMISSION_MAP[permission]?.includes(role) ?? false;
}

export function getRolesForPermission(permission: TenantPermission): TenantRole[] {
  return PERMISSION_MAP[permission] ?? [];
}

export function getPermissionsForRole(role: TenantRole): TenantPermission[] {
  return (Object.keys(PERMISSION_MAP) as TenantPermission[]).filter((p) =>
    PERMISSION_MAP[p].includes(role),
  );
}

/** Roles de tenant que deben tener MFA verificado para operar (propietario y administrador). */
export const MFA_REQUIRED_TENANT_ROLES: readonly TenantRole[] = ["TENANT_OWNER", "TENANT_ADMIN"];

/**
 * Pantalla de inicio de cada rol dentro del tenant. Quien no tiene `tenant.view`
 * (el conductor) aterriza en su app y no en el centro de control; cualquier otro
 * rol sin vista operativa vuelve al login en lugar de entrar en un bucle.
 */
export function tenantHomePath(tenantSlug: string, role: TenantRole): string {
  if (hasPermission(role, "tenant.view")) return `/t/${tenantSlug}`;
  if (role === "DRIVER") return `/t/${tenantSlug}/driver`;
  return "/login";
}

export type TenantAccessDenialReason =
  | "TENANT_INACTIVE"
  | "NO_MEMBERSHIP"
  | "CUSTOMER_ONLY"
  | "ROLE_DENIED"
  | "MFA_REQUIRED";

export type TenantAccessDecision = { ok: true } | { ok: false; reason: TenantAccessDenialReason };

/**
 * Regla unica de acceso a un tenant, sin I/O. La comparten las paginas
 * (`requireTenantRole`, que redirige) y los endpoints API (que responden 403),
 * de modo que ambos exigen lo mismo: tenant ACTIVO, membresia activa, rol
 * permitido y MFA verificado para los roles que lo requieren.
 */
export function evaluateTenantAccess(input: {
  tenantActive: boolean;
  /** Rol de la membresia activa del usuario en el tenant, o null si no tiene. */
  role: TenantRole | null;
  /** true si el usuario es cliente (portal) activo de este mismo tenant. */
  hasCustomerMembership: boolean;
  /** Si se omite, cualquier rol de tenant es aceptable. */
  allowedRoles?: readonly TenantRole[];
  mfaVerified: boolean;
}): TenantAccessDecision {
  if (!input.tenantActive) return { ok: false, reason: "TENANT_INACTIVE" };
  if (!input.role) {
    return { ok: false, reason: input.hasCustomerMembership ? "CUSTOMER_ONLY" : "NO_MEMBERSHIP" };
  }
  if (input.allowedRoles && !input.allowedRoles.includes(input.role)) {
    return { ok: false, reason: "ROLE_DENIED" };
  }
  if (MFA_REQUIRED_TENANT_ROLES.includes(input.role) && !input.mfaVerified) {
    return { ok: false, reason: "MFA_REQUIRED" };
  }
  return { ok: true };
}

/** Destino de redireccion para una pagina cuando el acceso al tenant fue denegado. */
export function tenantAccessRedirect(
  reason: TenantAccessDenialReason,
  tenantSlug: string,
  role: TenantRole | null,
): string {
  switch (reason) {
    case "CUSTOMER_ONLY":
      return `/t/${tenantSlug}/portal`;
    case "ROLE_DENIED":
      return role ? tenantHomePath(tenantSlug, role) : "/login";
    case "MFA_REQUIRED":
      return "/account/security/mfa/setup";
    default:
      return "/login";
  }
}
