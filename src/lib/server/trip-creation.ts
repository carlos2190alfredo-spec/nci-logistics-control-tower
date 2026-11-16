import type { Prisma, ServiceRequest, Trip } from "@/generated/prisma";
import { customerVisibleStatus } from "@/lib/domain/state-machine";

/**
 * Referencias consecutivas (`SLUG-SR-0001`, `SLUG-TR-0001`) y creación de viajes (ADR-038).
 *
 * Módulo SIN "use server": un módulo "use server" solo puede exportar funciones async y cada export suyo
 * es un endpoint público. Las acciones que lo usan (portal, conversión de solicitudes, "Nuevo viaje")
 * viven en otros archivos; aquí solo hay lógica que opera sobre el cliente de UNA transacción.
 *
 * Reglas del módulo:
 * - Solo `tx.*`; nunca `getDb()`, `audit()` ni correo. Con `connection_limit=1` (Vercel + pooler), una
 *   consulta fuera de `tx` dentro de la callback espera la única conexión, que `tx` mantiene ocupada.
 * - Concurrencia: el siguiente número se calcula por MÁXIMO del sufijo, no por `count()+1` (que se
 *   rompe si se borra o se importa una referencia no estándar) y debe calcularse con el bloqueo del
 *   tenant ya tomado (`lockTenantForCreate`). La restricción `@@unique([tenantId, reference])` sigue
 *   siendo la red de seguridad: sin bloqueo no se duplica nada, solo falla con P2002.
 *
 * Uso típico ("Nuevo viaje": solicitud `CONVERTED` + viaje `CONFIRMED` en una sola transacción). El orden es
 * parte del contrato: el bloqueo va primero y se suelta solo con el COMMIT.
 *
 *   const { request, trip } = await db.$transaction(async (tx) => {
 *     await lockTenantForCreate(tx, tenant.id);
 *     // Aquí, bajo el mismo bloqueo: assertWithinPlanLimit, comprobaciones de unicidad, etc.
 *     const reference = await nextReference(tx, { tenant, kind: "SR" });
 *     const request = await tx.serviceRequest.create({ data: { ..., reference, status: "CONVERTED" } });
 *     const trip = await createTripFromRequest(tx, { tenant, actorId: user.id, request });
 *     return { request, trip };
 *   }, { timeout: 10_000, maxWait: 5_000 });
 *   // Fuera de la transacción: audit(), notificaciones y revalidatePath().
 */

export type Tx = Prisma.TransactionClient;
export type ReferenceKind = "SR" | "TR";

/** Mayor sufijo numérico que `nextReference` entiende (9 dígitos caben en un `int` de PostgreSQL). */
const MAX_REFERENCE_NUMBER = 999_999_999;

/** Debe coincidir con la expresión regular de las consultas SQL de `readLastReferenceNumber`. */
const REFERENCE_SUFFIX_PATTERN = /^[0-9]{1,9}$/;

/** `SLUG-SR-` / `SLUG-TR-`: prefijo común de todas las referencias de una empresa y un tipo. */
export function referencePrefix(slug: string, kind: ReferenceKind): string {
  if (kind !== "SR" && kind !== "TR") throw new RangeError("El tipo de referencia debe ser SR o TR.");
  const normalized = slug.trim();
  if (normalized === "") throw new RangeError("El identificador de la empresa (slug) no puede estar vacío.");
  return `${normalized.toUpperCase()}-${kind}-`;
}

/** `SLUG-TR-0007`; relleno a 4 dígitos y, pasado el 9999, crece (`SLUG-TR-10000`) en vez de truncar. */
export function formatReference(slug: string, kind: ReferenceKind, n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError("El número de referencia debe ser un entero positivo.");
  return `${referencePrefix(slug, kind)}${String(n).padStart(4, "0")}`;
}

