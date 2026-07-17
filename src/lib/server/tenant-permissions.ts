import type { TenantRole } from "@/generated/prisma";

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
  | "tenant.maintenance.manage";

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
