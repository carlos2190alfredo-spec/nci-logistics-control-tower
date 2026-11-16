/**
 * Esquemas de validación de los catálogos y del "Nuevo viaje" (Zod 4, mensajes en español).
 *
 * Módulo puro: el MISMO código valida en el servidor (acciones) y en el navegador (vista previa del
 * CSV). Reglas comunes:
 *
 *  - Todo es `strict`: un campo desconocido es un error (evita la asignación masiva). Los formularios
 *    pasan por `parseForm`, que solo entrega las claves del esquema (los campos internos `$ACTION_*`
 *    que añade Next no cuentan).
 *  - Cada campo normaliza ANTES de validar (recorta, colapsa espacios, mayúsculas en placas y códigos,
 *    minúsculas en correos) y la salida ya viene normalizada: lo que se valida es lo que se guarda.
 *  - Cada fallo produce UN mensaje que nombra el campo ("Escriba el nombre del cliente."), de modo que
 *    el resumen de `parseForm` y los errores por campo del formulario se entienden solos.
 *  - Los campos opcionales de texto salen como `string | null` (listos para columnas `String?`; `null`
 *    borra el valor al editar). El código opcional sale como `string | undefined` ("generarlo").
 *  - Ningún mensaje usa jerga técnica ("tenant", "catálogo"); el tratamiento es de "usted".
 *
 * `customerInputSchema.code` solo lo envía la importación CSV: el formulario no lo muestra. El código es
 * inmutable tras crear (igual que el de vehículo y el de equipo; la placa solo cambia por el renombrado
 * de la sección S2), por eso la EDICIÓN usa `customerUpdateSchema`, `vehicleUpdateSchema` y
 * `equipmentUpdateSchema`: esquemas sin `code`, de modo que un código enviado a mano ni se lee.
 *
 *  - Los códigos (`code`) rechazan los símbolos que se borrarían (`CH/40/01`, `EQ#5`) en lugar de guardar
 *    en silencio otro código distinto; mayúsculas, tildes y espacios sí se normalizan.
 *  - Los identificadores (uuid) salen en minúsculas: una sola forma canónica para comparar y deduplicar.
 */

import { z } from "zod";
import { FIELD_LIMITS, type LengthRange } from "./limits";
import {
  DEFAULT_EQUIPMENT_TYPE,
  DEFAULT_VEHICLE_TYPE,
  LOAD_STATUSES,
  PORTAL_ROLES,
  REQUEST_SOURCES,
  TRIP_PRIORITIES,
} from "./labels";
import {
  hasUnsupportedCodeChars,
  normalizeCodeFull,
  normalizeEmail,
  normalizeMultiline,
  normalizePlate,
  normalizeText,
  unifyDashes,
} from "./normalize";

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

/** Sujeto gramatical de un mensaje: incluye el artículo ("el nombre del cliente", "las notas"). */
type Subject = { readonly label: string; readonly plural?: boolean };

const subject = (label: string, plural = false): Subject => ({ label, plural });
const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const msg = {
  ask: (s: Subject) => `Escriba ${s.label}.`,
  choose: (s: Subject) => `Seleccione ${s.label}.`,
  notInList: (s: Subject) => `Elija una opción válida para ${s.label}.`,
  review: (s: Subject) => `Revise ${s.label}.`,
  // Solo los sujetos en singular tienen mínimo de longitud (las notas, en plural, son opcionales).
  tooShort: (s: Subject, min: number) => `${capitalize(s.label)} debe tener al menos ${min} caracteres.`,
  tooLong: (s: Subject, max: number) =>
    `${capitalize(s.label)} ${s.plural ? "no pueden" : "no puede"} superar ${max} caracteres.`,
  codeChars: (s: Subject) =>
    `${capitalize(s.label)} ${s.plural ? "solo pueden" : "solo puede"} tener letras, números, punto, guion y guion bajo.`,
};

/** Función `error` de `z.string()`: "falta" si no llegó nada; "revise" si llegó algo que no es texto. */
const missingOrWrongType =
  (s: Subject, ask: (s: Subject) => string = msg.ask) =>
  (issue: { input?: unknown }): string =>
    issue.input == null ? ask(s) : msg.review(s);

