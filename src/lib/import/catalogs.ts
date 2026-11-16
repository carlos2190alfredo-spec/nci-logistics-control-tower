/**
 * Importación por CSV de los catálogos: clientes, vehículos, equipos y lugares (módulo puro).
 *
 * Toma el resultado de `parseCsv`, reconoce las columnas por sus nombres habituales en español e inglés
 * (sin importar mayúsculas, tildes, espacios, guiones ni guiones bajos), valida cada fila con los MISMOS
 * esquemas que usan los formularios (`schemas.ts`) y separa las filas válidas de las inválidas con un
 * mensaje por problema. Detecta además los repetidos DENTRO del archivo; los repetidos contra lo que ya
 * existe en la base de datos los resuelve la acción de servidor (esta función no ve la base de datos).
 *
 * Criterio de repetidos: la primera fila VÁLIDA que usa una clave la "reclama"; las siguientes filas con
 * esa clave se marcan inválidas. Una fila inválida por otro motivo no reclama nada (no se va a importar),
 * de modo que quien corrige una fila y la deja más abajo no queda bloqueado por la versión rota.
 */

import { z } from "zod";
import { comparableKey, normalizeText, stripDiacritics } from "@/lib/catalog/normalize";
import {
  customerInputSchema,
  equipmentInputSchema,
  locationInputSchema,
  safeParseInput,
  vehicleInputSchema,
  type CustomerInput,
  type EquipmentInput,
  type LocationInput,
  type VehicleInput,
} from "@/lib/catalog/schemas";
import { parseCsv, type CsvRow } from "./csv";

export type ImportKind = "customers" | "vehicles" | "equipment" | "locations";

export const IMPORT_KINDS: readonly ImportKind[] = ["customers", "vehicles", "equipment", "locations"];

export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  customers: "Clientes",
  vehicles: "Vehículos",
  equipment: "Equipos",
  locations: "Lugares",
};

export function isImportKind(value: unknown): value is ImportKind {
  return typeof value === "string" && (IMPORT_KINDS as readonly string[]).includes(value);
}

export type ImportColumn = {
  /** Clave del campo en el esquema (`name`, `plate`…). */
  readonly key: string;
  /** Nombre de la columna que se muestra a la persona (y se usa en la plantilla). */
  readonly label: string;
  readonly required: boolean;
  /**
   * Nombres oficiales aceptados en el encabezado: son los que se listan en el mensaje cuando falta una
   * columna obligatoria. La comparación ignora mayúsculas, tildes, espacios, "_" y "-".
   */
  readonly aliases: readonly string[];
  /**
   * Otros encabezados habituales que también se reconocen ("Correo electrónico", "Matrícula",
   * "Latitude"…) pero que no se listan en los mensajes, para que estos sigan siendo cortos.
   */
  readonly alsoAccepts: readonly string[];
};

const column = (
  key: string,
  label: string,
  aliases: readonly string[],
  options: { required?: boolean; also?: readonly string[] } = {},
): ImportColumn => ({
  key,
  label,
  required: options.required ?? false,
  aliases,
  alsoAccepts: options.also ?? [],
});

