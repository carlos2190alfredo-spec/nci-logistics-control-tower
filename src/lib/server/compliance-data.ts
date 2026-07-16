import { getDb } from "@/lib/server/db";
import { summarizeCompliance, type ComplianceSummary } from "@/lib/compliance/summary";
import type { ComplianceDocument } from "@/generated/prisma";

export type ComplianceDocumentRow = ComplianceDocument;

/**
 * Trae los documentos de cumplimiento del tenant y calcula el semáforo global
 * de forma determinista. `now` inyectable para pruebas.
 */
export async function getComplianceOverview(
  tenantId: string,
  now: Date = new Date(),
): Promise<ComplianceSummary<ComplianceDocumentRow>> {
  const docs = await getDb().complianceDocument.findMany({
    where: { tenantId },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    take: 1000,
  });
  return summarizeCompliance(docs, now);
}

export async function getComplianceDocument(tenantId: string, id: string) {
  return getDb().complianceDocument.findFirst({ where: { id, tenantId } });
}