/** Contexto mínimo de `superRefine` que usan estas funciones (compatible con el real de Zod). */
type IssueSink = { addIssue: (issue: { code: "custom"; message: string }) => void };

/**
 * Mensajes de reserva en español para cualquier validación sin mensaje propio. Se pasa en cada
 * `safeParse` (nunca se toca la configuración global de Zod, que afectaría al resto de la aplicación).
 */
const SPANISH_ISSUES = z.locales.es().localeError;

/** `schema.safeParse` con mensajes de reserva en español. Úsela en lugar de `safeParse` directo. */
export function safeParseInput<S extends z.ZodType>(schema: S, data: unknown) {
  return schema.safeParse(data, { error: SPANISH_ISSUES });
}

function strictShape<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape, {
    error: (issue) => {
      if (issue.code === "unrecognized_keys") return "El formulario incluye campos que no se permiten.";
      if (issue.code === "invalid_type") return "No se recibieron los datos del formulario.";
      return undefined;
    },
  });
}

// ---------------------------------------------------------------------------
// Constructores de campos
// ---------------------------------------------------------------------------

/** Texto obligatorio de una línea (o multilínea con otro normalizador). Salida: `string` normalizado. */
function requiredText(
  s: Subject,
  range: LengthRange,
  normalizer: (value: string) => string = normalizeText,
) {
  return z
    .string({ error: missingOrWrongType(s) })
    .transform((value) => normalizer(value))
    .superRefine((value, ctx) => {
      if (value === "") ctx.addIssue({ code: "custom", message: msg.ask(s) });
      else if (value.length < range.min) ctx.addIssue({ code: "custom", message: msg.tooShort(s, range.min) });
      else if (value.length > range.max) ctx.addIssue({ code: "custom", message: msg.tooLong(s, range.max) });
    });
}

/** Texto opcional: vacío → `null`. Salida: `string | null`. */
function optionalText(s: Subject, max: number, normalizer: (value: string) => string = normalizeText) {
  return z
    .string({ error: () => msg.review(s) })
    .nullish()
    .transform((value): string | null => {
      if (value == null) return null;
      const text = normalizer(value);
      return text === "" ? null : text;
    })
    .superRefine((value, ctx) => {
      if (value !== null && value.length > max) ctx.addIssue({ code: "custom", message: msg.tooLong(s, max) });
    });
}

/** Texto opcional con valor por defecto cuando se deja en blanco. Salida: `string`. */
function textWithDefault(s: Subject, max: number, fallback: string) {
  return optionalText(s, max).transform((value) => value ?? fallback);
}

const EMAIL_CHECK = z.email();

function checkEmail(value: string, s: Subject, max: number, ctx: IssueSink): void {
  if (value.length > max) ctx.addIssue({ code: "custom", message: msg.tooLong(s, max) });
  else if (!EMAIL_CHECK.safeParse(value).success) {
    ctx.addIssue({
      code: "custom",
      message: `Escriba ${s.label} con un formato válido, por ejemplo nombre@empresa.com.`,
    });
  }
}

/** Correo obligatorio. Salida: minúsculas, `string`. */
function requiredEmail(s: Subject, max: number) {
  return z
    .string({ error: missingOrWrongType(s) })
    .transform((value) => normalizeEmail(value))
    .superRefine((value, ctx) => {
      if (value === "") ctx.addIssue({ code: "custom", message: msg.ask(s) });
      else checkEmail(value, s, max, ctx);
    });
}

/** Correo opcional: vacío → `null`. Salida: minúsculas, `string | null`. */
function optionalEmail(s: Subject, max: number) {
  return z
    .string({ error: () => msg.review(s) })
    .nullish()
    .transform((value): string | null => {
      const email = normalizeEmail(value);
      return email === "" ? null : email;
    })
    .superRefine((value, ctx) => {
      if (value !== null) checkEmail(value, s, max, ctx);
    });
}