/**
 * Siguiente número libre según una lista de referencias existentes: MÁXIMO numérico + 1.
 *
 * Es el equivalente en memoria de la consulta SQL de `nextReference`. Ignora lo que no sea de la serie:
 * otro prefijo (`OTRA-TR-0099`), otro tipo, otra capitalización, sufijos no numéricos (`SLUG-TR-abc`,
 * `SLUG-TR-12a`), vacíos (`SLUG-TR-`) y sufijos de más de 9 dígitos. Los huecos no se reutilizan: tras
 * `0001` y `0007` el siguiente es `0008`.
 */
export function nextReferenceNumber(existing: readonly string[], prefix: string): number {
  let max = 0;
  for (const reference of existing) {
    if (!reference.startsWith(prefix)) continue;
    const suffix = reference.slice(prefix.length);
    if (!REFERENCE_SUFFIX_PATTERN.test(suffix)) continue;
    max = Math.max(max, Number(suffix));
  }
  return max + 1;
}

/**
 * Serializa a los creadores de un mismo tenant hasta el final de la transacción.
 *
 * `FOR NO KEY UPDATE` (y no `FOR UPDATE`): las inserciones en tablas hijas (`trips`, `audit_logs`…) toman
 * `FOR KEY SHARE` sobre la fila del tenant por su clave foránea; `FOR UPDATE` choca con ese bloqueo y
 * frenaría TODO el tenant, mientras que `FOR NO KEY UPDATE` solo espera a quien pida el mismo bloqueo.
 * Dos transacciones que lo toman se turnan: la segunda espera el COMMIT de la primera y entonces ve sus
 * filas (READ COMMITTED), de modo que el máximo y los conteos que lea después ya son exactos.
 *
 * Tomarlo ANTES de leer el máximo o contar, en la misma transacción, y soltarlo con el COMMIT: no hay
 * unlock. Si el tenant no existe no bloquea nada (el INSERT posterior fallaría por clave foránea).
 */
