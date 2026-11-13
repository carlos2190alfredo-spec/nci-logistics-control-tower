import { describe, expect, it } from "vitest";
import { CRON_SECRET_MIN_LENGTH, isAuthorizedCronRequest, readCronSecret } from "./cron-auth";

const secret = "s3cr3t-de-cron-0123456789abcdef";

describe("readCronSecret", () => {
  it("devuelve null si CRON_SECRET no esta definido o esta vacio", () => {
    expect(readCronSecret({})).toBeNull();
    expect(readCronSecret({ CRON_SECRET: "" })).toBeNull();
    expect(readCronSecret({ CRON_SECRET: "   " })).toBeNull();
  });

  it("rechaza secretos mas cortos que el minimo", () => {
    expect(readCronSecret({ CRON_SECRET: "a".repeat(CRON_SECRET_MIN_LENGTH - 1) })).toBeNull();
  });

  it("acepta un secreto suficientemente largo", () => {
    expect(readCronSecret({ CRON_SECRET: secret })).toBe(secret);
  });
});

describe("isAuthorizedCronRequest", () => {
  it("acepta Bearer con el secreto correcto", () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("rechaza encabezado ausente", () => {
    expect(isAuthorizedCronRequest(null, secret)).toBe(false);
    expect(isAuthorizedCronRequest("", secret)).toBe(false);
  });

  it("rechaza secreto incorrecto, con o sin la misma longitud", () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret.slice(0, -1)}x`, secret)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer otro", secret)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${secret}extra`, secret)).toBe(false);
  });

  it("rechaza esquemas distintos de Bearer y el secreto sin esquema", () => {
    expect(isAuthorizedCronRequest(secret, secret)).toBe(false);
    expect(isAuthorizedCronRequest(`Basic ${secret}`, secret)).toBe(false);
    expect(isAuthorizedCronRequest(`bearer ${secret}`, secret)).toBe(false);
  });

  it("nunca autoriza si el secreto esperado esta vacio", () => {
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer x", "")).toBe(false);
  });
});
