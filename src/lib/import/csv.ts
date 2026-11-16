/**
 * Lector de CSV (módulo puro, sin I/O, utilizable en el navegador y en el servidor).
 *
 * La vista previa del navegador y la validación del servidor ejecutan ESTE mismo código: lo que la
 * persona ve en pantalla es lo que el servidor va a importar. El servidor nunca confía en la vista
 * previa: vuelve a leer y validar el archivo recibido.
 *
 * Tolerancias pensadas para los archivos reales de Excel en español y de otras herramientas:
 *  - BOM UTF-8 al inicio; línea `sep=;` que Excel y otras herramientas anteponen al encabezado.
 *  - Delimitador `,` `;` o tabulador, detectado en la primera línea con contenido (fuera de comillas).
 *  - RFC 4180: comillas dobles, `""` como comilla escapada, saltos de línea dentro de comillas,
 *    fin de línea CRLF, LF o CR (incluso mezclados).
 *  - Espacios antes de una comilla de apertura (`, "texto"`) y texto después de una comilla de cierre.
 *  - Líneas vacías y registros con todas las celdas vacías (`;;;` al final de una hoja de Excel) se ignoran.
 *
 * Lo que NO hace en silencio: una comilla sin cerrar (se perdería el resto del archivo) es un error con
 * el número de línea; toda fila con más o menos celdas que el encabezado se rellena o se recorta y lleva
 * un aviso (`warning`); si las celdas SOBRANTES traían datos (casi siempre una coma sin comillas dentro
 * de un texto) se marca además con `extraCells` para que el importador la rechace en lugar de desplazar
 * las columnas.
 *
 * Los archivos de Excel guardados como "CSV" (no "CSV UTF-8") llegan en Windows-1252: use
 * `decodeCsvBytes(await file.arrayBuffer())` en lugar de `file.text()` para leer bien tildes y eñes.
 */

