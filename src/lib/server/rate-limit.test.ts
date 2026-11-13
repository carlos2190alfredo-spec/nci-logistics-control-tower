import { describe, expect, it } from "vitest";
import { normalizeWindowSeconds, outcomeFromBucketRow } from "./rate-limit";

const windowEnd = new Date("2026-11-13T12:01:00.000Z");

describe("outcomeFromBucketRow", () => {
  it("permite la primera peticion y deja el resto del cupo", () => {
    const outcome = outcomeFromBucketRow({ count: 1, window_end: windowEnd, seconds_left: 60 }, 30);
    expect(outcome).toEqual({ allowed: true, remaining: 29, retryAfterSeconds: 0, windowEndsAt: windowEnd });
  });

  it("permite exactamente la peticion numero `limit`", () => {
    const outcome = outcomeFromBucketRow({ count: 30, window_end: windowEnd, seconds_left: 12.4 }, 30);
    expect(outcome.allowed).toBe(true);
    expect(outcome.remaining).toBe(0);
    expect(outcome.retryAfterSeconds).toBe(0);
  });

  it("bloquea a partir de `limit + 1` y calcula Retry-After redondeando hacia arriba", () => {
    const outcome = outcomeFromBucketRow({ count: 31, window_end: windowEnd, seconds_left: 12.2 }, 30);
    expect(outcome.allowed).toBe(false);
    expect(outcome.remaining).toBe(0);
    expect(outcome.retryAfterSeconds).toBe(13);
    expect(outcome.windowEndsAt).toBe(windowEnd);
  });

  it("nunca devuelve Retry-After menor a 1 segundo cuando bloquea", () => {
    const outcome = outcomeFromBucketRow({ count: 99, window_end: windowEnd, seconds_left: 0.01 }, 30);
    expect(outcome.allowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBe(1);
  });

  it("remaining nunca es negativo con contadores muy por encima del limite", () => {
    const outcome = outcomeFromBucketRow({ count: 500, window_end: windowEnd, seconds_left: 5 }, 30);
    expect(outcome.remaining).toBe(0);
  });
});

describe("normalizeWindowSeconds", () => {
  it("redondea hacia arriba y exige al menos 1 segundo", () => {
    expect(normalizeWindowSeconds(60)).toBe(60);
    expect(normalizeWindowSeconds(0.2)).toBe(1);
    expect(normalizeWindowSeconds(0)).toBe(1);
    expect(normalizeWindowSeconds(-5)).toBe(1);
    expect(normalizeWindowSeconds(59.1)).toBe(60);
  });

  it("trata valores no finitos como 1 segundo", () => {
    expect(normalizeWindowSeconds(Number.NaN)).toBe(1);
    expect(normalizeWindowSeconds(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
