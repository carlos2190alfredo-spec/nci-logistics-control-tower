import { describe, expect, it } from "vitest";
import { loginPathForInvitation, safeNextPath } from "./next-path";

const TOKEN = "A".repeat(43);

describe("safeNextPath", () => {
  it("acepta solo la ruta de una invitación", () => {
    expect(safeNextPath(`/invitacion/${TOKEN}`)).toBe(`/invitacion/${TOKEN}`);
    expect(safeNextPath("/invitacion/abc-DEF_1234567890abcdef")).toBe("/invitacion/abc-DEF_1234567890abcdef");
  });

  it.each([
    "",
    "/",
    "/platform",
    "/t/panatruck/admin",
    "//evil.example.com",
    "https://evil.example.com",
    "/\\evil.example.com",
    `/invitacion/${TOKEN}/../../platform`,
    `/invitacion/${TOKEN}?x=1`,
    `/invitacion/${TOKEN}#frag`,
    `/invitacion/${TOKEN} `,
    "/invitacion/corto",
    `/invitacion/${"A".repeat(101)}`,
    `/invitacion/${TOKEN}%2F..`,
    `/INVITACION/${TOKEN}`,
  ])("rechaza %s", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("rechaza lo que no es texto", () => {
    for (const value of [null, undefined, 42, {}, [], ["/invitacion/" + TOKEN]]) expect(safeNextPath(value)).toBeNull();
  });
});

describe("loginPathForInvitation", () => {
  it("arma el enlace de login que vuelve a la invitación", () => {
    expect(loginPathForInvitation(TOKEN)).toBe(`/login?next=${encodeURIComponent(`/invitacion/${TOKEN}`)}`);
  });

  it("con un token raro no genera un destino: cae al login simple", () => {
    expect(loginPathForInvitation("corto")).toBe("/login");
    expect(loginPathForInvitation("../x")).toBe("/login");
  });
});