function checkCode(raw: string, s: Subject, range: LengthRange, ctx: IssueSink): void {
  // Un símbolo que la normalización borraría ("CH/40/01" → "CH4001") cambiaría en silencio de qué código se
  // trata, y el código es inmutable y enlaza documentos por texto: se rechaza en lugar de "arreglarlo".
  if (hasUnsupportedCodeChars(raw)) {
    ctx.addIssue({ code: "custom", message: msg.codeChars(s) });
    return;
  }
  const code = normalizeCodeFull(raw);
  if (code === "") ctx.addIssue({ code: "custom", message: msg.codeChars(s) });
  else if (code.length < range.min) ctx.addIssue({ code: "custom", message: msg.tooShort(s, range.min) });
  else if (code.length > range.max) ctx.addIssue({ code: "custom", message: msg.tooLong(s, range.max) });
}

/** Código obligatorio (`normalizeCodeFull`: se rechaza lo demasiado largo, no se trunca en silencio). */
function requiredCode(s: Subject, range: LengthRange) {
  return z
    .string({ error: missingOrWrongType(s) })
    .transform((value) => normalizeText(value))
    .superRefine((raw, ctx) => {
      if (raw === "") ctx.addIssue({ code: "custom", message: msg.ask(s) });
      else checkCode(raw, s, range, ctx);
    })
    .transform((raw) => normalizeCodeFull(raw));
}

/** Código opcional: vacío → `undefined` (la acción lo genera o lo toma de otro campo). */
function optionalCode(s: Subject, range: LengthRange) {
  return z
    .string({ error: () => msg.review(s) })
    .nullish()
    .transform((value) => normalizeText(value))
    .superRefine((raw, ctx) => {
      if (raw !== "") checkCode(raw, s, range, ctx);
    })
    .transform((raw): string | undefined => (raw === "" ? undefined : normalizeCodeFull(raw)));
}

/** Identificador (uuid estricto RFC) de un elemento elegido en una lista desplegable. */
const UUID_CHECK = z.uuid();

/**
 * Salida en minúsculas (forma canónica): PostgreSQL acepta un UUID en mayúsculas, pero una comparación de
 * texto en la acción (`ids.has(id)`) o la clave de idempotencia (`clientRequestKey`, única por empresa como
 * TEXTO) tratarían `ABC…` y `abc…` como identificadores distintos.
 */
function uuidField(s: Subject, messages?: { missing: string; invalid: string }) {
  const missing = messages?.missing ?? msg.choose(s);
  const invalid = messages?.invalid ?? msg.notInList(s);
  return z
    .string({ error: (issue) => (issue.input == null ? missing : invalid) })
    .transform((value) => normalizeText(value))
    .superRefine((value, ctx) => {
      if (value === "") ctx.addIssue({ code: "custom", message: missing });
      else if (!UUID_CHECK.safeParse(value).success) ctx.addIssue({ code: "custom", message: invalid });
    })
    .transform((value) => value.toLowerCase());
}

/** Devuelve el valor permitido, `""` si vino vacío o `null` si no está en la lista. */
function matchChoice<const T extends readonly string[]>(values: T, raw: string | null | undefined): T[number] | "" | null {
  const text = normalizeText(raw).toUpperCase();
  if (text === "") return "";
  return values.find((value) => value === text) ?? null;
}

/** Elección obligatoria entre valores fijos. */
function requiredChoice<const T extends readonly [string, ...string[]]>(s: Subject, values: T) {
  return z
    .string({ error: missingOrWrongType(s, msg.choose) })
    .transform((raw, ctx): T[number] => {
      const hit = matchChoice(values, raw);
      if (hit === "") {
        ctx.addIssue({ code: "custom", message: msg.choose(s) });
        return z.NEVER;
      }
      if (hit === null) {
        ctx.addIssue({ code: "custom", message: msg.notInList(s) });
        return z.NEVER;
      }
      return hit;
    });
}

