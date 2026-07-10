import { NextResponse } from "next/server";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ErrorCodes, errorMessages } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { processOfflineBatch } from "@/lib/server/offline-sync";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { clientIpFrom, requireJsonContentType, verifyMutationOrigin } from "@/lib/server/http-security";
import { offlineSyncRequestSchema, type OfflineSyncResponse } from "@/lib/offline/protocol";

const MAX_BODY_BYTES = 512 * 1024;

function errorResponse(code: keyof typeof ErrorCodes, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: ErrorCodes[code], message: errorMessages[ErrorCodes[code]], ...extra }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await context.params;

  const origin = verifyMutationOrigin(request);
  if (!origin.ok) return errorResponse("ORIGIN_MISMATCH", 403);

  const contentType = requireJsonContentType(request);
  if (!contentType.ok) return errorResponse("INVALID_PAYLOAD", 415);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return errorResponse("INVALID_PAYLOAD", 413);

  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["DRIVER", "TENANT_OWNER", "DISPATCHER"]);

  const rate = await enforceRateLimit({
    scope: "offline.sync",
    key: `${tenant.id}:${user.id}:${clientIpFrom(request)}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: ErrorCodes.RATE_LIMITED, message: errorMessages.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_BYTES) return errorResponse("INVALID_PAYLOAD", 413);

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return errorResponse("INVALID_PAYLOAD", 400);
  }

  const parsed = offlineSyncRequestSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("offline sync invalid payload", { tenantSlug, userId: user.id, issues: parsed.error.issues.length });
    return errorResponse("INVALID_PAYLOAD", 400);
  }

  const driver = await getDb().driver.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { id: true },
  });

  if (membership.role === "DRIVER" && !driver) {
    return errorResponse("ACCESS_DENIED", 403);
  }
  if (!driver) {
    return errorResponse("ACCESS_DENIED", 403);
  }

  const results = await processOfflineBatch(
    {
      userId: user.id,
      userName: user.name,
      tenantId: tenant.id,
      tenantSlug,
      driverId: driver.id,
      role: membership.role,
    },
    parsed.data.commands,
  );

  const response: OfflineSyncResponse = {
    schemaVersion: parsed.data.schemaVersion,
    results,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