export const IMPORT_COLUMNS: Record<ImportKind, readonly ImportColumn[]> = {
  customers: [
    column("name", "Nombre", ["nombre", "razón social", "cliente", "empresa", "name"], {
      required: true,
      also: ["nombre del cliente", "nombre cliente", "nombre de la empresa", "customer", "company"],
    }),
    column("code", "Código", ["código", "code"], {
      also: ["código del cliente", "código cliente", "customer code"],
    }),
    column("taxId", "RUC", ["ruc", "tax id", "nit", "identificación"], {
      also: ["cédula", "ruc/cédula", "identificación fiscal", "id fiscal", "tax number"],
    }),
    column("contactName", "Contacto", ["contacto", "nombre contacto"], {
      also: ["nombre de contacto", "persona de contacto", "contact", "contact name"],
    }),
    column("contactEmail", "Correo", ["correo", "email", "e-mail"], {
      also: ["correo electrónico", "correo de contacto", "correo contacto", "email de contacto", "mail"],
    }),
    column("contactPhone", "Teléfono", ["teléfono", "tel", "celular", "phone"], {
      also: ["teléfono de contacto", "teléfono contacto", "móvil"],
    }),
    column("address", "Dirección", ["dirección", "address"], {
      also: ["dirección fiscal", "domicilio"],
    }),
    column("internalNotes", "Notas", ["notas", "observaciones"], {
      also: ["comentarios", "observación", "nota", "notes"],
    }),
  ],
  vehicles: [
    column("plate", "Placa", ["placa", "plate"], {
      required: true,
      also: ["matrícula", "número de placa", "placa del vehículo", "license plate"],
    }),
    column("code", "Unidad", ["unidad", "código", "code", "número"], {
      also: ["número de unidad", "número unidad", "código de unidad", "código unidad", "unit"],
    }),
    column("type", "Tipo", ["tipo", "type"], {
      also: ["tipo de vehículo", "tipo vehículo", "vehicle type"],
    }),
  ],
  equipment: [
    column("code", "Código", ["código", "code", "número", "chasis"], {
      required: true,
      also: [
        "código de equipo",
        "código equipo",
        "número de equipo",
        "número equipo",
        "número de chasis",
        "equipo",
        "chassis",
      ],
    }),
    column("type", "Tipo", ["tipo", "type"], {
      also: ["tipo de equipo", "tipo equipo", "equipment type"],
    }),
  ],
  locations: [
    column("name", "Nombre", ["nombre", "name"], {
      required: true,
      also: ["nombre del lugar", "nombre lugar", "lugar", "place", "location"],
    }),
    column("address", "Dirección", ["dirección", "address"], {
      also: ["dirección del lugar", "domicilio"],
    }),
    column("latitude", "Latitud", ["latitud", "lat"], { also: ["latitude"] }),
    column("longitude", "Longitud", ["longitud", "lng", "lon"], { also: ["longitude", "long"] }),
  ],
};

const SCHEMAS: Record<ImportKind, z.ZodType> = {
  customers: customerInputSchema,
  vehicles: vehicleInputSchema,
  equipment: equipmentInputSchema,
  locations: locationInputSchema,
};

/** Datos normalizados que produce la validación de cada tipo (la salida de los esquemas). */
export type ImportData = {
  customers: CustomerInput;
  vehicles: VehicleInput;
  equipment: EquipmentInput;
  locations: LocationInput;
};

// ---------------------------------------------------------------------------
// Encabezados
// ---------------------------------------------------------------------------

/** Un encabezado real mide decenas de caracteres: se recorta antes de aplicar expresiones regulares. */
const MAX_HEADER_LENGTH = 120;
/** Columnas desconocidas que se informan como máximo (un archivo hostil podría traer cientos de miles). */
const MAX_REPORTED_COLUMNS = 50;