/** Elección entre valores fijos con valor por defecto si se deja vacía. */
function choiceWithDefault<const T extends readonly [string, ...string[]]>(s: Subject, values: T, fallback: T[number]) {
  return z
    .string({ error: () => msg.review(s) })
    .nullish()
    .transform((raw, ctx): T[number] => {
      const hit = matchChoice(values, raw);
      if (hit === "") return fallback;
      if (hit === null) {
        ctx.addIssue({ code: "custom", message: msg.notInList(s) });
        return z.NEVER;
      }
      return hit;
    });
}

/** Elección opcional entre valores fijos: vacía → `null`. */
function optionalChoice<const T extends readonly [string, ...string[]]>(s: Subject, values: T) {
  return z
    .string({ error: () => msg.review(s) })
    .nullish()
    .transform((raw, ctx): T[number] | null => {
      const hit = matchChoice(values, raw);
      if (hit === "") return null;
      if (hit === null) {
        ctx.addIssue({ code: "custom", message: msg.notInList(s) });
        return z.NEVER;
      }
      return hit;
    });
}

// ---------------------------------------------------------------------------
// Coordenadas y fecha local
// ---------------------------------------------------------------------------

/**
 * Interpreta una coordenada escrita por una persona. Acepta coma o punto decimal (Excel en español
 * escribe "8,9824"), signo "+"/"-" (también el signo menos tipográfico) y nada más: sin grados, sin
 * letras N/S/E/O, sin notación científica. Devuelve el número, `"empty"` si está vacía o `"invalid"`.
 */
export function parseCoordinate(raw: string | number): number | "empty" | "invalid" {
  if (typeof raw === "number") return Number.isFinite(raw) ? (Object.is(raw, -0) ? 0 : raw) : "invalid";
  const text = unifyDashes(normalizeText(raw));
  if (text === "") return "empty";
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(text)) return "invalid";
  const value = Number(text.replace(",", "."));
  return Object.is(value, -0) ? 0 : value;
}

