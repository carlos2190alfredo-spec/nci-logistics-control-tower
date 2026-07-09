import PDFDocument from "pdfkit/js/pdfkit.standalone";
import type { Document, Equipment, ProofOfDelivery, ServiceType, Trip, TripEvent, Vehicle, Driver, CustomerAccount, Tenant, TenantBranding } from "@/generated/prisma";

type PodTrip = Trip & {
  tenant: Tenant & { branding: TenantBranding | null };
  customerAccount: CustomerAccount;
  serviceType: ServiceType;
  vehicle: Vehicle | null;
  equipment: Equipment | null;
  driver: Driver | null;
  proof: ProofOfDelivery | null;
  documents: Document[];
  events: TripEvent[];
};

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return { chunks, finished };
}

export async function generateProofOfDeliveryPdf(trip: PodTrip) {
  const doc = new PDFDocument({ margin: 48, size: "LETTER" });
  const { finished } = collectPdf(doc);
  const branding = trip.tenant.branding;
  const proof = trip.proof;

  doc.fontSize(18).fillColor("#0f2d46").text(branding?.wordmark ?? trip.tenant.name);
  doc.fontSize(9).fillColor("#64748b").text("Tecnologia desarrollada por NCI Automation");
  doc.moveDown();

  doc.fontSize(15).fillColor("#0f172a").text("Prueba de entrega");
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#334155");
  doc.text(`Referencia: ${trip.reference}`);
  doc.text(`Cliente: ${trip.customerAccount.name}`);
  doc.text(`Tipo de servicio: ${trip.serviceType.name}`);
  doc.text(`Origen: ${trip.origin}`);
  doc.text(`Destino: ${trip.destination}`);
  doc.text(`Fecha programada: ${trip.scheduledAt.toISOString()}`);
  doc.text(`Vehiculo: ${trip.vehicle?.code ?? "No asignado"}`);
  doc.text(`Equipo: ${trip.equipment?.code ?? "No asignado"}`);
  doc.text(`Conductor: ${trip.driver?.name ?? "No asignado"}`);
  doc.moveDown();

  doc.fontSize(12).fillColor("#0f2d46").text("Entrega");
  doc.fontSize(10).fillColor("#334155");
  doc.text(`Receptor: ${proof?.receiverName ?? "Pendiente"}`);
  doc.text(`Entregado: ${proof?.deliveredAt.toISOString() ?? "Pendiente"}`);
  doc.text(`Observacion: ${proof?.observation ?? "Sin observacion"}`);
  doc.moveDown();

  if (proof?.signatureSvg?.startsWith("data:image/png;base64,")) {
    doc.fontSize(12).fillColor("#0f2d46").text("Firma");
    doc.fontSize(10).fillColor("#334155").text("Firma digital capturada en la aplicacion del conductor.");
    doc.moveDown();
  }

  const customerDocs = trip.documents.filter((document) => document.visibility === "CUSTOMER_VISIBLE");
  doc.fontSize(12).fillColor("#0f2d46").text("Evidencias autorizadas");
  if (customerDocs.length === 0) {
    doc.fontSize(10).fillColor("#334155").text("Sin evidencias autorizadas.");
  } else {
    customerDocs.forEach((document) => {
      doc.fontSize(10).fillColor("#334155").text(`- ${document.filename} (${document.mimeType})`);
    });
  }
  doc.moveDown();

  doc.fontSize(12).fillColor("#0f2d46").text("Linea de tiempo");
  trip.events.forEach((event) => {
    doc.fontSize(9).fillColor("#334155").text(`${event.createdAt.toISOString()} - ${event.toStatus} - ${event.note ?? ""}`);
  });
  doc.moveDown();
  doc.fontSize(8).fillColor("#64748b").text(`Generado: ${new Date().toISOString()}`);
  doc.end();

  return finished;
}
