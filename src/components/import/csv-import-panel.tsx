"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Alert, Field, ServerForm, SubmitButton } from "@/components/ui";
import { MAX_IMPORT_BYTES } from "@/lib/catalog/limits";
import {
  IMPORT_KIND_LABEL,
  IMPORT_TEMPLATES,
  validateImport,
  type ImportData,
  type ImportKind,
  type ImportValidation,
} from "@/lib/import/catalogs";
import { decodeCsvBytes, formatFileSize, parseCsv } from "@/lib/import/csv";
import { importCatalogCsvAction } from "@/lib/server/import-actions";

export type CsvImportKind = ImportKind;

type Preview =
  | { status: "error"; message: string }
  | {
      status: "ready";
      text: string;
      encoding: string;
      warnings: string[];
      validation: ImportValidation<ImportKind>;
    };

/** Columnas que se muestran en la vista previa de cada tipo (solo para que la persona reconozca sus filas). */
function previewCells(kind: ImportKind, data: ImportData[ImportKind]): string[] {
  const d = data as Record<string, unknown>;
  const pick = (...keys: string[]) => keys.map((key) => (d[key] == null || d[key] === "" ? "—" : String(d[key])));
  switch (kind) {
    case "customers":
      return pick("name", "taxId", "contactName", "contactEmail");
    case "vehicles":
      return pick("plate", "code", "type");
    case "equipment":
      return pick("code", "type");
    case "locations":
      return pick("name", "address");
  }
}

const PREVIEW_HEADERS: Record<ImportKind, string[]> = {
  customers: ["Cliente", "RUC", "Contacto", "Correo"],
  vehicles: ["Placa", "Unidad", "Tipo"],
  equipment: ["Código", "Tipo"],
  locations: ["Lugar", "Dirección"],
};

/**
 * Importacion desde CSV (ADR-038): descargar plantilla → elegir archivo → vista previa inmediata (el mismo codigo de
 * validacion que usa el servidor) → importar. El servidor revalida todo; la vista previa es solo comodidad.
 */
