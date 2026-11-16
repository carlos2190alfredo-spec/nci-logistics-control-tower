/**
 * Guarda de redacción (R3 §5.5): todo texto visible NUEVO de este módulo lleva ortografía española
 * completa (tildes, eñes), trato de "usted" y ninguna jerga técnica. Esta prueba recolecta TODOS los
 * textos que los módulos de catálogo e importación pueden mostrar y falla si alguno incumple la regla,
 * de modo que un texto futuro mal escrito no llegue a producción.
 */
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { parseCsv } from "@/lib/import/csv";
import { IMPORT_COLUMNS, IMPORT_KINDS, IMPORT_KIND_LABEL, IMPORT_TEMPLATES, validateImport } from "@/lib/import/catalogs";
import { describeFormFields, parseForm } from "./form";
import {
  ASSET_STATUSES,
  EQUIPMENT_TYPE_SUGGESTIONS,
  PORTAL_ROLE_OPTIONS,
  VEHICLE_TYPE_SUGGESTIONS,
  assetStatusLabel,
  loadStatusLabel,
  requestSourceLabel,
  requestSourceText,
} from "./labels";
import {
  customerInputSchema,
  customerUpdateSchema,
  equipmentInputSchema,
  equipmentUpdateSchema,
  locationInputSchema,
  newTripInputSchema,
  portalUserInputSchema,
  safeParseInput,
  serviceTypeInputSchema,
  vehicleInputSchema,
  vehicleUpdateSchema,
} from "./schemas";
import { SERVICE_TYPE_TEMPLATES } from "./service-type-templates";

// ---------------------------------------------------------------------------
// Recolección de textos
// ---------------------------------------------------------------------------

const GARBAGE: unknown[] = [undefined, null, "", "   ", 0, 5, true, {}, [], "x".repeat(5000), "-1", "NaN", "!!!"];

const SCHEMAS: z.ZodType[] = [
  customerInputSchema,
  customerUpdateSchema,
  vehicleInputSchema,
  vehicleUpdateSchema,
  equipmentInputSchema,
  equipmentUpdateSchema,
  locationInputSchema,
  serviceTypeInputSchema,
  portalUserInputSchema,
  newTripInputSchema,
];

function only(path: string, value: unknown): Record<string, unknown> {
  const segments = path.split(".");
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (const segment of segments.slice(0, -1)) {
    const next: Record<string, unknown> = {};
    cursor[segment] = next;
    cursor = next;
  }
  cursor[segments[segments.length - 1]] = value;
  return root;
}

/** Mensajes de error de todos los esquemas ante entradas vacías, absurdas y desconocidas. */
function schemaMessages(): string[] {
  const messages = new Set<string>();
  const collect = (schema: z.ZodType, input: unknown) => {
    const result = safeParseInput(schema, input);
    if (!result.success) for (const issue of result.error.issues) messages.add(issue.message);
  };
  for (const schema of SCHEMAS) {
    collect(schema, {});
    collect(schema, "texto");
    collect(schema, { campoInventado: 1 });
    for (const field of describeFormFields(schema)) for (const value of GARBAGE) collect(schema, only(field.path, value));
  }
  // Casos que solo fallan con valores concretos (rangos, pares, formatos).
  const base = { name: "Bodega" };
  collect(locationInputSchema, { ...base, latitude: "95", longitude: "0" });
  collect(locationInputSchema, { ...base, latitude: "1" });
  collect(locationInputSchema, { ...base, longitude: "1" });
  collect(locationInputSchema, { ...base, latitude: "x", longitude: "y" });
  collect(customerInputSchema, { name: "A", contactEmail: "mal", code: "###" });
  collect(equipmentInputSchema, { code: "CH/40/01" });
  collect(vehicleInputSchema, { plate: "ABC123", code: "U/12" });
  collect(vehicleInputSchema, { plate: "--" });
  collect(newTripInputSchema, { scheduledAt: "2026-02-31T10:00", priority: "X", source: "PORTAL" });
  return [...messages];
}

