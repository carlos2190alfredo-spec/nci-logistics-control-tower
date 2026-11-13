import { describe, expect, it } from "vitest";
import type { TenantRole } from "@/generated/prisma";
import { canGrantRole, evaluateMembershipChange } from "./membership-rules";

const ALL_ROLES: TenantRole[] = [
  "TENANT_OWNER",
  "TENANT_ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SAFETY_MANAGER",
  "DRIVER",
];

const owner = { userId: "u-owner", role: "TENANT_OWNER" as TenantRole };
const admin = { userId: "u-admin", role: "TENANT_ADMIN" as TenantRole };

function code(decision: ReturnType<typeof evaluateMembershipChange>) {
  return decision.ok ? "OK" : decision.code;
}

describe("canGrantRole", () => {
  it("el propietario puede otorgar cualquier rol", () => {
    for (const role of ALL_ROLES)
      expect(canGrantRole("TENANT_OWNER", role)).toBe(true);
  });

  it("el administrador puede otorgar todo salvo propietario", () => {
    for (const role of ALL_ROLES)
      expect(canGrantRole("TENANT_ADMIN", role)).toBe(role !== "TENANT_OWNER");
  });

  it("los demas roles no otorgan nada", () => {
    for (const actorRole of [
      "OPERATIONS_MANAGER",
      "DISPATCHER",
      "SAFETY_MANAGER",
      "DRIVER",
    ] as TenantRole[]) {
      for (const role of ALL_ROLES)
        expect(canGrantRole(actorRole, role)).toBe(false);
    }
  });
});

describe("evaluateMembershipChange: crear", () => {
  it("un TENANT_ADMIN no puede crear un TENANT_OWNER", () => {
    expect(
      code(
        evaluateMembershipChange({
          actor: admin,
          next: { role: "TENANT_OWNER", active: true },
        }),
      ),
    ).toBe("ROLE_NOT_GRANTABLE");
  });

  it("un TENANT_ADMIN puede crear cualquier rol no propietario", () => {
    for (const role of ALL_ROLES.filter((r) => r !== "TENANT_OWNER")) {
      expect(
        evaluateMembershipChange({ actor: admin, next: { role, active: true } })
          .ok,
      ).toBe(true);
    }
  });

  it("un TENANT_OWNER puede crear un TENANT_OWNER", () => {
    expect(
      evaluateMembershipChange({
        actor: owner,
        next: { role: "TENANT_OWNER", active: true },
      }).ok,
    ).toBe(true);
  });

  it("un rol operativo no puede administrar usuarios", () => {
    const dispatcher = { userId: "u-d", role: "DISPATCHER" as TenantRole };
    expect(
      code(
        evaluateMembershipChange({
          actor: dispatcher,
          next: { role: "DRIVER", active: true },
        }),
      ),
    ).toBe("ACTOR_NOT_ALLOWED");
  });
});

