import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOpaqueToken, hashToken, verifyPassword } from "@/lib/server/crypto";
import { acceptInvitation, lookupInvitation } from "@/lib/server/invitation-accept";
import { connectTestDb } from "./helpers/db";
import {
  TEST_USER_DOMAIN,
  createTestTenant,
  createTestUser,
  destroyTestTenant,
  sweepStaleTestTenants,
  type TestTenant,
} from "./helpers/tenants";
import type { TenantRole } from "@/generated/prisma";

/**
 * Aceptación de invitaciones al equipo contra PostgreSQL real (ADR-038): enlace de un solo uso, reclamo atómico,
 * y que una cuenta existente solo se una con su propia sesión.
 */
const db = connectTestDb();
const GOOD = { name: "Persona Nueva", password: "Clave-Segura-2026", confirmation: "Clave-Segura-2026" };

let tenant: TestTenant;
let inviter: { id: string; email: string };
let counter = 0;

type Seed = { role?: TenantRole; expiresInMs?: number; usedAt?: Date | null; email?: string };

/** Crea una invitación guardada (solo el hash) y devuelve el token en claro, como el correo. */
async function invite(seed: Seed = {}) {
  const token = createOpaqueToken();
  const email = seed.email ?? `invitado-${++counter}-${Date.now().toString(36)}${TEST_USER_DOMAIN}`;
  const invitation = await db.userInvitation.create({
    data: {
      tenantId: tenant.id,
      email,
      role: seed.role ?? "DISPATCHER",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + (seed.expiresInMs ?? 3600_000)),
      usedAt: seed.usedAt ?? null,
      invitedById: inviter.id,
    },
  });
  return { token, email, id: invitation.id };
}

beforeAll(async () => {
  await sweepStaleTestTenants(db);
  tenant = await createTestTenant(db);
  inviter = await createTestUser(db, "admin");
});

afterAll(async () => {
  await destroyTestTenant(db, tenant.id);
  await db.user.deleteMany({ where: { email: { endsWith: TEST_USER_DOMAIN } } });
  await db.$disconnect();
});

describe("cuenta nueva", () => {
  it("crea la cuenta (correo verificado, contraseña propia), la membresía con el rol invitado y consume el enlace", async () => {
    const { token, email, id } = await invite({ role: "OPERATIONS_MANAGER" });
    const outcome = await acceptInvitation(db, { token, sessionUserId: null, ...GOOD });

    expect(outcome).toMatchObject({ ok: true, newAccount: true, tenantId: tenant.id, tenantSlug: tenant.slug, role: "OPERATIONS_MANAGER", invitationId: id });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ name: "Persona Nueva", active: true, emailVerified: true });
    expect(await verifyPassword(user.passwordHash, GOOD.password)).toBe(true);
    const memberships = await db.tenantMembership.findMany({ where: { tenantId: tenant.id, userId: user.id } });
    expect(memberships.map((m) => [m.role, m.active])).toEqual([["OPERATIONS_MANAGER", true]]);
    expect((await db.userInvitation.findUniqueOrThrow({ where: { id } })).usedAt).not.toBeNull();
  });

  it("el correo y el rol salen de la invitación: nada del formulario los puede cambiar", async () => {
    const { token, email } = await invite({ role: "DRIVER" });
    const outcome = await acceptInvitation(db, {
      token,
      sessionUserId: null,
      ...GOOD,
      // Campos extra que un atacante enviaría: la función no los lee.
      ...({ email: "otro@zz-db.local", role: "TENANT_OWNER" } as object),
    });
    expect(outcome.ok && outcome.role).toBe("DRIVER");
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await db.user.count({ where: { email: "otro@zz-db.local" } })).toBe(0);
    expect((await db.tenantMembership.findFirstOrThrow({ where: { userId: user.id } })).role).toBe("DRIVER");
  });

  it("el segundo uso del mismo enlace falla y no crea nada más", async () => {
    const { token, email } = await invite();
    expect((await acceptInvitation(db, { token, sessionUserId: null, ...GOOD })).ok).toBe(true);
    const again = await acceptInvitation(db, { token, sessionUserId: null, ...GOOD, name: "Impostor", password: "Otra-Clave-2026!", confirmation: "Otra-Clave-2026!" });
    expect(again).toMatchObject({ ok: false, reason: "USED" });
    expect(await db.user.count({ where: { email } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { email } })).name).toBe("Persona Nueva");
  });

  it("5 aceptaciones simultáneas del mismo enlace: gana exactamente una", async () => {
    const { token, email } = await invite();
    const results = await Promise.all(Array.from({ length: 5 }, () => acceptInvitation(db, { token, sessionUserId: null, ...GOOD })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "USED")).toBe(true);
    expect(await db.user.count({ where: { email } })).toBe(1);
    expect(await db.tenantMembership.count({ where: { tenantId: tenant.id, user: { email } } })).toBe(1);
  });

  it("datos inválidos no gastan el enlace ni crean la cuenta", async () => {
    const { token, email, id } = await invite();
    const weak = await acceptInvitation(db, { token, sessionUserId: null, name: "Ana", password: "corta", confirmation: "corta" });
    expect(weak).toMatchObject({ ok: false, reason: "INVALID_INPUT" });
    const mismatch = await acceptInvitation(db, { token, sessionUserId: null, name: "Ana", password: "Clave-Segura-2026", confirmation: "Clave-Segura-2027" });
    expect(mismatch).toMatchObject({ ok: false, reason: "INVALID_INPUT", message: "Las contraseñas no coinciden." });
    const noName = await acceptInvitation(db, { token, sessionUserId: null, name: " ", password: GOOD.password, confirmation: GOOD.confirmation });
    expect(noName).toMatchObject({ ok: false, reason: "INVALID_INPUT" });
    expect(await db.user.count({ where: { email } })).toBe(0);
    expect((await db.userInvitation.findUniqueOrThrow({ where: { id } })).usedAt).toBeNull();
    // Y con datos buenos sigue funcionando.
    expect((await acceptInvitation(db, { token, sessionUserId: null, ...GOOD })).ok).toBe(true);
  });
});