/** Mensajes de parseForm y del lector de CSV. */
function importAndFormMessages(): string[] {
  const messages = new Set<string>();
  const failure = parseForm(customerInputSchema, new FormData());
  if (!failure.ok) {
    messages.add(failure.message);
    Object.values(failure.fieldErrors).forEach((m) => messages.add(m));
  }
  const multi = parseForm(portalUserInputSchema, new FormData());
  if (!multi.ok) messages.add(multi.message);
  const broken = parseForm(customerInputSchema, null as unknown as FormData);
  if (!broken.ok) messages.add(broken.message);

  const csvFailures = [
    parseCsv(""),
    parseCsv("a,b\n"),
    parseCsv('a\n"sin cierre\n'),
    parseCsv("a\n" + "x".repeat(100), { maxBytes: 10 }),
    parseCsv("a\n1\n2\n3", { maxRows: 2 }),
    parseCsv("a,b,c\n1", { maxColumns: 2 }),
    parseCsv(null as unknown as string),
  ];
  for (const result of csvFailures) if (!result.ok) messages.add(result.error);

  // Tres desajustes distintos: faltan celdas, sobran celdas con datos y sobran celdas vacías.
  const warned = parseCsv(`a,b,c\n1,2\n1,2,3,4\n1,2,3,,\nPanam${String.fromCharCode(0xfffd)},1,2`);
  if (warned.ok) {
    warned.warnings.forEach((m) => messages.add(m));
    warned.rows.forEach((row) => row.warning && messages.add(row.warning));
  }

  for (const kind of IMPORT_KINDS) {
    const csv = parseCsv("Columna rara,Otra\n1,2\n");
    if (csv.ok) validateImport(kind, csv).headerIssues.forEach((m) => messages.add(m));
    const dup = parseCsv("Nombre,Cliente,Placa,Plate,Código,Code,Número\n1,2,3,4,5,6,7\n");
    if (dup.ok) validateImport(kind, dup).headerIssues.forEach((m) => messages.add(m));
  }
  // La plantilla sin tocar: sus filas de ejemplo llevan un aviso.
  for (const kind of IMPORT_KINDS) {
    const template = parseCsv(IMPORT_TEMPLATES[kind].csv);
    if (template.ok) for (const row of validateImport(kind, template).valid) row.warnings?.forEach((m) => messages.add(m));
  }
  // Columnas repetidas escritas distinto ("Código" y "Número" para la misma "Unidad").
  const sameThing = parseCsv("Placa,Unidad,Código,Número\nAB-123,1,2,3\n");
  if (sameThing.ok) validateImport("vehicles", sameThing).headerIssues.forEach((m) => messages.add(m));
  const rows = parseCsv("Nombre,Correo,Placa,Código,Latitud,Longitud\n,mal,###,***,x,\nAcme,a@b.co,ABC,E1,,\nacme,a@b.co,ABC,E1,,\n");
  if (rows.ok) {
    for (const kind of IMPORT_KINDS) {
      const result = validateImport(kind, rows);
      for (const row of result.invalid) row.errors.forEach((m) => messages.add(m));
      for (const row of result.valid) row.warnings?.forEach((m) => messages.add(m));
    }
  }
  return [...messages];
}

/** Etiquetas y textos fijos que se muestran tal cual. */
function labelStrings(): string[] {
  return [
    ...Object.values(assetStatusLabel),
    ...Object.values(requestSourceLabel),
    ...Object.values(loadStatusLabel),
    ...VEHICLE_TYPE_SUGGESTIONS,
    ...EQUIPMENT_TYPE_SUGGESTIONS,
    ...PORTAL_ROLE_OPTIONS.map((option) => option.label),
    ...SERVICE_TYPE_TEMPLATES.flatMap((t) => [t.name, t.description]),
    ...Object.values(IMPORT_KIND_LABEL),
    ...IMPORT_KINDS.flatMap((kind) => IMPORT_COLUMNS[kind].flatMap((col) => [col.label, ...col.aliases])),
    requestSourceText("PORTAL"),
    requestSourceText(""),
  ];
}

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------

