import type { TenantRole } from "@/generated/prisma/enums";

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
  | "tenant.roles.view";

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
