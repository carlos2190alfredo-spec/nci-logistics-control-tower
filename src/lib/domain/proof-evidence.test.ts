import { describe, expect, it } from "vitest";
import type { DocumentVisibility } from "@/generated/prisma";
import {
  EVIDENCE_DOCUMENT_VISIBILITY,
  customerReadableDocumentWhere,
  evidenceDocumentIdsToPublish,
  isPodObjectKey,
} from "@/lib/domain/proof-evidence";

const PROOF = "proof-1";

function doc(
  id: string,
  overrides: Partial<{ proofId: string | null; objectKey: string; visibility: DocumentVisibility }> = {},
) {
  return {
    id,
    proofId: PROOF,
    objectKey: `tenants/acme/trips/TR-1/evidence/${id}.jpg`,
    visibility: "INTERNAL" as DocumentVisibility,
    ...overrides,
  };
}

describe("proof evidence visibility (AT-05)", () => {
  it("creates driver evidence as INTERNAL", () => {
    expect(EVIDENCE_DOCUMENT_VISIBILITY).toBe("INTERNAL");
  });

  it("publishes only the INTERNAL, non-POD documents linked to the approved proof", () => {
    const ids = evidenceDocumentIdsToPublish(
      [
        doc("photo-a"),
        // Un PDF subido por el conductor SI es evidencia (el POD se distingue por su clave).
        doc("evidence-pdf", { objectKey: "tenants/acme/trips/TR-1/evidence/acta.pdf" }),
        doc("pod", { objectKey: "tenants/acme/trips/TR-1/pod/TR-1-pod.pdf" }),
        doc("other-proof", { proofId: "proof-2" }),
        doc("unlinked", { proofId: null }),
        doc("already-visible", { visibility: "CUSTOMER_VISIBLE" }),
        doc("driver-only", { visibility: "DRIVER_VISIBLE" }),
      ],
      PROOF,
    );
    expect(ids).toEqual(["photo-a", "evidence-pdf"]);
  });

  it("reconoce el POD por su clave de objeto, no por el MIME", () => {
    expect(isPodObjectKey("tenants/acme/trips/TR-1/pod/TR-1-pod.pdf")).toBe(true);
    expect(isPodObjectKey("tenants/acme/trips/TR-1/evidence/acta.pdf")).toBe(false);
  });

  it("publishes nothing when the proof has no pending evidence", () => {
    expect(evidenceDocumentIdsToPublish([], PROOF)).toEqual([]);
    expect(evidenceDocumentIdsToPublish([doc("x", { proofId: "other" })], PROOF)).toEqual([]);
  });

  it("limits customer reads to their own tenant/account, CUSTOMER_VISIBLE and approved proofs", () => {
    const where = customerReadableDocumentWhere({ tenantId: "tenant-1", customerAccountId: "account-1" });
    expect(where).toMatchObject({
      tenantId: "tenant-1",
      customerAccountId: "account-1",
      visibility: "CUSTOMER_VISIBLE",
    });
    expect(where.OR).toEqual([{ proofId: null }, { proof: { is: { status: "APPROVED" } } }]);
  });
});
