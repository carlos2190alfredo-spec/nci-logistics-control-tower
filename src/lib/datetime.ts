/**
 * Fechas y horas "de pared" de la empresa (ADR-038).
 *
 * Un `<input type="datetime-local">` envía `YYYY-MM-DDTHH:mm` SIN zona: es la hora que el usuario ve en
 * su reloj, no un instante. `new Date("2026-11-20T14:00")` la interpreta en la zona del PROCESO (UTC en
 * Docker/CI, America/Panama en el equipo de desarrollo), así que el mismo formulario guardaba instantes
 * distintos según dónde corriera el servidor. Este módulo fija la regla: el valor es hora de pared de
 * una zona IANA explícita (por defecto Panamá, UTC−5 todo el año) y se convierte a un instante UTC sin
 * consultar nunca la zona del proceso.
 *
 * Reglas de diseño:
 * - Puro: sin I/O y sin getters locales de `Date` (`getHours`, `getDate`…). Solo `getUTC*`, `Date.UTC`
 *   e `Intl.DateTimeFormat` con `timeZone` explícito. Nada lee `process.env.TZ`.
 * - Estricto: solo `YYYY-MM-DDTHH:mm[:ss]`. Un `Z`, un desfase (`-05:00`), fracciones de segundo,
 *   espacios o días inexistentes (31 de febrero) devuelven `null`; no se "corrigen" en silencio.
 * - Válido también para zonas con horario de verano (el parámetro `tz` existe para cuando la zona sea
 *   configurable por empresa), aunque Panamá no lo tiene.
 *
 * Este módulo no lleva "use server": lo comparten servidor y cliente.
 */

/** Zona de pared por defecto de todas las empresas (UTC−5, sin horario de verano). */
export const PANAMA_TZ = "America/Panama";

/** Tolerancia por defecto de `isInPast`: una hora escrita "ahora" no debe rechazarse por unos minutos. */
export const DEFAULT_PAST_GRACE_MS = 5 * 60 * 1000;

/**
 * Años aceptados. Fuera de rango casi siempre es un error de captura: en Chrome, teclear "26" en el
 * campo de año produce `0026-11-20T14:00`, que `Date.UTC` interpretaría como 1926. El tope superior
 * evita que `scheduledAt + 4 h` cruce el año 9999 y rompa la serialización ISO hacia la base de datos.
 */
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

const DAY_MS = 24 * 60 * 60 * 1000;

const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Formateador numérico por zona. `hourCycle: "h23"` evita la medianoche como "24:00" de algunos motores;
 * calendario gregoriano y dígitos latinos fijos para que `formatToParts` sea siempre interpretable.
 * Lanza `RangeError` si `tz` no es una zona IANA válida: es un error de programación o de configuración,
 * no de captura del usuario.
 */
function getFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(tz, formatter);
  }
  return formatter;
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const WALL_CLOCK_FIELDS: readonly string[] = ["year", "month", "day", "hour", "minute", "second"];

/** Hora de pared de un instante en `tz`. */
function wallClockAt(instantMs: number, tz: string): WallClock {
  const wall: WallClock = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of getFormatter(tz).formatToParts(new Date(instantMs))) {
    if (WALL_CLOCK_FIELDS.includes(part.type)) wall[part.type as keyof WallClock] = Number(part.value);
  }
  wall.hour %= 24;
  return wall;
}

/**
 * Desfase de `tz` respecto de UTC en el instante dado, en milisegundos (positivo al este de Greenwich):
 * la hora de pared de ese instante, leída como si fuera UTC, menos el instante. Se calcula al segundo
 * porque las zonas históricas tienen desfases con segundos (Panamá antes de 1908).
 */
