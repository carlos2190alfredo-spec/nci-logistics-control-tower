import { describe, expect, it } from "vitest";
import { evaluatePortalAccessGrant, GLOBAL_REJECT_MESSAGE, type PortalGrantFacts } from "@/lib/server/customer-user-rules";

const A = "acct-a";
const base: PortalGrantFacts = {
  existingUser: { active: true, platformRole: null },
  customerMemberships: [],
  isTeamMember: false,
  target: { customerAccountId: A, role: "CUSTOMER_ADMIN" },
};
const m = (over: Partial<{ id: string; customerAccountId: string; role: string; active: boolean }> = {}) => ({
  id: "m1", customerAccountId: A, role: "CUSTOMER_ADMIN", active: true, ...over,
});
const decide = (over: Partial<PortalGrantFacts>) => evaluatePortalAccessGrant({ ...base, ...over });

describe("evaluatePortalAccessGrant", () => {
  it("correo sin cuenta: crea usuario y membresía", () => {
    expect(decide({ existingUser: null })).toEqual({ kind: "create_user_and_membership" });
  });

  it("cuenta existente sin membresía en este tenant: rechazo GLOBAL con mensaje neutro (no vincula en silencio)", () => {
    const d = decide({});
    expect(d).toMatchObject({ kind: "reject", scope: "global", message: GLOBAL_REJECT_MESSAGE, reason: "account_elsewhere" });
  });

  it("personal de plataforma, cuenta inactiva y cuenta ajena dan EXACTAMENTE el mismo mensaje", () => {
    const messages = [
      decide({ existingUser: { active: true, platformRole: "PLATFORM_SUPPORT" } }),
      decide({ existingUser: { active: false, platformRole: null } }),
      decide({}),
    ].map((d) => (d.kind === "reject" ? d.message : "otro"));
    expect(new Set(messages)).toEqual(new Set([GLOBAL_REJECT_MESSAGE]));
  });

  it("miembro del equipo de este tenant: rechazo local", () => {
    expect(decide({ isTeamMember: true })).toMatchObject({ kind: "reject", scope: "local", reason: "team_member" });
  });

  it("misma cuenta y mismo rol activos: ya tiene acceso", () => {
    expect(decide({ customerMemberships: [m()] })).toEqual({ kind: "already_has_access" });
  });

  it("misma cuenta con otro rol activo: rechaza (no inserta una segunda fila)", () => {
    expect(decide({ customerMemberships: [m({ role: "CUSTOMER_VIEWER" })] })).toMatchObject({ kind: "reject", reason: "other_role" });
  });

  it("membresía activa en OTRO cliente de este tenant: rechaza (una activa por usuario y empresa)", () => {
    expect(decide({ customerMemberships: [m({ customerAccountId: "acct-b" })] })).toMatchObject({ kind: "reject", reason: "other_customer" });
  });

  it("membresía inactiva de la misma cuenta: se reactiva", () => {
    expect(decide({ customerMemberships: [m({ active: false, id: "m9" })] })).toEqual({ kind: "reactivate_membership", membershipId: "m9" });
  });

  it("inactiva en la misma cuenta pero activa en otra: gana la regla de una sola activa", () => {
    const d = decide({ customerMemberships: [m({ active: false }), m({ id: "m2", customerAccountId: "acct-b" })] });
    expect(d).toMatchObject({ kind: "reject", reason: "other_customer" });
  });
});
