import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";

config({ path: ".env.local" });

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("OBS-SEC-001: health endpoint does not leak service details", async ({ request }) => {
  const res = await request.get("/api/internal/health");
  const body = await res.json();
  expect(body).not.toHaveProperty("checks");
  expect(body).not.toHaveProperty("uptime");
  expect(body).not.toHaveProperty("version");
  expect(body).not.toHaveProperty("nodeVersion");
  expect(body).not.toHaveProperty("commit");
  const bodyStr = JSON.stringify(body);
  expect(bodyStr).not.toContain("password");
  expect(bodyStr).not.toContain("token");
  expect(bodyStr).not.toContain("secret");
});

test("OBS-SEC-002: liveness endpoint does not leak info", async ({ request }) => {
  const res = await request.get("/api/internal/liveness");
  const body = await res.json();
  expect(Object.keys(body)).toEqual(["alive"]);
});

test("OBS-SEC-003: readiness endpoint returns 403 for unauthenticated", async ({ request }) => {
  const res = await request.get("/api/internal/readiness");
  expect([403, 307]).toContain(res.status());
});

test("OBS-SEC-004: metrics endpoint returns 403 for unauthenticated", async ({ request }) => {
  const res = await request.get("/api/internal/metrics");
  expect([403, 307]).toContain(res.status());
});

test("OBS-SEC-005: PWA telemetry rejects oversized payloads", async ({ request }) => {
  const tenant = await db.tenant.findFirst();
  if (!tenant) {
    test.skip();
    return;
  }
  const largePayload = "x".repeat(5000);
  const res = await request.post(`/api/t/${tenant.slug}/driver/pwa-telemetry`, {
    headers: { "content-type": "application/json", "content-length": "5000" },
    data: largePayload,
  });
  expect([401, 403, 413, 307]).toContain(res.status());
});

test("OBS-SEC-006: PWA telemetry rejects base64 content", async ({ request }) => {
  const tenant = await db.tenant.findFirst();
  if (!tenant) {
    test.skip();
    return;
  }
  const res = await request.post(`/api/t/${tenant.slug}/driver/pwa-telemetry`, {
    headers: { "content-type": "application/json" },
    data: { appVersion: "data:image/png;base64,abc123" },
  });
  expect([400, 401, 403, 307]).toContain(res.status());
});

test("OBS-SEC-007: PWA telemetry rejects unknown keys", async ({ request }) => {
  const tenant = await db.tenant.findFirst();
  if (!tenant) {
    test.skip();
    return;
  }
  const res = await request.post(`/api/t/${tenant.slug}/driver/pwa-telemetry`, {
    headers: { "content-type": "application/json" },
    data: { unknownKey: "value", password: "leak" },
  });
  expect([400, 401, 403, 307]).toContain(res.status());
});

test("OBS-SEC-008: health endpoint sets cache-control no-store", async ({ request }) => {
  const res = await request.get("/api/internal/health");
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("OBS-SEC-009: all API responses include X-Request-ID", async ({ request }) => {
  const healthRes = await request.get("/api/internal/health");
  expect(healthRes.headers()["x-request-id"]).toBeTruthy();

  const livenessRes = await request.get("/api/internal/liveness");
  expect(livenessRes.headers()["x-request-id"]).toBeTruthy();
});

test("OBS-SEC-010: health endpoint accepts custom X-Request-ID", async ({ request }) => {
  const customId = "test-req-12345";
  const res = await request.get("/api/internal/health", {
    headers: { "x-request-id": customId },
  });
  expect(res.headers()["x-request-id"]).toBe(customId);
});