describe("evaluateMembershipChange: editar", () => {
  const driverTarget = {
    userId: "u-driver",
    role: "DRIVER" as TenantRole,
    active: true,
  };
  const ownerTarget = {
    userId: "u-owner-2",
    role: "TENANT_OWNER" as TenantRole,
    active: true,
  };

  it("un TENANT_ADMIN no puede ascender a otro usuario a propietario", () => {
    expect(
      code(
        evaluateMembershipChange({
          actor: admin,
          target: driverTarget,
          next: { role: "TENANT_OWNER", active: true },
        }),
      ),
    ).toBe("ROLE_NOT_GRANTABLE");
  });

  it("un TENANT_ADMIN no puede ascenderse a si mismo a propietario", () => {
    const self = {
      userId: admin.userId,
      role: "TENANT_ADMIN" as TenantRole,
      active: true,
    };
    expect(
      code(
        evaluateMembershipChange({
          actor: admin,
          target: self,
          next: { role: "TENANT_OWNER", active: true },
        }),
      ),
    ).toBe("ROLE_NOT_GRANTABLE");
  });

  it("un TENANT_ADMIN no puede cambiar su propio rol a otro operativo", () => {
    const self = {
      userId: admin.userId,
      role: "TENANT_ADMIN" as TenantRole,
      active: true,
    };
    expect(
      code(
        evaluateMembershipChange({
          actor: admin,
          target: self,
          next: { role: "OPERATIONS_MANAGER", active: true },
        }),
      ),
    ).toBe("SELF_CHANGE");
  });

  it("un TENANT_ADMIN no puede modificar, degradar ni desactivar a un propietario", () => {
    expect(
      code(
        evaluateMembershipChange({
          actor: admin,
          target: ownerTarget,
          next: { role: "TENANT_ADMIN", active: true },
          activeOwnerCount: 2,
        }),
      ),
    ).toBe("OWNER_PROTECTED");
    expect(
      code(
        evaluateMembershipChange({
          actor: admin,
          target: ownerTarget,
          next: { role: "TENANT_OWNER", active: false },
          activeOwnerCount: 2,
        }),
      ),
    ).toBe("ROLE_NOT_GRANTABLE");
    // Aun dejando rol y estado igual (solo renombrar), el propietario esta protegido.
    expect(
      code(
        evaluateMembershipChange({
          actor: admin,
          target: ownerTarget,
          next: { role: "TENANT_OWNER", active: true },
          activeOwnerCount: 2,
        }),
      ),
    ).toBe("ROLE_NOT_GRANTABLE");
  });

  it("un propietario puede degradar a otro propietario si queda al menos uno activo", () => {
    expect(
      evaluateMembershipChange({
        actor: owner,
        target: ownerTarget,
        next: { role: "TENANT_ADMIN", active: true },
        activeOwnerCount: 2,
      }).ok,
    ).toBe(true);
  });

  it("nadie puede dejar al tenant sin propietario activo", () => {
    expect(
      code(
        evaluateMembershipChange({
          actor: owner,
          target: ownerTarget,
          next: { role: "TENANT_ADMIN", active: true },
          activeOwnerCount: 1,
        }),
      ),
    ).toBe("LAST_OWNER");
    expect(
      code(
        evaluateMembershipChange({
          actor: owner,
          target: ownerTarget,
          next: { role: "TENANT_OWNER", active: false },
          activeOwnerCount: 1,
        }),
      ),
    ).toBe("LAST_OWNER");
  });

  it("falla cerrado si no se conoce el numero de propietarios activos", () => {
    expect(
      code(
        evaluateMembershipChange({
          actor: owner,
          target: ownerTarget,
          next: { role: "TENANT_ADMIN", active: true },
        }),
      ),
    ).toBe("LAST_OWNER");
  });

  it("un propietario no puede cambiar su propio rol ni desactivarse", () => {
    const self = {
      userId: owner.userId,
      role: "TENANT_OWNER" as TenantRole,
      active: true,
    };
    expect(
      code(
        evaluateMembershipChange({
          actor: owner,
          target: self,
          next: { role: "TENANT_ADMIN", active: true },
          activeOwnerCount: 3,
        }),
      ),
    ).toBe("SELF_CHANGE");
    expect(
      code(
        evaluateMembershipChange({
          actor: owner,
          target: self,
          next: { role: "TENANT_OWNER", active: false },
          activeOwnerCount: 3,
        }),
      ),
    ).toBe("SELF_CHANGE");
  });

  it("editar sin cambiar rol ni estado a uno mismo es valido (solo nombre)", () => {
    const self = {
      userId: admin.userId,
      role: "TENANT_ADMIN" as TenantRole,
      active: true,
    };
    expect(
      evaluateMembershipChange({
        actor: admin,
        target: self,
        next: { role: "TENANT_ADMIN", active: true },
      }).ok,
    ).toBe(true);
  });

  it("un administrador puede cambiar el rol y activar o desactivar a un usuario no propietario", () => {
    expect(
      evaluateMembershipChange({
        actor: admin,
        target: driverTarget,
        next: { role: "DISPATCHER", active: true },
      }).ok,
    ).toBe(true);
    expect(
      evaluateMembershipChange({
        actor: admin,
        target: driverTarget,
        next: { role: "DRIVER", active: false },
      }).ok,
    ).toBe(true);
  });

  it("reactivar a un propietario inactivo no cuenta como perder un propietario", () => {
    const inactiveOwner = {
      userId: "u-o3",
      role: "TENANT_OWNER" as TenantRole,
      active: false,
    };
    expect(
      evaluateMembershipChange({
        actor: owner,
        target: inactiveOwner,
        next: { role: "TENANT_OWNER", active: true },
        activeOwnerCount: 1,
      }).ok,
    ).toBe(true);
  });
});
