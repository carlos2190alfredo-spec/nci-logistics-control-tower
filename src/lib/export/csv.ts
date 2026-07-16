/**
 * Serializador CSV conforme a RFC 4180.
 * - Separador coma, fin de linea CRLF.
 * - Envuelve en comillas cualquier campo con coma, comilla, salto de linea.
 * - Escapa comillas duplicandolas.
 * - Prefija con BOM UTF-8 para que Excel abra acentos correctamente.
 *
 * Mitigacion de inyeccion de formulas (CSV injection): valores que empiezan
 * con = + - @ se prefijan con una comilla simple, evitando que Excel/Sheets
 * ejecute el contenido como formula.
 */

const UTF8_BOM = "﻿";
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = value instanceof Date ? value.toISOString() : String(value);

  // Neutraliza inyeccion de formulas.
  if (str.length > 0 && FORMULA_TRIGGERS.includes(str[0])) {
    str = `'${str}`;
  }

  // Escapa si contiene caracteres especiales.
  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => sanitizeCell(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((c) => sanitizeCell(c.value(row))).join(","),
  );
  return UTF8_BOM + [headerLine, ...dataLines].join("\r\n") + "\r\n";
}
