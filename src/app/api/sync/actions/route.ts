import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ErrorCodes, errorMessages } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import {
  clientIpFrom,
  requireJsonContentType,
  verifyMutationOrigin,
} from "@/lib/server/http-security";
import {
  syncActionRequestSchema,
  SYNC_ACTION_SCHEMA_VERSION,
  type SyncActionResponse,
} from "@/lib/offline/generic-protocol";
import { processSyncActionBatch } from "@/lib/server/sync-actions/processor";

const MAX_BODY_BYTES = 512 * 1024;

function errorResponse(code: keyof typeof ErrorCodes, status: number) {
  return NextResponse.json(
    { error: ErrorCodes[code], message: errorMessages[ErrorCodes[code]] },
    { status },
  );
}

/**
 * Endpoint universal para sincronizar acciones genéricas offline.
 * A diferencia de `/api/t/[slug]/driver/sync`, este acepta cualquier tenantSlug
 * dentro del payload (validado contra la membresía del usuario) y es accesible
 * por cualquier rol tenant autenticado.
 *
 * Todas las acciones despachadas pasan por `SYNC_ACTION_REGISTRY` (whitelist).
 * Idempotencia via `SyncActionReceipt.tenantId_userId_idempotencyKey` UNIQUE.
 */
export async function POST(request: Request) {
  const origin = verifyMutationOrigin(request);
  if (!origin.ok) return errorResponse("ORIGIN_MISMATCH", 403);

  const contentType = requireJsonContentType(request);
  if (!contentType.ok) return errorResponse("INVALID_PAYLOAD", 415);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return errorResponse("INVALID_PAYLOAD", 413);

  const user = await requireAuthenticatedUser();

  const rate = await enforceRateLimit({
    scope: "sync.actions",
    key: `${user.id}:${clientIpFrom(request)}`,
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

  const parsed = syncActionRequestSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("generic sync invalid payload", {
      userId: user.id,
      issues: parsed.error.issues.length,
    });
    return errorResponse("INVALID_PAYLOAD", 400);
  }

  // Cada acción tiene su propio tenantSlug — validamos que el usuario tenga
  // membresía activa. Un solo lote NO puede mezclar tenants.
  const slugs = new Set(parsed.data.actions.map((a) => a.tenantSlug));
  if (slugs.size !== 1) return errorResponse("INVALID_PAYLOAD", 400);
  const tenantSlug = [...slugs][0];

  const db = getDb();
  const membership = await db.tenantMembership.findFirst({
    where: { userId: user.id, active: true, tenant: { slug: tenantSlug } },
    include: { tenant: { select: { id: true, slug: true } } },
  });
  if (!membership) return errorResponse("ACCESS_DENIED", 403);

  const results = await processSyncActionBatch(
    {
      userId: user.id,
      userName: user.name,
      tenantId: membership.tenant.id,
      tenantSlug: membership.tenant.slug,
      role: membership.role,
    },
    parsed.data.actions,
  );

  const responseBody: SyncActionResponse = {
    schemaVersion: SYNC_ACTION_SCHEMA_VERSION,
    results,
  };
  return NextResponse.json(responseBody);
}