export function CsvImportPanel({ tenantSlug, kind, canImport }: { tenantSlug: string; kind: CsvImportKind; canImport: boolean }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  if (!canImport) return null;

  const template = IMPORT_TEMPLATES[kind];
  const label = IMPORT_KIND_LABEL[kind].toLowerCase();

  async function onFile(file: File | undefined) {
    setDone(null);
    if (!file) return setPreview(null);
    if (file.size > MAX_IMPORT_BYTES) {
      return setPreview({ status: "error", message: `El archivo pesa ${formatFileSize(file.size)} y el máximo es ${formatFileSize(MAX_IMPORT_BYTES)}. Divídalo en partes.` });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Un .xlsx es un zip ("PK"): se explica en lugar de mostrar errores incomprensibles.
    if (bytes.length > 1 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
      return setPreview({ status: "error", message: "Ese archivo es de Excel (.xlsx). En Excel use «Guardar como» y elija «CSV UTF-8»." });
    }
    const decoded = decodeCsvBytes(bytes);
    const parsed = parseCsv(decoded.text);
    if (!parsed.ok) return setPreview({ status: "error", message: parsed.error });
    setPreview({
      status: "ready",
      text: decoded.text,
      encoding: decoded.encoding,
      warnings: parsed.warnings,
      validation: validateImport(kind, parsed),
    });
  }

  const ready = preview?.status === "ready" ? preview : null;
  const validation = ready?.validation;
  const blocked = Boolean(ready && (ready.warnings.length > 0 || (validation?.headerIssues.length ?? 0) > 0));
  const canSubmit = Boolean(ready && !blocked && (validation?.valid.length ?? 0) > 0);

  return (
    <details className="rounded-lg border border-border p-4" data-testid="csv-import-panel">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">Importar {label} desde un archivo (CSV)</summary>
      <div className="mt-4 grid gap-4">
        <p className="text-sm text-muted-foreground">
          1. Descargue la plantilla. 2. Llénela (puede guardar su hoja de Excel como CSV; se aceptan comas y punto y coma). 3. Selecciónela aquí y revise la vista previa.
        </p>
        <a
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover"
          download={template.filename}
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(template.csv)}`}
        >
          <Download aria-hidden className="size-4" />
          Descargar plantilla
        </a>

        <Field
          accept=".csv,text/csv,.txt"
          key={fileKey}
          label="Archivo CSV"
          name="archivo"
          onChange={(event) => void onFile(event.target.files?.[0])}
          required={false}
          type="file"
        />

        {done ? <Alert tone="success">{done}</Alert> : null}

        {preview?.status === "error" ? <Alert tone="danger">{preview.message}</Alert> : null}

        {ready && validation ? (
          <div className="grid gap-3">
            <p aria-live="polite" className="text-sm font-semibold text-foreground">
              {validation.valid.length} {validation.valid.length === 1 ? "fila lista" : "filas listas"}
              {validation.invalid.length > 0 ? ` · ${validation.invalid.length} con problemas` : ""}
            </p>
            {ready.encoding === "windows-1252" ? (
              <Alert tone="info">Se detectó la codificación de Excel (Windows-1252): las tildes se leerán bien.</Alert>
            ) : null}
            {ready.warnings.map((warning) => (
              <Alert key={warning} tone="warning">{warning}</Alert>
            ))}
            {validation.headerIssues.map((issue) => (
              <Alert key={issue} tone="danger">{issue}</Alert>
            ))}
            {validation.exampleRows > 0 ? (
              <Alert tone="warning">
                {validation.exampleRows === 1 ? "Una fila es" : `${validation.exampleRows} filas son`} de ejemplo de la plantilla. Bórrelas antes de importar.
              </Alert>
            ) : null}
            {validation.ignoredColumns.length > 0 ? (
              <p className="text-xs text-muted-foreground">Columnas que no se usarán: {validation.ignoredColumns.join(", ")}.</p>
            ) : null}

            {validation.valid.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <caption className="sr-only">Primeras filas listas para importar</caption>
                  <thead className="bg-surface-sunken text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2" scope="col">Línea</th>
                      {PREVIEW_HEADERS[kind].map((header) => (
                        <th className="px-3 py-2" key={header} scope="col">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {validation.valid.slice(0, 10).map((row) => (
                      <tr key={row.line}>
                        <td className="px-3 py-2 tabular-nums">{row.line}</td>
                        {previewCells(kind, row.data).map((cell, index) => (
                          <td className="px-3 py-2" key={index}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {validation.valid.length > 10 ? (
              <p className="text-xs text-muted-foreground">Se muestran las primeras 10 de {validation.valid.length} filas.</p>
            ) : null}

            {validation.invalid.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <caption className="sr-only">Filas con problemas, que no se importarán</caption>
                  <thead className="bg-surface-sunken text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2" scope="col">Línea</th>
                      <th className="px-3 py-2" scope="col">Problema</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {validation.invalid.slice(0, 50).map((row) => (
                      <tr key={row.line}>
                        <td className="px-3 py-2 tabular-nums">{row.line}</td>
                        <td className="px-3 py-2">{row.errors.join(" ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <ServerForm
              action={importCatalogCsvAction.bind(null, tenantSlug, kind)}
              label={`Importar ${label}`}
              onSuccess={(message) => {
                setDone(message);
                setPreview(null);
                setFileKey((key) => key + 1);
                router.refresh();
              }}
              resetOnSuccess={false}
            >
              <input name="csv" type="hidden" value={ready.text} />
              <SubmitButton disabled={!canSubmit}>
                Importar {validation.valid.length} {validation.valid.length === 1 ? "fila" : "filas"}
              </SubmitButton>
            </ServerForm>
          </div>
        ) : null}
      </div>
    </details>
  );
}
