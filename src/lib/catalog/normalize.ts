/**
 * Normalizadores de texto para los catálogos (clientes, flota, lugares, tipos de servicio).
 *
 * Módulo puro: se usa en el servidor (que es quien manda) y en el navegador (vista previa del CSV)
 * con exactamente el mismo código. Ninguna función lanza ni depende de la configuración regional:
 * se usa siempre `toUpperCase()` / `toLowerCase()` (nunca las variantes `toLocale*`).
 *
 * Además de lo evidente (recortar, colapsar espacios, NFC), se eliminan los caracteres invisibles
 * que llegan al copiar y pegar desde Excel, Word o WhatsApp (espacio de ancho cero, marcas de
 * dirección bidireccional, guion suave, caracteres de control): dos placas que "se ven iguales"
 * pero difieren en un carácter invisible serían un duplicado imposible de diagnosticar, y las
 * marcas bidireccionales permiten suplantar visualmente un texto en pantalla.
 *
 * Nota de implementación: los caracteres invisibles o ambiguos (BOM, ZWJ, separadores de línea, signo
 * menos) se construyen con `String.fromCharCode` en lugar de escribirlos en el código fuente, para
 * que el archivo no contenga caracteres que ningún editor o herramienta muestra.
 */

import { CODE_MAX_LENGTH, SLUG_CODE_MAX_LENGTH } from "./limits";

const BOM = String.fromCharCode(0xfeff);
/** Separador de línea y de párrafo de Unicode (U+2028 / U+2029) y NEL (U+0085): saltos de línea "raros". */
const EXOTIC_NEWLINES = [0x0085, 0x2028, 0x2029].map((code) => String.fromCharCode(code)).join("");
/** Unión y no-unión de ancho cero: se conservan porque forman parte de secuencias legítimas (emojis compuestos). */
const JOINERS = String.fromCharCode(0x200c, 0x200d);
const MINUS_SIGN = String.fromCharCode(0x2212);

/** Cualquier espacio (incluye NBSP y saltos de línea) más los saltos de línea exóticos. */
const ANY_WHITESPACE = new RegExp(`[\\s${EXOTIC_NEWLINES}]+`, "g");
/** Todos los saltos de línea posibles, para unificarlos en `\n`. */
const ANY_NEWLINE = new RegExp(`\\r\\n|\\r|[${EXOTIC_NEWLINES}]`, "g");
/**
 * Controles (Cc) y caracteres de formato (Cf) invisibles (espacio de ancho cero, marcas
 * bidireccionales, guion suave, BOM…), salvo la unión y la no-unión de ancho cero. `\n` se conserva
 * porque `cleanup` decide aparte qué hacer con los saltos de línea.
 */
const INVISIBLE_CHARS = new RegExp(`(?![${JOINERS}\\n])[\\p{Cc}\\p{Cf}]`, "gu");
/** Guiones tipográficos (rayas, guion unicode…) y el signo menos, que Word/Excel colocan en lugar de "-". */
const UNICODE_DASHES = new RegExp(`[\\p{Pd}${MINUS_SIGN}]`, "gu");
const COMBINING_MARKS = /\p{M}+/gu;

/**
 * Limpieza común: quita la marca BOM, unifica espacios/tabuladores/NBSP/saltos de línea,
 * elimina caracteres invisibles y compone en NFC. Con `keepNewlines` conserva los saltos de línea
 * (como `\n`), útil para textos multilínea.
 */
function cleanup(value: string, keepNewlines: boolean): string {
  let text = value.split(BOM).join("");
  if (keepNewlines) {
    text = text.replace(ANY_NEWLINE, "\n").replace(/[^\S\n]+/g, " ");
  } else {
    text = text.replace(ANY_WHITESPACE, " ");
  }
  return text.replace(INVISIBLE_CHARS, "").normalize("NFC");
}

/** Convierte los guiones tipográficos y el signo menos (U+2212) en el guion simple "-". */
export function unifyDashes(value: string): string {
  return value.replace(UNICODE_DASHES, "-");
}

/** Quita las tildes y demás marcas combinantes ("Camión" → "Camion", "ñ" → "n"). */
export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "");
}

/** Recorta, colapsa cualquier secuencia de espacios (incluye saltos de línea y NBSP) y compone en NFC. */
export function normalizeText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return cleanup(value, false).replace(/ {2,}/g, " ").trim();
}