function coordinateField(s: Subject, min: number, max: number, example: string) {
  return z
    .unknown()
    .transform((raw, ctx): number | null => {
      if (raw == null) return null;
      if (typeof raw !== "string" && typeof raw !== "number") {
        ctx.addIssue({ code: "custom", message: msg.review(s) });
        return z.NEVER;
      }
      const value = parseCoordinate(raw);
      if (value === "empty") return null;
      if (value === "invalid") {
        ctx.addIssue({
          code: "custom",
          message: `Escriba ${s.label} como un número con decimales, por ejemplo ${example}.`,
        });
        return z.NEVER;
      }
      if (value < min || value > max) {
        ctx.addIssue({
          code: "custom",
          message: `${capitalize(s.label)} debe estar entre ${min} y ${max}.`,
        });
        return z.NEVER;
      }
      return value;
    });
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * `true` si `value` es un `datetime-local` con forma `YYYY-MM-DDTHH:mm[:ss]` y calendario real
 * (rechaza `2026-02-31`, la hora 24 y los años fuera de 2000-2100). Solo valida el texto: convertirlo
 * a un instante (hora de Panamá) es trabajo de `parseTenantLocal` en `src/lib/datetime.ts`.
 */
export function isValidLocalDateTime(value: string): boolean {
  const match = LOCAL_DATETIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  // Día 0 del mes siguiente = último día de `month` (calculado en UTC: no depende de la zona del proceso).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  return hour <= 23 && minute <= 59 && second <= 59;
}

function localDateTimeField(s: Subject) {
  const missing = `Indique ${s.label}.`;
  const invalid = `${capitalize(s.label)} no es válida. Elija una fecha y una hora existentes.`;
  return z
    .string({ error: (issue) => (issue.input == null ? missing : invalid) })
    .transform((value) => normalizeText(value))
    .superRefine((value, ctx) => {
      if (value === "") ctx.addIssue({ code: "custom", message: missing });
      else if (!isValidLocalDateTime(value)) ctx.addIssue({ code: "custom", message: invalid });
    });
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

const customerLimits = FIELD_LIMITS.customer;

/** Campos que se pueden escribir tanto al crear como al editar un cliente (todo menos el código). */
const customerFields = () => ({
  name: requiredText(subject("el nombre del cliente"), customerLimits.name),
  taxId: optionalText(subject("el RUC o identificación fiscal"), customerLimits.taxId.max),
  contactName: optionalText(subject("el nombre de contacto"), customerLimits.contactName.max),
  contactEmail: optionalEmail(subject("el correo de contacto"), customerLimits.contactEmail.max),
  contactPhone: optionalText(subject("el teléfono de contacto"), customerLimits.contactPhone.max),
  address: optionalText(subject("la dirección"), customerLimits.address.max),
  internalNotes: optionalText(
    subject("las notas internas", true),
    customerLimits.internalNotes.max,
    normalizeMultiline,
  ),
});

export const customerInputSchema = strictShape({
  ...customerFields(),
  /** Solo la importación CSV puede indicarlo; vacío → la acción genera `CLI-0001`, `CLI-0002`… */
  code: optionalCode(subject("el código del cliente"), customerLimits.code),
});
export type CustomerInput = z.output<typeof customerInputSchema>;

/**
 * Edición de un cliente: los mismos campos que el alta SIN `code`, que es inmutable tras crear. Úsela en
 * `updateCustomerAction` en lugar de `customerInputSchema`: así un `code` enviado a mano al formulario de
 * edición ni siquiera se lee (`parseForm` solo lee las claves del esquema) y nunca llega a la acción.
 */
export const customerUpdateSchema = strictShape(customerFields());
export type CustomerUpdateInput = z.output<typeof customerUpdateSchema>;

// ---------------------------------------------------------------------------
// Flota: vehículos y equipos
// ---------------------------------------------------------------------------

const PLATE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function plateField() {
  const s = subject("la placa del vehículo");
  const range = FIELD_LIMITS.vehicle.plate;
  return z
    .string({ error: missingOrWrongType(s) })
    .transform((value) => normalizePlate(value))
    .superRefine((plate, ctx) => {
      if (plate === "") ctx.addIssue({ code: "custom", message: msg.ask(s) });
      else if (plate.length > range.max) ctx.addIssue({ code: "custom", message: msg.tooLong(s, range.max) });
      else if (!PLATE_PATTERN.test(plate)) {
        ctx.addIssue({
          code: "custom",
          message: `${capitalize(s.label)} solo puede tener letras, números y guiones (por ejemplo, ABC-123).`,
        });
      } else if (plate.length < range.min) ctx.addIssue({ code: "custom", message: msg.tooShort(s, range.min) });
    });
}

const vehicleTypeField = () =>
  textWithDefault(subject("el tipo de vehículo"), FIELD_LIMITS.vehicle.type.max, DEFAULT_VEHICLE_TYPE);

export const vehicleInputSchema = strictShape({
  plate: plateField(),
  /** Opcional: por defecto es la placa. */
  code: optionalCode(subject("el código del vehículo"), FIELD_LIMITS.vehicle.code),
  type: vehicleTypeField(),
}).transform((value) => ({ plate: value.plate, code: value.code ?? value.plate, type: value.type }));
export type VehicleInput = z.output<typeof vehicleInputSchema>;

/**
 * Edición de un vehículo: placa y tipo. SIN `code`: el código de unidad es inmutable (cumplimiento y
 * mantenimiento enlazan por texto) y, con `vehicleInputSchema`, un código ausente se convertiría en la
 * placa NUEVA, con lo que un renombrado de placa reescribiría también el código.
 */
export const vehicleUpdateSchema = strictShape({
  plate: plateField(),
  type: vehicleTypeField(),
});
export type VehicleUpdateInput = z.output<typeof vehicleUpdateSchema>;

const equipmentTypeField = () =>
  textWithDefault(subject("el tipo de equipo"), FIELD_LIMITS.equipment.type.max, DEFAULT_EQUIPMENT_TYPE);

export const equipmentInputSchema = strictShape({
  code: requiredCode(subject("el código del equipo"), FIELD_LIMITS.equipment.code),
  type: equipmentTypeField(),
});
export type EquipmentInput = z.output<typeof equipmentInputSchema>;

/** Edición de un equipo: solo el tipo (el código es inmutable). */
export const equipmentUpdateSchema = strictShape({ type: equipmentTypeField() });
export type EquipmentUpdateInput = z.output<typeof equipmentUpdateSchema>;

// ---------------------------------------------------------------------------
// Lugares
// ---------------------------------------------------------------------------

export const locationInputSchema = strictShape({
  name: requiredText(subject("el nombre del lugar"), FIELD_LIMITS.location.name),
  /** La columna es obligatoria en la base de datos: sin dirección se guarda `""`. */
  address: optionalText(subject("la dirección"), FIELD_LIMITS.location.address.max).transform(
    (value) => value ?? "",
  ),
  latitude: coordinateField(subject("la latitud"), -90, 90, "8.9824"),
  longitude: coordinateField(subject("la longitud"), -180, 180, "-79.5199"),
}).superRefine((value, ctx) => {
  // Un punto sin la otra mitad no ubica nada en el mapa: o ambas coordenadas o ninguna.
  const hasLatitude = value.latitude !== null;
  const hasLongitude = value.longitude !== null;
  if (hasLatitude && !hasLongitude) {
    ctx.addIssue({
      code: "custom",
      path: ["longitude"],
      message: "Indique también la longitud, porque con la latitud sola no se puede ubicar el lugar.",
    });
  } else if (!hasLatitude && hasLongitude) {
    ctx.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "Indique también la latitud, porque con la longitud sola no se puede ubicar el lugar.",
    });
  }
});
export type LocationInput = z.output<typeof locationInputSchema>;