export async function lockTenantForCreate(tx: Tx, tenantId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR NO KEY UPDATE`;
}

type LastNumberRow = { last_number: number | bigint | string | null };

/**
 * Mayor sufijo numérico de las referencias `prefix` del tenant (0 si no hay ninguna).
 *
 * Dos consultas literales, una por tabla: el nombre de la tabla nunca se interpola. Los parámetros llevan
 * cast explícito para que PostgreSQL no tenga que inferirlos (`substr(text, int)` vs `substr(text, text)`).
 * Los sufijos se limitan a 1–9 dígitos para que el cast a `int` no pueda desbordarse con una referencia
 * rara (`SLUG-TR-20260101123456`) y dejar el tenant sin poder crear nunca más.
 */
async function readLastReferenceNumber(tx: Tx, kind: ReferenceKind, tenantId: string, prefix: string): Promise<number> {
  const suffixStart = prefix.length + 1; // substr() cuenta desde 1
  const rows =
    kind === "SR"
      ? await tx.$queryRaw<LastNumberRow[]>`
          SELECT COALESCE(MAX(substr(reference, ${suffixStart}::int)::int), 0)::int AS last_number
          FROM service_requests
          WHERE tenant_id = ${tenantId}::uuid
            AND starts_with(reference, ${prefix}::text)
            AND substr(reference, ${suffixStart}::int) ~ '^[0-9]{1,9}$'`
      : await tx.$queryRaw<LastNumberRow[]>`
          SELECT COALESCE(MAX(substr(reference, ${suffixStart}::int)::int), 0)::int AS last_number
          FROM trips
          WHERE tenant_id = ${tenantId}::uuid
            AND starts_with(reference, ${prefix}::text)
            AND substr(reference, ${suffixStart}::int) ~ '^[0-9]{1,9}$'`;
  const last = Number(rows?.[0]?.last_number ?? 0);
  return Number.isSafeInteger(last) && last > 0 ? last : 0;
}

/**
 * Siguiente referencia libre del tenant (`SLUG-SR-0042`, `SLUG-TR-0013`).
 *
 * NO bloquea por sí sola, para poder componerse con otras comprobaciones bajo un único bloqueo. El
 * llamador debe haber ejecutado `lockTenantForCreate(tx, tenant.id)` en ESTA transacción antes de
 * llamarla; sin él, dos creaciones simultáneas calculan el mismo número y la segunda falla con P2002.
 */
export async function nextReference(
  tx: Tx,
  input: { tenant: { id: string; slug: string }; kind: ReferenceKind },
): Promise<string> {
  const { tenant, kind } = input;
  const last = await readLastReferenceNumber(tx, kind, tenant.id, referencePrefix(tenant.slug, kind));
  if (last >= MAX_REFERENCE_NUMBER) throw new RangeError("Se agotó la numeración de referencias de la empresa.");
  return formatReference(tenant.slug, kind, last + 1);
}

export type RoutePoint = { label: string; lat: number; lng: number };

/**
 * Ruta por defecto de un viaje recién confirmado: tres puntos de demostración Colón → Las Cumbres →
 * Panamá, sin relación con el texto de origen y destino (así era hasta ahora, `confirmRequestAsTripAction`).
 * "Origen" y "Destino" son nombres de relleno: `buildDefaultRoutePoints` los reemplaza por los de la solicitud.
 */
export const DEFAULT_ROUTE_POINTS: readonly [RoutePoint, RoutePoint, RoutePoint] = [
  { label: "Origen", lat: 9.36, lng: -79.88 },
  { label: "Las Cumbres", lat: 9.09, lng: -79.54 },
  { label: "Destino", lat: 8.95, lng: -79.56 },
];

/** `routePoints` por defecto: el primer y el último punto toman el texto del origen y del destino. */
export function buildDefaultRoutePoints(origin: string, destination: string): RoutePoint[] {
  const [first, middle, last] = DEFAULT_ROUTE_POINTS;
  return [
    { ...first, label: origin },
    { ...middle },
    { ...last, label: destination },
  ];
}

/** Nota del evento inicial de un viaje convertido desde una solicitud (visible para el cliente). */
export const DEFAULT_TRIP_INITIAL_NOTE = "Solicitud confirmada y convertida en viaje.";

/** Un viaje confirmado se estima a 4 horas de su hora programada mientras no haya otra estimación. */
export const DEFAULT_TRIP_ETA_OFFSET_MS = 4 * 60 * 60 * 1000;

const MAX_POSTGRES_INT = 2_147_483_647;

export type TripStopInput = {
  type: "START" | "PICKUP" | "DELIVERY" | "RETURN" | "OTHER";
  label?: string;
  addressText: string;
  latitude?: number;
  longitude?: number;
};

export type CreateTripFromRequestInput = {
  /** Ya resuelto por `requireTenantRole`/`requireTenantPermission`; nunca viene del navegador. */
  tenant: { id: string; slug: string };
  /** Autor del evento inicial (`TripEvent.actorId`). */
  actorId: string;
  request: Pick<
    ServiceRequest,
    "id" | "customerAccountId" | "serviceTypeId" | "origin" | "destination" | "requestedDate"
  >;
  /** Por defecto: "Solicitud confirmada y convertida en viaje." Un texto vacío equivale a no indicarlo. */
  initialNote?: string;
  /** Por defecto: `request.requestedDate`. */
  scheduledAt?: Date;
  /** Por defecto: `scheduledAt` + 4 h. `null` deja el viaje sin ETA. */
  eta?: Date | null;
  /** Por defecto: el valor por defecto de la columna (3600 s). */
  expectedDurationSec?: number;
  /** Por defecto: los tres puntos de demostración (`buildDefaultRoutePoints`). */
  routePoints?: Prisma.InputJsonValue;
  /** Por defecto: ninguna parada. Se numeran desde 1 en el orden recibido. */
  stops?: TripStopInput[];
};

function assertValidStop(stop: TripStopInput, index: number): void {
  const where = `La parada ${index + 1}`;
  if (stop.addressText.trim() === "") throw new RangeError(`${where} necesita una dirección.`);
  const { latitude, longitude } = stop;
  if (latitude !== undefined && !(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90)) {
    throw new RangeError(`${where} tiene una latitud fuera de rango.`);
  }
  if (longitude !== undefined && !(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180)) {
    throw new RangeError(`${where} tiene una longitud fuera de rango.`);
  }
}

/**
 * Crea el viaje de una solicitud: estado `CONFIRMED`, texto de estado para el cliente, evento inicial
 * visible, ETA y ruta por defecto. Con los parámetros por defecto reproduce exactamente lo que hacía
 * `confirmRequestAsTripAction`, salvo la referencia, que ahora sale de `nextReference` y no de `count()+1`.
 *
 * Solo `tx.*` y con el bloqueo del tenant ya tomado por el llamador (`lockTenantForCreate`, ver
 * `nextReference`). NO modifica la solicitud: el llamador decide su estado (reclamo optimista en la
 * conversión; creada ya como `CONVERTED` en "Nuevo viaje"). Tampoco audita ni notifica: eso va después
 * del COMMIT, fuera de la transacción.
 *
 * Seguridad: la función confía en que el llamador ya verificó, contra `tenant.id`, que la solicitud, el
 * cliente y el tipo de servicio pertenecen a ESTE tenant (las claves foráneas de Prisma solo apuntan a
 * `id`: un UUID de otro tenant pasaría). El `Pick` de la solicitud no lleva `tenantId` para no inducir a
 * pensar que aquí se revalida.
 */
export async function createTripFromRequest(tx: Tx, input: CreateTripFromRequestInput): Promise<Trip> {
  const { tenant, actorId, request } = input;

  const scheduledAt = input.scheduledAt ?? request.requestedDate;
  if (Number.isNaN(scheduledAt.getTime())) throw new RangeError("La fecha programada del viaje no es válida.");
  const eta = input.eta === undefined ? new Date(scheduledAt.getTime() + DEFAULT_TRIP_ETA_OFFSET_MS) : input.eta;
  if (eta !== null && Number.isNaN(eta.getTime())) throw new RangeError("La hora estimada de llegada no es válida.");

  const { expectedDurationSec } = input;
  if (
    expectedDurationSec !== undefined &&
    !(Number.isSafeInteger(expectedDurationSec) && expectedDurationSec > 0 && expectedDurationSec <= MAX_POSTGRES_INT)
  ) {
    throw new RangeError("La duración esperada del viaje debe ser un número entero de segundos mayor que cero.");
  }

  const stops = input.stops ?? [];
  stops.forEach(assertValidStop);

  const initialNote = input.initialNote?.trim() ? input.initialNote : DEFAULT_TRIP_INITIAL_NOTE;
  const reference = await nextReference(tx, { tenant, kind: "TR" });

  return tx.trip.create({
    data: {
      tenantId: tenant.id,
      customerAccountId: request.customerAccountId,
      serviceRequestId: request.id,
      serviceTypeId: request.serviceTypeId,
      reference,
      status: "CONFIRMED",
      origin: request.origin,
      destination: request.destination,
      scheduledAt,
      eta,
      ...(expectedDurationSec === undefined ? {} : { expectedDuration: expectedDurationSec }),
      routePoints: input.routePoints ?? buildDefaultRoutePoints(request.origin, request.destination),
      customerVisibleStatus: customerVisibleStatus.CONFIRMED,
      ...(stops.length === 0
        ? {}
        : {
            stops: {
              create: stops.map((stop, index) => ({
                tenantId: tenant.id,
                type: stop.type,
                sequence: index + 1,
                label: stop.label,
                addressText: stop.addressText,
                latitude: stop.latitude,
                longitude: stop.longitude,
              })),
            },
          }),
      events: {
        create: {
          tenantId: tenant.id,
          actorId,
          toStatus: "CONFIRMED",
          note: initialNote,
          visibleToCustomer: true,
        },
      },
    },
  });
}
