import { NextResponse } from "next/server";
import { requireTenantRole } from "@/lib/server/auth";
import { verifyMutationOrigin, requireJsonContentType, clientIpFrom } from "@/lib/server/http-security";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { logger } from "@/lib/observability/logger";

const ALLOWED_KEYS = new Set([
  "appVersion",
  "swVersion",
  "pendingCommandCount",
  "pendingPhotoCount",
  "retryableCount",
  "conflictCount",
  "lastSyncAt",
  "storageUsedEstimate",
  "connectivityStatus",
]);

const MAX_BODY = 4096;

function isValidTelemetry(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_KEYS.has(key)) return false;
    if (typeof value === "string") {
      if (value.length > 200) return false;
      if (value.startsWith("data:")) return false;
      if (/base64/i.test(value)) return false;
    }
    if (typeof value !== "string" && typeof value !== "number" && value !== null) return false;
  }
  return true;
}

export async function POST(request: Request, context: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await context.params;

  const origin = verifyMutationOrigin(request);
  if (!origin.ok) return NextResponse.json({ error: "ORIGIN_MISMATCH" }, { status: 403 });

  const ct = requireJsonContentType(request);
  if (!ct.ok) return NextResponse.json({ error: "INVALID_CONTENT_TYPE" }, { status: 415 });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });

  const { user, tenant } = await requireTenantRole(tenantSlug, ["DRIVER"]);

  const rate = await enforceRateLimit({
    scope: "pwa.telemetry",
    key: `${tenant.id}:${user.id}:${clientIpFrom(request)}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  }

  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!isValidTelemetry(body)) {
    return NextResponse.json({ error: "INVALID_TELEMETRY" }, { status: 400 });
  }

  logger.metric("pwa.telemetry", {
    service: "pwa",
    component: "telemetry",
    tenantId: tenant.id,
    userId: user.id,
    role: "DRIVER",
    pendingCommands: body.pendingCommandCount as number | undefined,
    pendingPhotos: body.pendingPhotoCount as number | undefined,
    retryable: body.retryableCount as number | undefined,
    conflicts: body.conflictCount as number | undefined,
    connectivity: body.connectivityStatus as string | undefined,
  });

  return NextResponse.json({ ok: true }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const dynamic = "force-dynamic";