// ---------------------------------------------------------------------------
// Tipos de servicio
// ---------------------------------------------------------------------------

export const serviceTypeInputSchema = strictShape({
  name: requiredText(subject("el nombre del servicio"), FIELD_LIMITS.serviceType.name),
  /** Casilla: sin marcar = `false`. Por omisión (otros llamadores) es `true`, como la columna. */
  requiresEquipment: z.boolean({ error: "Indique si el servicio requiere un equipo." }).default(true),
});
export type ServiceTypeInput = z.output<typeof serviceTypeInputSchema>;

// ---------------------------------------------------------------------------
// Usuarios del portal de un cliente
// ---------------------------------------------------------------------------

export const portalUserInputSchema = strictShape({
  customerAccountId: uuidField(subject("el cliente")),
  name: requiredText(subject("el nombre de la persona"), FIELD_LIMITS.portalUser.name),
  email: requiredEmail(subject("el correo electrónico"), FIELD_LIMITS.portalUser.email.max),
  role: requiredChoice(subject("el tipo de acceso"), PORTAL_ROLES),
});
export type PortalUserInput = z.output<typeof portalUserInputSchema>;

// ---------------------------------------------------------------------------
// Nuevo viaje
// ---------------------------------------------------------------------------

const containerLimits = FIELD_LIMITS.trip.container;

const containerSchema = strictShape({
  number: optionalText(subject("el número de contenedor"), containerLimits.number.max, normalizePlate),
  size: optionalText(subject("el tamaño del contenedor"), containerLimits.size.max),
  type: optionalText(subject("el tipo de contenedor"), containerLimits.type.max),
  shippingLine: optionalText(subject("la naviera"), containerLimits.shippingLine.max),
  terminal: optionalText(subject("la terminal"), containerLimits.terminal.max),
  sealNumber: optionalText(subject("el número de sello"), containerLimits.sealNumber.max),
  loadStatus: optionalChoice(subject("el estado de carga"), LOAD_STATUSES),
  emptyReturnRequired: z.boolean({ error: "Indique si se requiere devolver el contenedor vacío." }).optional(),
  bookingReference: optionalText(subject("la referencia de booking"), containerLimits.bookingReference.max),
}).optional();

/** Datos de contenedor ya depurados: solo las claves con valor; `emptyReturnRequired` siempre es booleano. */
export type NewTripContainer = {
  number?: string;
  size?: string;
  type?: string;
  shippingLine?: string;
  terminal?: string;
  sealNumber?: string;
  loadStatus?: (typeof LOAD_STATUSES)[number];
  emptyReturnRequired: boolean;
  bookingReference?: string;
};