/** Forma comparable de un encabezado: sin aclaraciones entre paréntesis, tildes, espacios ni signos. */
function headerKey(header: string): string {
  return stripDiacritics(normalizeText(header).slice(0, MAX_HEADER_LENGTH))
    .toLowerCase()
    .replace(/[([{].*?[)\]}]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function buildAliasIndex(kind: ImportKind): ReadonlyMap<string, ImportColumn> {
  const index = new Map<string, ImportColumn>();
  for (const col of IMPORT_COLUMNS[kind]) {
    for (const alias of [...col.aliases, ...col.alsoAccepts]) index.set(headerKey(alias), col);
  }
  return index;
}

const ALIAS_INDEX: Record<ImportKind, ReadonlyMap<string, ImportColumn>> = {
  customers: buildAliasIndex("customers"),
  vehicles: buildAliasIndex("vehicles"),
  equipment: buildAliasIndex("equipment"),
  locations: buildAliasIndex("locations"),
};

export type HeaderMapping = {
  /** Clave del campo → posición de la columna en el archivo. */
  mapping: Record<string, number>;
  /** Etiquetas de las columnas obligatorias que no aparecen. */
  missingRequired: string[];
  /** Encabezados del archivo que no se reconocen (se ignorarán). No incluye los vacíos. */
  unknown: string[];
  /** Etiquetas de las columnas que aparecen más de una vez (ambigüedad: se usa la primera). */
  duplicates: string[];
  /**
   * Para cada columna repetida, cómo la escribió la persona en el archivo (en orden): permite decir
   * «Código» y «Número» (que significan lo mismo: «Unidad») en lugar de nombrar una columna que el archivo no tiene.
   */
  duplicateDetails: { label: string; headers: string[] }[];
};

export function mapHeaders(kind: ImportKind, headers: readonly string[]): HeaderMapping {
  const index = ALIAS_INDEX[kind];
  const mapping: Record<string, number> = {};
  const unknown: string[] = [];
  const duplicates: string[] = [];
  /** Encabezados (tal como se escribieron) que cayeron en cada columna, en orden. */
  const writtenAs = new Map<string, string[]>();

  headers.forEach((header, position) => {
    const key = headerKey(header);
    if (key === "") return;
    const col = index.get(key);
    if (!col) {
      unknown.push(normalizeText(header));
      return;
    }
    const written = writtenAs.get(col.key) ?? [];
    written.push(normalizeText(header).slice(0, MAX_HEADER_LENGTH));
    writtenAs.set(col.key, written);
    if (Object.prototype.hasOwnProperty.call(mapping, col.key)) {
      if (!duplicates.includes(col.label)) duplicates.push(col.label);
      return;
    }
    mapping[col.key] = position;
  });

  const missingRequired = IMPORT_COLUMNS[kind]
    .filter((col) => col.required && !Object.prototype.hasOwnProperty.call(mapping, col.key))
    .map((col) => col.label);

  const duplicateDetails = duplicates.map((label) => {
    const col = IMPORT_COLUMNS[kind].find((candidate) => candidate.label === label);
    // Se cita recortado: un archivo hostil no debe inflar el mensaje.
    return { label, headers: ((col && writtenAs.get(col.key)) || []).map((header) => header.slice(0, 120)) };
  });

  return { mapping, missingRequired, unknown, duplicates, duplicateDetails };
}

/** «A», «B» y «C» (con "y" antes del último). */
function quotedList(items: readonly string[]): string {
  const quoted = items.map((item) => `«${item}»`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} y ${quoted[quoted.length - 1]}`;
}

function headerIssuesFor(kind: ImportKind, mapped: HeaderMapping): string[] {
  const issues: string[] = [];
  for (const label of mapped.missingRequired) {
    const col = IMPORT_COLUMNS[kind].find((candidate) => candidate.label === label);
    const accepted = col ? col.aliases.join(", ") : label.toLowerCase();
    issues.push(`Falta la columna obligatoria «${label}». Nombres que se aceptan: ${accepted}.`);
  }
  for (const { label, headers } of mapped.duplicateDetails) {
    // Si todas se escribieron igual ("Nombre", "Nombre") basta con decir que se repite; si no ("Código" y
    // "Número" para la misma columna "Unidad"), se dice cómo las escribió la persona para que las reconozca.
    const distinct = new Set(headers.map((header) => comparableKey(header)));
    const writtenAs = distinct.size > 1 ? `, escrita como ${quotedList(headers)}` : "";
    issues.push(`La columna «${label}» aparece más de una vez en el encabezado${writtenAs}. Deje solo una.`);
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export type ImportValidRow<K extends ImportKind> = {
  line: number;
  data: ImportData[K];
  /** Avisos que no impiden importar la fila (p. ej., faltaban celdas al final). */
  warnings?: string[];
};

export type ImportInvalidRow = {
  line: number;
  errors: string[];
  /** Celdas de la fila tal como se leyeron del archivo. */
  raw: string[];
};

export type ImportValidation<K extends ImportKind> = {
  valid: ImportValidRow<K>[];
  invalid: ImportInvalidRow[];
  /** Problemas que impiden validar cualquier fila (columna obligatoria ausente, columna repetida). */
  headerIssues: string[];
  /** Filas descartadas por repetir una clave que ya apareció antes en el archivo. */
  duplicatesInFile: number;
  /** Encabezados que no se reconocieron y se ignoran (informativo, no bloquea). */
  ignoredColumns: string[];
  /** Filas de datos leídas (válidas + inválidas). */
  totalRows: number;
  /**
   * Filas válidas que son las de EJEMPLO de la plantilla descargable, sin cambiar. Se importarían como datos
   * reales (y contarían contra el plan): cada una lleva un aviso en `warnings` para que la interfaz lo muestre.
   */
  exampleRows: number;
};

/**
 * Deshace el apóstrofo con el que `toCsv` (src/lib/export/csv.ts) neutraliza las fórmulas de Excel
 * (`'-79.5`, `'+507…`): un archivo exportado por el sistema y reimportado conserva sus valores.
 */
function unescapeFormulaGuard(cell: string): string {
  return /^'[=+\-@]/.test(cell) ? cell.slice(1) : cell;
}

function labelOf(kind: ImportKind, key: string): string {
  return IMPORT_COLUMNS[kind].find((col) => col.key === key)?.label ?? key;
}

/** Claves únicas dentro del archivo para una fila ya normalizada. */
function uniqueKeys(kind: ImportKind, data: ImportData[ImportKind]): { key: string; label: string }[] {
  switch (kind) {
    case "customers": {
      const customer = data as CustomerInput;
      const keys = [{ key: `name:${comparableKey(customer.name)}`, label: labelOf(kind, "name") }];
      if (customer.code) keys.unshift({ key: `code:${customer.code}`, label: labelOf(kind, "code") });
      return keys;
    }
    case "vehicles": {
      const vehicle = data as VehicleInput;
      return [
        { key: `plate:${vehicle.plate}`, label: labelOf(kind, "plate") },
        { key: `code:${vehicle.code}`, label: labelOf(kind, "code") },
      ];
    }
    case "equipment":
      return [{ key: `code:${(data as EquipmentInput).code}`, label: labelOf(kind, "code") }];
    case "locations":
      return [{ key: `name:${comparableKey((data as LocationInput).name)}`, label: labelOf(kind, "name") }];
  }
}

/**
 * Valida todas las filas leídas por `parseCsv`.
 *
 * Si hay problemas de encabezado (`headerIssues`), no se valida ninguna fila: `valid` e `invalid` quedan
 * vacíos. Cada error de fila empieza con el nombre de la columna tal como figura en el archivo
 * ("Placa: …") y las filas repetidas dicen "Repetido: ya aparece en la línea N".
 */
export function validateImport<K extends ImportKind>(
  kind: K,
  parsed: { headers: readonly string[]; rows: readonly CsvRow[] },
): ImportValidation<K> {
  return validateRows(kind, parsed, true);
}

/** Aviso de una fila válida que coincide con un ejemplo de la plantilla. */
export const EXAMPLE_ROW_WARNING =
  "Parece la fila de ejemplo de la plantilla. Si no es un dato real, bórrela del archivo antes de importar.";

/** Valor con el que se reconoce un registro de cada tipo (la columna principal de la plantilla). */
function primaryKey(kind: ImportKind, data: ImportData[ImportKind]): string {
  switch (kind) {
    case "customers":
      return comparableKey((data as CustomerInput).name);
    case "vehicles":
      return (data as VehicleInput).plate;
    case "equipment":
      return (data as EquipmentInput).code;
    case "locations":
      return comparableKey((data as LocationInput).name);
  }
}

const exampleKeysCache = new Map<ImportKind, ReadonlySet<string>>();

/**
 * Claves de las filas de ejemplo de la plantilla de `kind`. Se leen de la PROPIA plantilla (una sola
 * fuente: si alguien cambia un ejemplo, el aviso lo sigue) pasando por la misma normalización que
 * cualquier archivo.
 */
function exampleKeys(kind: ImportKind): ReadonlySet<string> {
  const cached = exampleKeysCache.get(kind);
  if (cached) return cached;
  const keys = new Set<string>();
  const template = parseCsv(IMPORT_TEMPLATES[kind].csv);
  if (template.ok) {
    for (const row of validateRows(kind, template, false).valid) keys.add(primaryKey(kind, row.data));
  }
  exampleKeysCache.set(kind, keys);
  return keys;
}

function validateRows<K extends ImportKind>(
  kind: K,
  parsed: { headers: readonly string[]; rows: readonly CsvRow[] },
  flagExamples: boolean,
): ImportValidation<K> {
  const mapped = mapHeaders(kind, parsed.headers);
  const headerIssues = headerIssuesFor(kind, mapped);
  const result: ImportValidation<K> = {
    valid: [],
    invalid: [],
    headerIssues,
    duplicatesInFile: 0,
    ignoredColumns: mapped.unknown.slice(0, MAX_REPORTED_COLUMNS).map((name) => name.slice(0, MAX_HEADER_LENGTH)),
    totalRows: parsed.rows.length,
    exampleRows: 0,
  };
  if (headerIssues.length > 0) return result;
  const examples = flagExamples ? exampleKeys(kind) : null;

  const columns = IMPORT_COLUMNS[kind];
  const schema = SCHEMAS[kind];
  const claimed = new Map<string, number>();

  for (const row of parsed.rows) {
    // Celdas sobrantes con datos: casi siempre una coma sin comillas que desplazó las columnas.
    if (row.extraCells && row.extraCells > 0) {
      result.invalid.push({
        line: row.line,
        errors: [row.warning ?? "La fila tiene más celdas que el encabezado."],
        raw: [...row.cells],
      });
      continue;
    }

    const input: Record<string, string> = {};
    for (const col of columns) {
      const position = mapped.mapping[col.key];
      if (position === undefined) continue;
      const cell = unescapeFormulaGuard(row.cells[position] ?? "");
      if (cell !== "") input[col.key] = cell;
    }

    const parsedRow = safeParseInput(schema, input);
    if (!parsedRow.success) {
      const errors: string[] = [];
      for (const issue of parsedRow.error.issues) {
        const key = String(issue.path[0] ?? "");
        const col = columns.find((candidate) => candidate.key === key);
        const position = col ? mapped.mapping[col.key] : undefined;
        // El encabezado tal como lo escribió la persona; si la columna no está en el archivo, la etiqueta oficial.
        const name = position !== undefined ? normalizeText(parsed.headers[position]) : (col?.label ?? "");
        const text = name ? `${name}: ${issue.message}` : issue.message;
        if (!errors.includes(text)) errors.push(text);
      }
      result.invalid.push({ line: row.line, errors, raw: [...row.cells] });
      continue;
    }

    const data = parsedRow.data as ImportData[K];
    const keys = uniqueKeys(kind, data);
    const conflict = keys.find((candidate) => claimed.has(candidate.key));
    if (conflict) {
      result.invalid.push({
        line: row.line,
        errors: [`Repetido: ya aparece en la línea ${claimed.get(conflict.key)} (${conflict.label}).`],
        raw: [...row.cells],
      });
      result.duplicatesInFile += 1;
      continue;
    }
    for (const candidate of keys) claimed.set(candidate.key, row.line);

    const entry: ImportValidRow<K> = { line: row.line, data };
    if (row.warning) entry.warnings = [row.warning];
    if (examples?.has(primaryKey(kind, data))) {
      entry.warnings = [...(entry.warnings ?? []), EXAMPLE_ROW_WARNING];
      result.exampleRows += 1;
    }
    result.valid.push(entry);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Plantillas descargables
// ---------------------------------------------------------------------------

const UTF8_BOM = String.fromCharCode(0xfeff);

/** Escapa una celda: entre comillas si lleva coma, comilla, punto y coma, salto de línea o espacios en los extremos. */
function csvCell(value: string): string {
  return /[",;\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildTemplate(filename: string, headers: readonly string[], rows: readonly (readonly string[])[]) {
  // No se usa `toCsv`: neutraliza valores que empiezan por "-" o "+" (un "-79.5" quedaría como texto).
  const lines = [headers, ...rows].map((cells) => cells.map(csvCell).join(","));
  return { filename, csv: `${UTF8_BOM}${lines.join("\r\n")}\r\n` };
}

/**
 * Plantillas con encabezados en español y dos filas de ejemplo CLARAMENTE ficticias (llevan "EJEMPLO" y
 * no usan nombres de las empresas de demostración). Separador `,` y BOM UTF-8 para que Excel muestre bien
 * las tildes.
 */
export const IMPORT_TEMPLATES: Record<ImportKind, { filename: string; csv: string }> = {
  customers: buildTemplate(
    "plantilla-clientes.csv",
    ["Nombre", "Código", "RUC", "Contacto", "Correo", "Teléfono", "Dirección", "Notas"],
    [
      [
        "EJEMPLO Cliente Uno S.A.",
        "",
        "0-000-0001",
        "Persona de ejemplo",
        "contacto1@example.com",
        "6000-0001",
        "Calle de ejemplo 1, Ciudad de Panamá",
        "Fila de ejemplo: bórrela antes de importar",
      ],
      ["EJEMPLO Cliente Dos S.A.", "", "0-000-0002", "Persona de ejemplo", "contacto2@example.com", "6000-0002", "", ""],
    ],
  ),
  vehicles: buildTemplate(
    "plantilla-vehiculos.csv",
    ["Placa", "Unidad", "Tipo"],
    [
      ["EJEMPLO-001", "UNIDAD-1", "Tracto camión"],
      ["EJEMPLO-002", "", "Camión rígido"],
    ],
  ),
  equipment: buildTemplate(
    "plantilla-equipos.csv",
    ["Código", "Tipo"],
    [
      ["EJEMPLO-EQ-1", "Chasis portacontenedor 40'"],
      ["EJEMPLO-EQ-2", "Plataforma"],
    ],
  ),
  locations: buildTemplate(
    "plantilla-lugares.csv",
    ["Nombre", "Dirección", "Latitud", "Longitud"],
    [
      ["Lugar de ejemplo 1", "Calle de ejemplo 10, Ciudad de Panamá", "8.9824", "-79.5199"],
      ["Lugar de ejemplo 2", "", "", ""],
    ],
  ),
};