/** Palabras que en español llevan tilde (o eñe) y NO deben aparecer sin ella en un texto visible. */
const ACCENTLESS = [
  "camion", "rigido", "telefono", "direccion", "codigo", "numero", "vacio", "informacion", "descripcion",
  "contrasena", "accion", "operacion", "ubicacion", "revision", "transito", "tambien", "pagina", "electronico",
  "valido", "valida", "validas", "validos", "unico", "unica", "seleccion", "aqui", "ademas", "facil", "ultimo",
  "minimo", "maximo", "limite", "dia", "dias", "mas", "panama", "colon", "identificacion", "razon", "dueno", "ano",
];
const ACCENTLESS_RE = new RegExp(`(^|[^\\p{L}])(${ACCENTLESS.join("|")})(?![\\p{L}])`, "iu");

/** Jerga y colisiones de selectores de Playwright que los textos nuevos no pueden contener (00-GENERAL §4.6). */
const FORBIDDEN_RE = /portal cliente|tenant|cat[aá]logo|\bJSON\b|\bundefined\b|\bnull\b|\bNaN\b|\bAsignar\b|\bAvanzar\b|\bEnviar\b|\bEntrar\b|\bSalir\b|Crear solicitud|Viajes activos/i;

/** Formas de tuteo: los textos nuevos tratan de "usted". */
const TUTEO_RE = /\b(escribe|selecciona|revisa|elige|indica|usa|ingresa|recarga|guarda|completa|agrega|elimina|divídelo|guárdalo|tu|tus|ti)\b/i;

describe("redacción de los textos visibles", () => {
  const messages = [...schemaMessages(), ...importAndFormMessages()];
  const labels = labelStrings();

  it("se recolectaron suficientes textos para que la guarda tenga sentido", () => {
    expect(messages.length).toBeGreaterThan(80);
    expect(labels.length).toBeGreaterThan(60);
  });

  it("todos los textos llevan tildes y eñes donde corresponde", () => {
    const offenders = [...messages, ...labels].filter((text) => ACCENTLESS_RE.test(text));
    expect(offenders).toEqual([]);
  });

  it("ningún texto usa jerga técnica ni puede chocar con un selector de las pruebas E2E", () => {
    const offenders = [...messages, ...labels].filter((text) => FORBIDDEN_RE.test(text));
    expect(offenders).toEqual([]);
  });

  it("todos los textos tratan de 'usted'", () => {
    const offenders = [...messages, ...labels].filter((text) => TUTEO_RE.test(text));
    expect(offenders).toEqual([]);
  });

  it("los mensajes son frases completas: empiezan con mayúscula y terminan en punto", () => {
    const offenders = messages.filter((text) => !/^[A-ZÁÉÍÓÚÑ¿¡«]/.test(text) || !/[.)»]$/.test(text));
    expect(offenders).toEqual([]);
  });

  it("los mensajes no tienen espacios sobrantes ni saltos de línea", () => {
    for (const text of [...messages, ...labels]) {
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/ {2,}|[\r\n\t]/);
    }
  });

  it("los mensajes no repiten el valor que escribió la persona (no reflejan entrada arbitraria)", () => {
    const result = safeParseInput(customerInputSchema, { name: "<img src=x onerror=alert(1)>", contactEmail: "<script>x</script>" });
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const issue of result.error.issues) {
        expect(issue.message).not.toContain("<");
        expect(issue.message).not.toContain("script");
      }
    }
  });

  it("los estados de activos tienen una etiqueta para cada valor", () => {
    expect(ASSET_STATUSES.map((status) => assetStatusLabel[status]).every((label) => label.length > 0)).toBe(true);
  });

  it("el contenido de las plantillas descargables también cumple la regla", () => {
    for (const kind of IMPORT_KINDS) {
      const { csv } = IMPORT_TEMPLATES[kind];
      expect(ACCENTLESS_RE.test(csv.replace(/EJEMPLO-[A-Z0-9-]+/g, "")), kind).toBe(false);
      expect(TUTEO_RE.test(csv), kind).toBe(false);
    }
  });
});