describe("enlaces que no sirven", () => {
  it("vencido, usado, inexistente, mal formado y con un rol que una invitación nunca concede", async () => {
    const expired = await invite({ expiresInMs: -1000 });
    expect(await acceptInvitation(db, { token: expired.token, sessionUserId: null, ...GOOD })).toMatchObject({ ok: false, reason: "EXPIRED" });
    expect(await db.user.count({ where: { email: expired.email } })).toBe(0);

    const used = await invite({ usedAt: new Date() });
    expect(await acceptInvitation(db, { token: used.token, sessionUserId: null, ...GOOD })).toMatchObject({ ok: false, reason: "USED" });

    expect(await acceptInvitation(db, { token: createOpaqueToken(), sessionUserId: null, ...GOOD })).toMatchObject({ ok: false, reason: "INVALID" });
    for (const bad of ["", "corto", "x".repeat(300), "../../etc/passwd"]) {
      expect(await acceptInvitation(db, { token: bad, sessionUserId: null, ...GOOD })).toMatchObject({ ok: false, reason: "INVALID" });
    }

    const owner = await invite({ role: "TENANT_OWNER" });
    expect(await acceptInvitation(db, { token: owner.token, sessionUserId: null, ...GOOD })).toMatchObject({ ok: false, reason: "INVALID" });
    expect(await db.user.count({ where: { email: owner.email } })).toBe(0);
  });

  it("una empresa suspendida deja de aceptar gente nueva", async () => {
    const suspended = await createTestTenant(db);
    try {
      const token = createOpaqueToken();
      const email = `susp-${Date.now().toString(36)}${TEST_USER_DOMAIN}`;
      await db.userInvitation.create({
        data: { tenantId: suspended.id, email, role: "DISPATCHER", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000), invitedById: inviter.id },
      });
      await db.tenant.update({ where: { id: suspended.id }, data: { status: "SUSPENDED" } });
      expect(await acceptInvitation(db, { token, sessionUserId: null, ...GOOD })).toMatchObject({ ok: false, reason: "INVALID" });
      expect(await db.user.count({ where: { email } })).toBe(0);
    } finally {
      await destroyTestTenant(db, suspended.id);
    }
  });
});

