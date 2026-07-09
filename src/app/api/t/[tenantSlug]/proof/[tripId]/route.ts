import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { requireCustomerMembership } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; tripId: string }> },
) {
  const { tenantSlug, tripId } = await params;
  const { tenant, customerAccount } = await requireCustomerMembership(tenantSlug);
  const trip = await getDb().trip.findFirst({
    where: { id: tripId, tenantId: tenant.id, customerAccountId: customerAccount.id },
    include: { driver: true, vehicle: true, proof: true, events: { orderBy: { createdAt: "asc" } } },
  });

  if (!trip || !trip.proofReady || !trip.proof) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 48 });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(18).text("NCI Logistics Control Tower", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(14).text("Prueba de entrega");
  doc.moveDown();
  doc.fontSize(10).text(`Tenant: ${tenant.name}`);
  doc.text(`Cliente: ${customerAccount.name}`);
  doc.text(`Referencia: ${trip.reference}`);
  doc.text(`Origen: ${trip.origin}`);
  doc.text(`Destino: ${trip.destination}`);
  doc.text(`Conductor: ${trip.driver?.name ?? "No asignado"}`);
  doc.text(`Vehiculo: ${trip.vehicle?.code ?? "No asignado"}`);
  doc.text(`Receptor: ${trip.proof.receiverName}`);
  doc.text(`Fecha entrega: ${trip.proof.deliveredAt.toISOString()}`);
  doc.text(`Observacion: ${trip.proof.observation ?? "Sin observacion"}`);
  doc.moveDown();
  doc.fontSize(12).text("Linea de tiempo");
  trip.events.forEach((event) => {
    doc.fontSize(9).text(`${event.createdAt.toISOString()} - ${event.toStatus} - ${event.note ?? ""}`);
  });
  doc.moveDown();
  doc.fontSize(8).fillColor("#475569").text("Tecnologia desarrollada por NCI Automation");
  doc.end();

  const pdf = await finished;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${trip.reference}-pod.pdf"`,
    },
  });
}