/** Igual que `normalizeText`, pero devuelve `null` si el resultado queda vacío (para columnas opcionales). */
export function nullableText(value: string | null | undefined): string | null {
  const text = normalizeText(value);
  return text === "" ? null : text;
}

/**
 * Para textos de varias líneas (notas): conserva los saltos de línea (CRLF/CR → LF), colapsa los
 * espacios dentro de cada línea, recorta cada línea y reduce las líneas en blanco consecutivas a una.
 */
export function normalizeMultiline(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return cleanup(value, true)
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Placa: mayúsculas, sin espacios y sin tildes; conserva el guion "-" (los guiones tipográficos se
 * convierten en "-"). No elimina otros símbolos: es el esquema quien los rechaza con un mensaje claro.
 */
export function normalizePlate(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return stripDiacritics(unifyDashes(cleanup(value, false)))
    .replace(/ /g, "")
    .toUpperCase();
}

/**
 * Paso común de los códigos: mayúsculas, sin tildes, guiones tipográficos unificados y espacios → "-".
 * Todavía puede traer símbolos (`/`, `#`, letras de otros alfabetos…): `normalizeCodeFull` los borra y
 * `hasUnsupportedCodeChars` los detecta.
 */
function codeCandidate(value: string): string {
  return stripDiacritics(unifyDashes(cleanup(value, false)))
    .toUpperCase()
    .replace(/ /g, "-");
}

/**
 * Código sin truncar: mayúsculas, sin tildes, espacios → "-", solo `[A-Z0-9._-]`, sin guiones
 * repetidos ni en los extremos. Lo usan los esquemas para poder RECHAZAR un código demasiado largo
 * en lugar de truncarlo en silencio.
 */
export function normalizeCodeFull(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return codeCandidate(value)
    .replace(/[^A-Z0-9._-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `true` si `normalizeCodeFull` BORRARÍA algún carácter con significado: un símbolo (`CH/40/01`,
 * `EQ#5`) o una letra de otro alfabeto (una "С" cirílica que se ve como la "C" latina). Mayúsculas,
 * tildes, espacios, guiones tipográficos y caracteres invisibles NO cuentan: se convierten sin cambiar
 * de qué código se trata.
 *
 * Existe para que los esquemas rechacen esos códigos en lugar de guardar otro distinto en silencio:
 * el código es inmutable y enlaza documentos de cumplimiento y órdenes de mantenimiento por texto, así
 * que `CH/40/01` convertido en `CH4001` (o `СН-40` en `40`) dejaría un enlace imposible de explicar.
 */
export function hasUnsupportedCodeChars(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return /[^A-Z0-9._-]/.test(codeCandidate(value));
}

/**
 * Código de catálogo (vehículo, equipo, cliente): `normalizeCodeFull` limitado a 32 caracteres.
 * Es idempotente: `normalizeCode(normalizeCode(x)) === normalizeCode(x)`.
 */
export function normalizeCode(value: string | null | undefined): string {
  return normalizeCodeFull(value).slice(0, CODE_MAX_LENGTH).replace(/-+$/, "");
}

/**
 * Código derivado de un nombre: sin tildes, mayúsculas, todo lo que no sea alfanumérico pasa a "_",
 * sin "_" en los extremos y máximo 40 caracteres. `"Carga refrigerada"` → `CARGA_REFRIGERADA`.
 * Devuelve `""` si el nombre no tiene ningún carácter alfanumérico.
 */
export function slugCode(name: string | null | undefined): string {
  if (typeof name !== "string") return "";
  return stripDiacritics(cleanup(name, false))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, SLUG_CODE_MAX_LENGTH)
    .replace(/_+$/, "");
}

/** Correo: recorta y pasa a minúsculas (`User.email` distingue mayúsculas: ver R2 §4.2). No lo valida. */
export function normalizeEmail(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return cleanup(value, false).trim().toLowerCase();
}

/** Quita una o más marcas BOM (U+FEFF) al inicio del texto (archivos CSV de Excel). */
export function stripBom(value: string): string {
  let start = 0;
  while (value.charCodeAt(start) === 0xfeff) start += 1;
  return start === 0 ? value : value.slice(start);
}

/**
 * Clave para comparar nombres de forma tolerante (mayúsculas, tildes y espacios no importan).
 * Sirve para detectar repetidos dentro de un archivo; NO se guarda en la base de datos.
 */
export function comparableKey(value: string | null | undefined): string {
  return stripDiacritics(normalizeText(value)).toLowerCase();
}