function offsetAt(instantMs: number, tz: string): number {
  const wall = wallClockAt(instantMs, tz);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return wallAsUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Convierte una hora de pared (expresada como milisegundos "UTC ficticios") al instante real de `tz`.
 *
 * Dos pasos: se toma el desfase vigente un día antes y un día después (`before`, `after`; difieren solo
 * si hay un cambio de horario cerca) y se verifica cuál de los instantes candidatos produce de vuelta
 * la misma hora de pared.
 * - Un candidato válido: caso normal (siempre en Panamá).
 * - Dos candidatos válidos: hora AMBIGUA (se repite al "retroceder" el reloj). Se elige la primera
 *   ocurrencia, el instante anterior (hora de verano), igual que `Date` y que Temporal con
 *   `disambiguation: "compatible"`.
 * - Ninguno válido: hora INEXISTENTE (se salta al "adelantar" el reloj). Se aplica el desfase de antes
 *   del cambio, de modo que la hora se corre hacia adelante lo que dura el salto (02:30 pasa a 03:30).
 */
function resolveInstant(wallAsUtcMs: number, tz: string): number {
  const before = offsetAt(wallAsUtcMs - DAY_MS, tz);
  const after = offsetAt(wallAsUtcMs + DAY_MS, tz);
  const candidates = before === after ? [wallAsUtcMs - before] : [wallAsUtcMs - before, wallAsUtcMs - after];
  const valid = candidates.filter((candidate) => offsetAt(candidate, tz) === wallAsUtcMs - candidate);
  return valid.length > 0 ? Math.min(...valid) : wallAsUtcMs - before;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `"YYYY-MM-DDTHH:mm[:ss]"` como hora de pared de `tz` → instante UTC.
 *
 * Devuelve `null` si el valor no es una cadena con exactamente ese formato, si lleva zona (`Z`, `+01:00`),
 * si el día no existe en el calendario (`2026-02-31`), si la hora, los minutos o los segundos están fuera
 * de rango (`24:00`, `10:60`) o si el año está fuera de 1900-2999. Lanza `RangeError` si `tz` no es una
 * zona válida.
 *
 * Horas dudosas en zonas con horario de verano (no ocurren en Panamá):
 * - inexistente (America/New_York, 2026-03-08T02:30): se corre hacia adelante a 03:30 (07:30Z).
 * - ambigua (America/New_York, 2026-11-01T01:30): se toma la primera ocurrencia, 01:30 EDT (05:30Z).
 */
export function parseTenantLocal(value: string, tz: string = PANAMA_TZ): Date | null {
  if (typeof value !== "string") return null;
  const match = LOCAL_DATETIME_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);

  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const wallAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(resolveInstant(wallAsUtcMs, tz));
}

/**
 * Instante → `"YYYY-MM-DDTHH:mm"` en `tz`: valor por defecto de un `<input type="datetime-local">`.
 * Trunca los segundos (no los redondea). Devuelve `""` si `date` no es una fecha válida, para que el
 * campo quede vacío en vez de romper la página. Lanza `RangeError` si `tz` no es una zona válida.
 *
 * `parseTenantLocal(toTenantLocalInput(d))` devuelve `d` sin segundos, salvo en la hora que se repite al
 * retroceder el reloj (la segunda ocurrencia se lee igual que la primera): no ocurre en Panamá.
 */
export function toTenantLocalInput(date: Date, tz: string = PANAMA_TZ): string {
  // `toString` y no `instanceof`: una fecha creada en otro contexto de ejecución sigue siendo una fecha.
  if (Object.prototype.toString.call(date) !== "[object Date]" || Number.isNaN(date.getTime())) return "";
  const wall = wallClockAt(date.getTime(), tz);
  const pad = (n: number, length = 2) => String(n).padStart(length, "0");
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

/**
 * `true` si `date` es anterior a `now - graceMs`. La tolerancia (5 minutos por defecto) evita rechazar
 * una hora escrita "ahora" mientras el usuario terminaba de llenar el formulario. `now` es inyectable
 * para pruebas deterministas. Una fecha inválida nunca es "pasada": valide con `parseTenantLocal` antes.
 */
export function isInPast(date: Date, now: Date = new Date(), graceMs: number = DEFAULT_PAST_GRACE_MS): boolean {
  return date.getTime() < now.getTime() - graceMs;
}

// ---------------------------------------------------------------------------
// Día local de la empresa
// ---------------------------------------------------------------------------
//
// Un servidor en UTC (Vercel, Docker) y uno en Panamá (el equipo de desarrollo) NO coinciden en qué día es ni en qué
// hora es: `getDay()`, `getHours()` y `setHours(0, 0, 0, 0)` leen la zona del PROCESO. Con UTC, un viaje de las 19:30 del
// lunes en Panamá (00:30Z del martes) se evaluaba como "martes 00:30" y el "hoy" de los tableros empezaba a las 19:00 del
// día anterior. Estas funciones leen siempre la zona de la empresa, indicada de forma explícita.

/** Fecha local `YYYY-MM-DD` de `date` en `tz`; `""` si la fecha no es válida. */
export function tenantLocalDate(date: Date, tz: string = PANAMA_TZ): string {
  return toTenantLocalInput(date, tz).slice(0, 10);
}

/** Hora local `HH:mm` de `date` en `tz`; `""` si la fecha no es válida. */
export function tenantLocalTime(date: Date, tz: string = PANAMA_TZ): string {
  return toTenantLocalInput(date, tz).slice(11, 16);
}

/** Día de la semana local de `date` en `tz` (0 = domingo … 6 = sábado); `null` si la fecha no es válida. */
export function tenantLocalWeekday(date: Date, tz: string = PANAMA_TZ): number | null {
  const day = tenantLocalDate(date, tz);
  return day === "" ? null : new Date(`${day}T00:00:00.000Z`).getUTCDay();
}

/**
 * Primer instante (inclusive) y primer instante del día siguiente (EXCLUSIVO) del día local que contiene `date`.
 * Úselo como `{ gte: start, lt: end }`. En una zona con horario de verano el día del cambio dura 23 o 25 horas.
 * `null` si la fecha no es válida.
 */
export function tenantDayBounds(date: Date, tz: string = PANAMA_TZ): { start: Date; end: Date } | null {
  const day = tenantLocalDate(date, tz);
  if (day === "") return null;
  const nextDay = new Date(new Date(`${day}T00:00:00.000Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
  const start = parseTenantLocal(`${day}T00:00`, tz);
  const end = parseTenantLocal(`${nextDay}T00:00`, tz);
  return start && end ? { start, end } : null;
}

/**
 * Valor para una columna `@db.Date`: la fecha local de `date` como medianoche UTC (`2026-07-13T00:00:00.000Z`).
 * Prisma guarda solo la parte de fecha, así que dos lecturas de "hoy" coinciden sin importar la zona del servidor.
 * `null` si la fecha no es válida.
 */
export function tenantCalendarDate(date: Date, tz: string = PANAMA_TZ): Date | null {
  const day = tenantLocalDate(date, tz);
  return day === "" ? null : new Date(`${day}T00:00:00.000Z`);
}