import { MAX_IMPORT_BYTES, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "@/lib/catalog/limits";
import { stripBom } from "@/lib/catalog/normalize";

export type CsvDelimiter = "," | ";" | "\t";

export type CsvRow = {
  /** Línea física (1-based) del archivo donde EMPIEZA el registro (un texto entre comillas puede ocupar varias). */
  line: number;
  /** Siempre tiene exactamente tantas celdas como el encabezado (se rellena o se recorta). */
  cells: string[];
  /** Aviso en español cuando el número de celdas no coincidía con el del encabezado. */
  warning?: string;
  /** Celdas sobrantes CON datos que se descartaron (0 u omitido si no hubo). Indica una fila desplazada. */
  extraCells?: number;
};

export type ParseCsvOptions = {
  /** Tamaño máximo en bytes UTF-8 (por defecto `MAX_IMPORT_BYTES`). */
  maxBytes?: number;
  /** Filas de datos máximas, sin contar el encabezado (por defecto `MAX_IMPORT_ROWS`). */
  maxRows?: number;
  /** Columnas máximas del encabezado (por defecto `MAX_IMPORT_COLUMNS`). */
  maxColumns?: number;
};

export type ParseCsvResult =
  | {
      ok: true;
      delimiter: CsvDelimiter;
      headers: string[];
      rows: CsvRow[];
      /** Avisos del archivo completo (por ejemplo, caracteres ilegibles por una codificación equivocada). */
      warnings: string[];
    }
  | { ok: false; error: string };

const DELIMITERS: readonly CsvDelimiter[] = [",", ";", "\t"];
const NBSP = String.fromCharCode(0x00a0);
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

/** Bytes que ocupa `text` en UTF-8, sin reservar memoria. */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      // Par sustituto (emoji, caracteres fuera del plano básico): 4 bytes en total.
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** "1 MB", "1.5 MB", "820 KB", "512 bytes". */
export function formatFileSize(bytes: number): string {
  const trim = (value: number) => value.toFixed(1).replace(/\.0$/, "");
  if (bytes >= 1_048_576) return `${trim(bytes / 1_048_576)} MB`;
  if (bytes >= 1024) return `${trim(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/** 1048576 → "1,048,576". */
function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

type LineScan = {
  /** Índice del terminador de línea (o del final del texto). */
  end: number;
  /** Índice del primer carácter de la línea siguiente. */
  next: number;
  /** La línea tiene algo más que espacios y delimitadores. */
  hasContent: boolean;
  counts: Record<CsvDelimiter, number>;
  /** Saltos de línea consumidos (dentro de comillas y el terminador). */
  newlines: number;
};

/** Recorre una línea lógica (respeta saltos de línea dentro de comillas) contando delimitadores fuera de comillas. */
function scanLine(text: string, start: number): LineScan {
  const counts: Record<CsvDelimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  let hasContent = false;
  let newlines = 0;
  let index = start;
  for (; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '"') {
      inQuotes = !inQuotes;
      hasContent = true;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      const crlf = ch === "\r" && text[index + 1] === "\n";
      if (inQuotes) {
        if (crlf) index += 1;
        newlines += 1;
        continue;
      }
      return { end: index, next: index + (crlf ? 2 : 1), hasContent, counts, newlines: newlines + 1 };
    }
    if (inQuotes) continue;
    if (ch === "," || ch === ";" || ch === "\t") {
      counts[ch] += 1;
      continue;
    }
    if (ch !== " " && ch !== NBSP) hasContent = true;
  }
  return { end: index, next: index, hasContent, counts, newlines };
}

function pickDelimiter(counts: Record<CsvDelimiter, number>): CsvDelimiter {
  let best: CsvDelimiter = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    // En un empate gana el primero de la lista (coma, punto y coma, tabulador).
    if (counts[delimiter] > bestCount) {
      best = delimiter;
      bestCount = counts[delimiter];
    }
  }
  return best;
}

type Start = {
  delimiter: CsvDelimiter;
  offset: number;
  line: number;
  /** El texto no tiene ninguna línea con contenido (solo espacios, saltos de línea o delimitadores sueltos). */
  empty: boolean;
};

/** Determina el delimitador y desde dónde leer (se salta una línea `sep=;`). */
function analyzeStart(text: string): Start {
  let position = 0;
  let line = 1;
  let forced: CsvDelimiter | null = null;
  let offset = 0;
  let offsetLine = 1;
  let hintChecked = false;

  while (position < text.length) {
    const scan = scanLine(text, position);
    if (scan.hasContent) {
      if (!hintChecked) {
        hintChecked = true;
        const hint = /^sep=(.)$/i.exec(text.slice(position, scan.end).trim());
        if (hint) {
          // La línea `sep=X` no es un encabezado: se salta, y X manda si es un delimitador conocido.
          const declared = DELIMITERS.find((delimiter) => delimiter === hint[1]);
          if (declared) forced = declared;
          offset = scan.next;
          offsetLine = line + scan.newlines;
          position = scan.next;
          line += scan.newlines;
          if (forced) break;
          continue;
        }
      }
      return { delimiter: forced ?? pickDelimiter(scan.counts), offset, line: offsetLine, empty: false };
    }
    position = scan.next;
    line += scan.newlines;
    if (scan.next === scan.end) break;
  }
  // Si hubo una línea `sep=` el tokenizador decide si queda algo; si no, el archivo no tiene contenido.
  return { delimiter: forced ?? ",", offset, line: offsetLine, empty: !hintChecked };
}

/** Delimitador de un texto CSV (`,` si no se puede decidir). Exportado para pruebas y para la interfaz. */
export function detectDelimiter(text: string): CsvDelimiter {
  return analyzeStart(stripBom(text)).delimiter;
}

type RawRecord = { line: number; cells: string[] };
type Tokenized = { records: RawRecord[] } | { error: string } | { tooMany: true };

function tokenize(text: string, delimiter: CsvDelimiter, offset: number, startLine: number, maxRecords: number): Tokenized {
  const records: RawRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false; // el campo actual empezó con comilla
  let blank = true; // el campo actual solo tiene espacios hasta ahora (se mantiene en O(1), sin recortar el campo entero)
  let inQuotes = false;
  let quoteLine = startLine;
  let line = startLine;
  let recordLine = startLine;

  const endField = () => {
    cells.push(field.trim());
    field = "";
    quoted = false;
    blank = true;
  };
  /** Cierra el registro; devuelve `false` si se superó el máximo de registros. */
  const endRecord = (): boolean => {
    endField();
    if (cells.some((cell) => cell !== "")) {
      records.push({ line: recordLine, cells });
      if (records.length > maxRecords) return false;
    }
    cells = [];
    return true;
  };

  let index = offset;
  const length = text.length;
  while (index < length) {
    const ch = text[index];
    if (inQuotes) {
      if (ch === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[index + 1] === "\n") index += 1;
        field += "\n";
        line += 1;
        index += 1;
        continue;
      }
      field += ch;
      index += 1;
      continue;
    }
    if (ch === '"' && !quoted && blank) {
      inQuotes = true;
      quoted = true;
      field = "";
      quoteLine = line;
      index += 1;
      continue;
    }
    if (ch === delimiter) {
      endField();
      index += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[index + 1] === "\n") index += 1;
      index += 1;
      if (!endRecord()) return { tooMany: true };
      line += 1;
      recordLine = line;
      continue;
    }
    field += ch;
    if (blank && ch.trim() !== "") blank = false;
    index += 1;
  }

  if (inQuotes) {
    return {
      error: `La comilla que se abre en la línea ${quoteLine} nunca se cierra. Revise esa línea del archivo.`,
    };
  }
  // Último registro sin salto de línea final.
  if (field !== "" || cells.length > 0 || quoted) {
    if (!endRecord()) return { tooMany: true };
  }
  return { records };
}

/** Ajusta un registro al ancho del encabezado y anota las diferencias. */
function fitToHeader(record: RawRecord, width: number): CsvRow {
  const { line } = record;
  const count = record.cells.length;
  if (count === width) return { line, cells: record.cells };
  if (count < width) {
    return {
      line,
      cells: [...record.cells, ...Array<string>(width - count).fill("")],
      warning: `La fila tiene ${count} celdas y el encabezado ${width}; se completó con celdas vacías.`,
    };
  }
  const extras = record.cells.slice(width).filter((cell) => cell !== "").length;
  const row: CsvRow = { line, cells: record.cells.slice(0, width) };
  if (extras > 0) {
    // Sobrantes CON datos: casi siempre una coma sin comillas que desplazó las columnas. Se marca para
    // que el importador rechace la fila en lugar de guardar los datos en la columna equivocada.
    row.extraCells = extras;
    row.warning =
      `La fila tiene ${count} celdas y el encabezado ${width}; se descartó el exceso. ` +
      "Revise que los textos con comas o puntos y coma estén entre comillas.";
  } else {
    // Sobrantes vacías (delimitadores al final): no se pierde nada, pero igual se avisa de la diferencia.
    row.warning = `La fila tiene ${count} celdas y el encabezado ${width}; se ignoraron las celdas sobrantes, que estaban vacías.`;
  }
  return row;
}

/**
 * Lee un texto CSV. Nunca lanza: los problemas del archivo se devuelven como `{ ok: false, error }`
 * con un mensaje en español listo para mostrar.
 */
export function parseCsv(text: string, opts: ParseCsvOptions = {}): ParseCsvResult {
  const maxBytes = opts.maxBytes ?? MAX_IMPORT_BYTES;
  const maxRows = opts.maxRows ?? MAX_IMPORT_ROWS;
  const maxColumns = opts.maxColumns ?? MAX_IMPORT_COLUMNS;
  if (typeof text !== "string") return { ok: false, error: "No se pudo leer el archivo." };

  const size = utf8ByteLength(text);
  if (size > maxBytes) {
    // Un archivo apenas por encima del tope se redondearía al mismo valor ("pesa 1 MB y el máximo es 1 MB"):
    // en ese caso se muestran los bytes exactos.
    const exact = formatFileSize(size) === formatFileSize(maxBytes);
    const show = (bytes: number) => (exact ? `${groupDigits(bytes)} bytes` : formatFileSize(bytes));
    return {
      ok: false,
      error: `El archivo pesa ${show(size)} y el máximo permitido es ${show(maxBytes)}. Divídalo en varios archivos.`,
    };
  }

  const source = stripBom(text);
  if (source.trim() === "") return { ok: false, error: "El archivo está vacío." };

  const start = analyzeStart(source);
  if (start.empty) return { ok: false, error: "El archivo está vacío." };
  // +1: el encabezado también es un registro.
  const tokens = tokenize(source, start.delimiter, start.offset, start.line, maxRows + 1);
  if ("error" in tokens) return { ok: false, error: tokens.error };
  if ("tooMany" in tokens) {
    return {
      ok: false,
      error: `El archivo tiene más de ${maxRows} filas de datos. Divídalo en archivos de hasta ${maxRows} filas.`,
    };
  }

  const [headerRecord, ...dataRecords] = tokens.records;
  if (!headerRecord) return { ok: false, error: "El archivo está vacío." };
  if (dataRecords.length === 0) {
    return { ok: false, error: "El archivo solo tiene el encabezado. Agregue al menos una fila de datos." };
  }

  const headers = headerRecord.cells;
  if (headers.length > maxColumns) {
    return {
      ok: false,
      error: `El archivo tiene ${headers.length} columnas y el máximo es ${maxColumns}. Elimine las columnas que no necesita.`,
    };
  }
  const warnings: string[] = [];
  if (source.includes(REPLACEMENT_CHAR)) {
    warnings.push(
      "El archivo tiene caracteres ilegibles, probablemente tildes o eñes. " +
        "Guárdelo desde Excel como «CSV UTF-8 (delimitado por comas)» y vuelva a cargarlo.",
    );
  }

  return {
    ok: true,
    delimiter: start.delimiter,
    headers,
    rows: dataRecords.map((record) => fitToHeader(record, headers.length)),
    warnings,
  };
}

export type DecodedCsv = {
  text: string;
  encoding: "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";
};

/**
 * Decodifica los bytes de un archivo CSV: UTF-16 si trae su marca, UTF-8 si es válido y, si no,
 * Windows-1252 (lo que produce Excel en español con "CSV" a secas). Nunca lanza.
 */
export function decodeCsvBytes(input: ArrayBuffer | Uint8Array): DecodedCsv {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "utf-16le" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes), encoding: "utf-16be" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}
