/**
 * Resumen legible de `ServiceRequest.cargoDetails` (JSON libre escrito por el portal y por "Nuevo viaje").
 * Tolera `null`, tipos inesperados y viajes sin solicitud: solo devuelve texto corto, nunca lanza.
 */
export type CargoSummary = {
  contact: string | null;
  container: string | null;
  booking: string | null;
};

function text(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function summarizeCargo(cargoDetails: unknown): CargoSummary | null {
  const root = record(cargoDetails);
  if (!root) return null;
  const contact = record(root.contact);
  const container = record(root.container);

  const contactName = text(contact?.name, 60);
  const contactPhone = text(contact?.phone, 30);
  const containerParts = [text(container?.number, 20), text(container?.size, 10), text(container?.type, 30)].filter(Boolean);

  const summary: CargoSummary = {
    contact: [contactName, contactPhone].filter(Boolean).join(" · ") || null,
    container: containerParts.join(" · ") || null,
    booking: text(container?.bookingReference, 60),
  };
  return summary.contact || summary.container || summary.booking ? summary : null;
}
