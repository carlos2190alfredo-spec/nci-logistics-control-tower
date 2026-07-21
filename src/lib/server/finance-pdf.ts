import PDFDocument from "pdfkit/js/pdfkit.standalone";
import type { Tenant, TenantBranding } from "@/generated/prisma";
import type { GroupProfitability, TripProfitability } from "@/lib/server/finance-data";
import type { ProfitabilitySummary } from "@/lib/finance/profitability";

export type FinancePdfInput = {
  tenant: Tenant & { branding: TenantBranding | null };
  total: ProfitabilitySummary;
  trips: TripProfitability[];
  byClient: GroupProfitability[];
  byRoute: GroupProfitability[];
  byDriver: GroupProfitability[];
  byVehicle: GroupProfitability[];
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

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * PDF financiero: totales + rentabilidad por viaje / cliente / ruta /
 * conductor / equipo. Datos ya calculados de forma determinista; este módulo
 * sólo dibuja. Confidencialidad: sólo lo llama el endpoint restringido a
 * OWNER/ADMIN.
 */
export async function generateFinancePdf(input: FinancePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 48, size: "LETTER" });
  const { finished } = collectPdf(doc);
  const branding = input.tenant.branding;
  const primary = branding?.primary ?? "#0f2d46";

  // Header con branding.
  doc.fontSize(18).fillColor(primary).text(branding?.wordmark ?? input.tenant.name);
  doc.fontSize(9).fillColor("#64748b").text("Tecnologia desarrollada por NCI Automation");
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor("#0f172a").text("Reporte financiero");
  doc.fontSize(9).fillColor("#64748b").text(`Generado: ${input.generatedAt.toISOString().slice(0, 16).replace("T", " ")}`);
  doc.moveDown();

  // Totales en dos tarjetas.
  const cardY = doc.y;
  doc.rect(48, cardY, 245, 60).fill(primary);
  doc.fillColor("#ffffff").fontSize(10).text("Totales del período", 60, cardY + 8);
  doc.fontSize(11).text(`Ingresos:   ${money(input.total.revenue)}`, 60, cardY + 24);
  doc.text(`Costos:     ${money(input.total.cost)}`, 60, cardY + 40);
  doc.rect(313, cardY, 245, 60).fill(input.total.margin >= 0 ? "#065f46" : "#7f1d1d");
  doc.fillColor("#ffffff").fontSize(10).text("Margen", 325, cardY + 8);
  doc.fontSize(14).text(`${money(input.total.margin)}   (${input.total.marginPct}%)`, 325, cardY + 30);
  doc.fillColor("#0f172a").moveDown(4);

  // Aviso de confidencialidad.
  const y = doc.y;
  doc.rect(48, y, 510, 30).stroke("#94a3b8");
  doc
    .fillColor("#475569")
    .fontSize(9)
    .text(
      "Confidencial — datos comerciales. Restringido a Propietario/Administrador del tenant. Distribución no autorizada prohibida.",
      52,
      y + 8,
      { width: 502 },
    );
  doc.moveDown(2);

  // Utility para pintar una tabla de grupo (col: label, count, margin, %).
  function drawGroupTable(title: string, headLabel: string, rows: GroupProfitability[], limit = 8) {
    doc.fontSize(12).fillColor(primary).text(title);
    doc.moveDown(0.2);
    if (rows.length === 0) {
      doc.fontSize(9).fillColor("#64748b").text("Sin datos.");
      doc.moveDown();
      return;
    }
    const cols = [
      { title: headLabel, x: 48, w: 220 },
      { title: "Servicios", x: 268, w: 60 },
      { title: "Margen", x: 348, w: 100 },
      { title: "Margen %", x: 460, w: 70 },
    ];
    const headerY = doc.y;
    doc.rect(48, headerY - 2, 510, 14).fill("#f1f5f9");
    doc.fillColor("#0f172a").fontSize(9);
    for (const c of cols) doc.text(c.title, c.x, headerY, { width: c.w });
    doc.moveDown();
    doc.fontSize(9).fillColor("#334155");
    for (const r of rows.slice(0, limit)) {
      const rowY = doc.y;
      doc.text(r.label, cols[0].x, rowY, { width: cols[0].w, ellipsis: true });
      doc.text(String(r.count), cols[1].x, rowY, { width: cols[1].w });
      doc.fillColor(r.summary.margin >= 0 ? "#065f46" : "#7f1d1d").text(money(r.summary.margin), cols[2].x, rowY, { width: cols[2].w });
      doc.fillColor("#334155").text(`${r.summary.marginPct}%`, cols[3].x, rowY, { width: cols[3].w });
      doc.moveDown(0.4);
      if (doc.y > 720) {
        doc.addPage();
      }
    }
    if (rows.length > limit) {
      doc.moveDown(0.2);
      doc.fontSize(9).fillColor("#64748b").text(`… y ${rows.length - limit} más. Descargue el CSV para el detalle completo.`);
    }
    doc.moveDown();
  }

  drawGroupTable("Por cliente", "Cliente", input.byClient);
  drawGroupTable("Por ruta", "Ruta", input.byRoute);
  drawGroupTable("Por conductor", "Conductor", input.byDriver);
  drawGroupTable("Por equipo", "Equipo", input.byVehicle);

  // Top viajes por margen.
  doc.addPage();
  doc.fontSize(12).fillColor(primary).text("Top viajes por margen");
  doc.moveDown(0.3);
  const tripCols = [
    { title: "Viaje", x: 48, w: 130 },
    { title: "Cliente", x: 180, w: 150 },
    { title: "Ingresos", x: 335, w: 70 },
    { title: "Costos", x: 410, w: 60 },
    { title: "Margen", x: 475, w: 80 },
  ];
  const th = doc.y;
  doc.rect(48, th - 2, 510, 14).fill("#f1f5f9");
  doc.fillColor("#0f172a").fontSize(9);
  for (const c of tripCols) doc.text(c.title, c.x, th, { width: c.w });
  doc.moveDown();
  doc.fontSize(9).fillColor("#334155");
  for (const t of input.trips.slice(0, 30)) {
    const rowY = doc.y;
    doc.text(t.reference, tripCols[0].x, rowY, { width: tripCols[0].w, ellipsis: true });
    doc.text(t.customerName || "—", tripCols[1].x, rowY, { width: tripCols[1].w, ellipsis: true });
    doc.text(money(t.summary.revenue), tripCols[2].x, rowY, { width: tripCols[2].w });
    doc.text(money(t.summary.cost), tripCols[3].x, rowY, { width: tripCols[3].w });
    doc.fillColor(t.summary.margin >= 0 ? "#065f46" : "#7f1d1d").text(money(t.summary.margin), tripCols[4].x, rowY, { width: tripCols[4].w });
    doc.fillColor("#334155");
    doc.moveDown(0.4);
    if (doc.y > 720) doc.addPage();
  }

  doc.end();
  return finished;
}