type RawContainer = NonNullable<z.output<typeof containerSchema>>;

const CONTAINER_TEXT_KEYS = ["number", "size", "type", "shippingLine", "terminal", "sealNumber", "bookingReference"] as const;

/**
 * Descarta el bloque de contenedor si no trae nada útil (la casilla "devolver vacío" sin marcar no
 * cuenta como dato): un servicio que no es de contenedor no debe guardar un contenedor vacío.
 */
function cleanContainer(raw: RawContainer | undefined): NewTripContainer | undefined {
  if (!raw) return undefined;
  const container: NewTripContainer = { emptyReturnRequired: raw.emptyReturnRequired === true };
  let hasContent = container.emptyReturnRequired;
  for (const key of CONTAINER_TEXT_KEYS) {
    const value = raw[key];
    if (value != null) {
      container[key] = value;
      hasContent = true;
    }
  }
  if (raw.loadStatus != null) {
    container.loadStatus = raw.loadStatus;
    hasContent = true;
  }
  return hasContent ? container : undefined;
}

export const newTripInputSchema = strictShape({
  customerAccountId: uuidField(subject("el cliente")),
  serviceTypeId: uuidField(subject("el tipo de servicio")),
  origin: requiredText(subject("el origen del viaje"), FIELD_LIMITS.trip.origin),
  destination: requiredText(subject("el destino del viaje"), FIELD_LIMITS.trip.destination),
  /** `datetime-local` (hora de pared de Panamá). Aquí solo se valida el texto; el instante lo calcula el servidor. */
  scheduledAt: localDateTimeField(subject("la fecha y hora del servicio")),
  priority: choiceWithDefault(subject("la prioridad"), TRIP_PRIORITIES, "NORMAL"),
  contactName: optionalText(subject("el nombre de contacto"), FIELD_LIMITS.trip.contactName.max),
  contactPhone: optionalText(subject("el teléfono de contacto"), FIELD_LIMITS.trip.contactPhone.max),
  source: choiceWithDefault(subject("el canal de la solicitud"), REQUEST_SOURCES, "OPERATIONS"),
  notes: optionalText(subject("las notas", true), FIELD_LIMITS.trip.notes.max, normalizeMultiline),
  /** Clave de idempotencia generada al mostrar el formulario (un doble clic no crea dos viajes). */
  clientRequestKey: uuidField(subject("el formulario"), {
    missing: "El formulario venció. Recargue la página e inténtelo de nuevo.",
    invalid: "El formulario venció. Recargue la página e inténtelo de nuevo.",
  }),
  container: containerSchema,
}).transform((value) => ({ ...value, container: cleanContainer(value.container) }));
export type NewTripInput = z.output<typeof newTripInputSchema>;

/**
 * `cargoDetails` de la solicitud con la MISMA forma que escribe el portal de clientes
 * (`createServiceRequestAction`): `{ contact: { name, phone }, container?: { … } }`. Úsela al crear
 * el viaje desde operaciones para que ambas vías guarden los mismos datos.
 *
 * Solo lleva los campos que la persona escribió: un contacto en blanco no se guarda como `null` ni como
 * cadena vacía, simplemente no existe (`contact` siempre existe, aunque sea `{}`, para que quien lo lea
 * pueda escribir `cargoDetails.contact.name` sin comprobar nada). Nunca incluye datos de demostración.
 */
export type CargoDetails = {
  contact: { name?: string; phone?: string };
  container?: NewTripContainer;
};

export function buildCargoDetails(input: Pick<NewTripInput, "contactName" | "contactPhone" | "container">): CargoDetails {
  const contact: CargoDetails["contact"] = {};
  if (input.contactName != null) contact.name = input.contactName;
  if (input.contactPhone != null) contact.phone = input.contactPhone;
  const details: CargoDetails = { contact };
  if (input.container) details.container = { ...input.container };
  return details;
}
