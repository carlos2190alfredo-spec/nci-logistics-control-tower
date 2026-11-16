"use client";

/**
 * STUB de la Fase 1 (ADR-038): la firma pública es definitiva; la implementación real (vista previa,
 * validación y envío a `importCatalogCsvAction`) la entrega la ola 2 (S5). Mientras tanto no renderiza nada.
 */
export type CsvImportKind = "customers" | "vehicles" | "equipment" | "locations";

export function CsvImportPanel(_props: { tenantSlug: string; kind: CsvImportKind; canImport: boolean }) {
  return null;
}
