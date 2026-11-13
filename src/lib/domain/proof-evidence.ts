import type { DocumentVisibility, Prisma } from "@/generated/prisma";

/**
 * La evidencia que sube el conductor (fotos, archivos) nace INTERNAL: operaciones
 * la revisa antes de que el cliente la vea. Solo `approveProofAction` la publica
 * (junto con el POD) y `rejectProofAction` la devuelve a INTERNAL.
 */
export const EVIDENCE_DOCUMENT_VISIBILITY: DocumentVisibility = "INTERNAL";

/** Tipo del POD generado por el servidor. */
export const POD_MIME_TYPE = "application/pdf";

/**
 * El POD se distingue de la evidencia del conductor por su clave de objeto
 * (`tenants/<slug>/trips/<ref>/pod/...`), NO por el MIME: el conductor tambien puede
 * subir PDFs como evidencia y esos deben publicarse al aprobar.
 */
export const POD_OBJECT_KEY_SEGMENT = "/pod/";

export function isPodObjectKey(objectKey: string): boolean {
  return objectKey.includes(POD_OBJECT_KEY_SEGMENT);
}

type EvidenceDocumentRow = {
  id: string;
  proofId: string | null;
  objectKey: string;
  visibility: DocumentVisibility;
};

/**
 * Ids de los documentos de evidencia de la prueba que pasan a CUSTOMER_VISIBLE
 * al aprobarla: los INTERNAL ligados a ella (PDF o imagen), excluido el POD. No toca los de
 * otras pruebas, los ya visibles ni los DRIVER_VISIBLE.
 */
export function evidenceDocumentIdsToPublish(documents: readonly EvidenceDocumentRow[], proofId: string): string[] {
  return documents
    .filter(
      (document) =>
        document.proofId === proofId &&
        !isPodObjectKey(document.objectKey) &&
        document.visibility === EVIDENCE_DOCUMENT_VISIBILITY,
    )
    .map((document) => document.id);
}

/**
 * Filtro de lectura de documentos para el portal del cliente: solo los
 * CUSTOMER_VISIBLE de su propia cuenta y tenant y, si estan ligados a una
 * prueba de entrega, unicamente cuando operaciones ya la aprobo. Defensa en
 * profundidad: aunque una fila quedara CUSTOMER_VISIBLE por error, la evidencia
 * pendiente o rechazada no se sirve.
 */
export function customerReadableDocumentWhere(input: {
  tenantId: string;
  customerAccountId: string;
}): Prisma.DocumentWhereInput {
  return {
    tenantId: input.tenantId,
    customerAccountId: input.customerAccountId,
    visibility: "CUSTOMER_VISIBLE",
    OR: [{ proofId: null }, { proof: { is: { status: "APPROVED" } } }],
  };
}
