import { NextResponse } from "next/server";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { clientIpFrom } from "@/lib/server/http-security";
import { ErrorCodes, errorMessages } from "@/lib/server/errors";
import { audit } from "@/lib/server/audit";
import { getTenantProfitability } from "@/lib/server/finance-data";
import { generateFinancePdf } from "@/lib/server/finance-pdf";

/**
 * PDF financiero: totales + rentabilidad por viaje/cliente/ruta/conductor/
 * equipo. Datos comerciales sensibles → restringido a OWNER/ADMIN.
 * Determinista; la IA no participa.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
  ]);

  const rate = await enforceRateLimit({
    scope: "finance.pdf",
    key: `${tenant.id}:${user.id}:${clientIpFrom(request)}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: ErrorCodes.RATE_LIMITED, message: errorMessages.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const db = getDb();
  const [{ total, trips, byClient, byRoute, byDriver, byVehicle }, tenantWithBranding] = await Promise.all([
    getTenantProfitability(tenant.id),
    db.tenant.findUniqueOrThrow({ where: { id: tenant.id }, include: { branding: true } }),
  ]);

  const pdf = await generateFinancePdf({
    tenant: tenantWithBranding,
    total,
    trips,
    byClient,
    byRoute,
    byDriver,
    byVehicle,
    generatedAt: new Date(),
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "finance.report.pdf",
    entity: "Tenant",
    entityId: tenant.id,
    after: { revenue: total.revenue, cost: total.cost, margin: total.margin, trips: trips.length },
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${tenant.slug}-rentabilidad.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