describe("cuenta que ya existe", () => {
  it("sin sesión no se une (solo tener el enlace no basta) y el enlace sigue vigente", async () => {
    const existing = await createTestUser(db, "existente");
    const { token, id } = await invite({ email: existing.email });
    expect(await acceptInvitation(db, { token, sessionUserId: null })).toMatchObject({ ok: false, reason: "NEEDS_LOGIN" });
    expect(await db.tenantMembership.count({ where: { tenantId: tenant.id, userId: existing.id } })).toBe(0);
    expect((await db.userInvitation.findUniqueOrThrow({ where: { id } })).usedAt).toBeNull();
  });

  it("con la sesión de OTRA cuenta tampoco", async () => {
    const existing = await createTestUser(db, "existente");
    const other = await createTestUser(db, "otra");
    const { token } = await invite({ email: existing.email });
    expect(await acceptInvitation(db, { token, sessionUserId: other.id })).toMatchObject({ ok: false, reason: "WRONG_ACCOUNT" });
    expect(await db.tenantMembership.count({ where: { tenantId: tenant.id, userId: { in: [existing.id, other.id] } } })).toBe(0);
  });

  it("con su propia sesión se une, sin tocar su contraseña ni ignorar el rol invitado", async () => {
    const existing = await createTestUser(db, "existente");
    const before = await db.user.findUniqueOrThrow({ where: { id: existing.id } });
    const { token } = await invite({ email: existing.email, role: "SAFETY_MANAGER" });
    const outcome = await acceptInvitation(db, { token, sessionUserId: existing.id, name: "Nombre Falso", password: "Intento-Cambiar-2026", confirmation: "Intento-Cambiar-2026" });
    expect(outcome).toMatchObject({ ok: true, newAccount: false, userId: existing.id, role: "SAFETY_MANAGER" });
    const after = await db.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.name).toBe(before.name);
    expect((await db.tenantMembership.findFirstOrThrow({ where: { tenantId: tenant.id, userId: existing.id } })).role).toBe("SAFETY_MANAGER");
  });

  it("una cuenta inactiva no acepta, ni con su sesión", async () => {
    const dormant = await createTestUser(db, "inactiva");
    await db.user.update({ where: { id: dormant.id }, data: { active: false } });
    const { token } = await invite({ email: dormant.email });
    expect(await acceptInvitation(db, { token, sessionUserId: dormant.id })).toMatchObject({ ok: false, reason: "UNAVAILABLE" });
    expect(await db.tenantMembership.count({ where: { userId: dormant.id } })).toBe(0);
  });

  it("quien ya es miembro (aunque esté desactivado) no recibe un segundo rol; el enlace queda consumido", async () => {
    const member = await createTestUser(db, "miembro");
    await db.tenantMembership.create({ data: { tenantId: tenant.id, userId: member.id, role: "DRIVER", active: false } });
    const { token, id } = await invite({ email: member.email, role: "TENANT_ADMIN" });
    expect(await acceptInvitation(db, { token, sessionUserId: member.id })).toMatchObject({ ok: false, reason: "ALREADY_MEMBER" });
    const memberships = await db.tenantMembership.findMany({ where: { tenantId: tenant.id, userId: member.id } });
    expect(memberships.map((m) => [m.role, m.active])).toEqual([["DRIVER", false]]);
    expect((await db.userInvitation.findUniqueOrThrow({ where: { id } })).usedAt).not.toBeNull();
  });
});

describe("lookupInvitation (lo que ve la página)", () => {
  it("describe la invitación y el siguiente paso, sin exponer el hash ni ids", async () => {
    const fresh = await invite({ role: "DISPATCHER" });
    const asNew = await lookupInvitation(db, fresh.token, null);
    expect(asNew.ok && asNew.invitation).toMatchObject({ tenantName: expect.stringContaining("ZZ DB"), email: fresh.email, role: "DISPATCHER", plan: { action: "CREATE_ACCOUNT" } });
    expect(JSON.stringify(asNew)).not.toContain(hashToken(fresh.token));

    const existing = await createTestUser(db, "consulta");
    const known = await invite({ email: existing.email });
    expect((await lookupInvitation(db, known.token, null)).ok && (await lookupInvitation(db, known.token, null))).toMatchObject({ invitation: { plan: { action: "NEEDS_LOGIN" } } });
    expect(await lookupInvitation(db, known.token, existing.id)).toMatchObject({ ok: true, invitation: { plan: { action: "JOIN_EXISTING" } } });

    expect(await lookupInvitation(db, createOpaqueToken(), null)).toEqual({ ok: false, reason: "INVALID" });
    const expired = await invite({ expiresInMs: -1000 });
    expect(await lookupInvitation(db, expired.token, null)).toEqual({ ok: false, reason: "EXPIRED" });
  });
});
