import PDFDocument from "pdfkit/js/pdfkit.standalone";
import type { Tenant, TenantBranding } from "@/generated/prisma";
import type { ComplianceDocumentRow } from "@/lib/server/compliance-data";
import type { EvaluatedDocument } from "@/lib/compliance/summary";
import {
  complianceEntityLabel,
  complianceLightLabel,
  complianceSeverityLabel,
  complianceStatusLabel,
  type ComplianceLight,
} from "@/lib/ui/compliance";

export type CompliancePdfInput = {
  tenant: Tenant & { branding: TenantBranding | null };
  light: ComplianceLight;
  counts: Record<string, number>;
  blockingCount: number;
  documents: EvaluatedDocument<ComplianceDocumentRow>[];
  generatedAt: Date;
};

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return { chunks, finished };
}

function light(color: ComplianceLight): string {
  switch (color) {
    case "VERDE":
      return "#059669";
    case "AMARILLO":
      return "#b45309";
    case "ROJO":
      return "#b91c1c";
    default:
      return "#475569";
  }
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

/**
 * Genera un PDF de cumplimiento del tenant, con branding, semáforo global,
 * indicadores y tabla de documentos. Datos ya evaluados por la lógica
 * determinista; este módulo solo dibuja. La IA no participa.
 */
export async function generateCompliancePdf(input: CompliancePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 48, size: "LETTER" });
  const { finished } = collectPdf(doc);
  const branding = input.tenant.branding;
  const primary = branding?.primary ?? "#0f2d46";

  // Encabezado con branding del tenant.
  doc.fontSize(18).fillColor(primary).text(branding?.wordmark ?? input.tenant.name);
  doc.fontSize(9).fillColor("#64748b").text("Tecnologia desarrollada por NCI Automation");
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor("#0f172a").text("Reporte de cumplimiento");
  doc.fontSize(9).fillColor("#64748b").text(`Generado: ${input.generatedAt.toISOString().slice(0, 16).replace("T", " ")}`);
  doc.moveDown();

  // Semáforo global.
  const cur = doc.y;
  doc.rect(48, cur, 220, 42).fill(light(input.light));
  doc.fillColor("#ffffff").fontSize(10).text("Semáforo global", 60, cur + 8);
  doc.fontSize(18).text(complianceLightLabel[input.light].toUpperCase(), 60, cur + 20);
  doc.fillColor("#0f172a").fontSize(11).text("", 48, cur + 56);
  doc.moveDown();

  // Indicadores.
  doc.fontSize(12).fillColor(primary).text("Indicadores");
  doc.fontSize(10).fillColor("#334155");
  const rows: [string, number | string][] = [
    ["Documentos vigentes", input.counts.VIGENTE ?? 0],
    ["Próximos a vencer", input.counts.PROXIMO_A_VENCER ?? 0],
    ["Vencidos", input.counts.VENCIDO ?? 0],
    ["Rechazados", input.counts.RECHAZADO ?? 0],
    ["Suspendidos", input.counts.SUSPENDIDO ?? 0],
    ["Bloquean despacho ahora", input.blockingCount],
  ];
  for (const [k, v] of rows) doc.text(`${k}: ${v}`);
  doc.moveDown();

  // Aviso obligatorio de validación humana.
  const y = doc.y;
  doc.rect(48, y, 510, 46).stroke("#fbbf24");
  doc
    .fillColor("#7c2d12")
    .fontSize(9)
    .text(
      "Aviso: este reporte es un registro configurable de cumplimiento. No sustituye a las autoridades competentes (ATTT, Aduanas, Bomberos, AMP, PORTCEL, terminales, navieras) ni constituye asesoría legal. Valide periódicamente con las autoridades correspondientes.",
      52,
      y + 6,
      { width: 502 },
    );
  doc.moveDown(2);

  // Tabla de documentos (top 40 por vencimiento).
  doc.fontSize(12).fillColor(primary).text("Documentos");
  doc.moveDown(0.3);
  const cols: { title: string; x: number; w: number }[] = [
    { title: "Entidad", x: 48, w: 90 },
    { title: "Referencia", x: 140, w: 90 },
    { title: "Documento", x: 232, w: 130 },
    { title: "Estado", x: 364, w: 90 },
    { title: "Vence", x: 456, w: 70 },
    { title: "Bloq.", x: 528, w: 30 },
  ];
  doc.fontSize(9).fillColor("#0f172a");
  const headerY = doc.y;
  doc.rect(48, headerY - 2, 510, 14).fill("#f1f5f9");
  doc.fillColor("#0f172a");
  for (const c of cols) doc.text(c.title, c.x, headerY, { width: c.w });
  doc.moveDown();

  doc.fontSize(9).fillColor("#334155");
  const items = input.documents.slice(0, 40);
  for (const d of items) {
    const rowY = doc.y;
    const daysNote =
      d.daysUntilExpiry === null
        ? ""
        : d.daysUntilExpiry <= 0
          ? ` (hace ${Math.abs(d.daysUntilExpiry)} d)`
          : ` (en ${d.daysUntilExpiry} d)`;
    doc.text(complianceEntityLabel[d.entityType] ?? d.entityType, cols[0].x, rowY, { width: cols[0].w });
    doc.text(d.entityId, cols[1].x, rowY, { width: cols[1].w });
    doc.text(d.name, cols[2].x, rowY, { width: cols[2].w });
    doc.text(complianceStatusLabel[d.effectiveStatus] ?? d.effectiveStatus, cols[3].x, rowY, { width: cols[3].w });
    doc.text(fmtDate(d.expiresAt) + daysNote, cols[4].x, rowY, { width: cols[4].w });
    doc.text(d.blocksDispatch ? (d.blocksNow ? "Sí (ahora)" : "Sí") : "—", cols[5].x, rowY, { width: cols[5].w });
    doc.moveDown(0.4);
    if (doc.y > 720) {
      doc.addPage();
    }
  }

  if (input.documents.length > items.length) {
    doc.moveDown();
    doc.fontSize(9).fillColor("#64748b").text(`… y ${input.documents.length - items.length} documento(s) más. Descargue el CSV para el detalle completo.`);
  }
  // Firma / severidad footer.
  doc.moveDown(2);
  doc.fontSize(8).fillColor("#94a3b8").text(`Criticidad de referencia: ${complianceSeverityLabel.MEDIA} (media). Rangos ${complianceSeverityLabel.INFO}→${complianceSeverityLabel.CRITICA}.`);

  doc.end();
  return finished;
}
