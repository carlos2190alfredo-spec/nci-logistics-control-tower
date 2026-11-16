import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Si algo de este modulo llegara a usar `getDb()` (otra conexion distinta de la transaccion), con
// `connection_limit=1` quedaria esperando una conexion que la propia transaccion mantiene ocupada.
vi.mock("@/lib/server/db", () => ({
  getDb: () => {
    throw new Error("getDb() no debe usarse dentro de la transaccion");
  },
}));

import {
  DEFAULT_ROUTE_POINTS,
  DEFAULT_TRIP_ETA_OFFSET_MS,
  DEFAULT_TRIP_INITIAL_NOTE,
  buildDefaultRoutePoints,
  createTripFromRequest,
  formatReference,
  lockTenantForCreate,
  nextReference,
  nextReferenceNumber,
  referencePrefix,
  type CreateTripFromRequestInput,
  type Tx,
} from "./trip-creation";

const TENANT = { id: "11111111-1111-4111-8111-111111111111", slug: "acme" };
const HOUR = 60 * 60 * 1000;

type LastNumbers = { trips?: unknown; serviceRequests?: unknown };

/** Lo que `createTripFromRequest` le pasa a `tx.trip.create` (solo los campos que revisan las pruebas). */
type CreatedTripData = {
  tenantId: string;
  reference: string;
  scheduledAt: Date;
  eta: Date | null;
  routePoints: unknown;
  expectedDuration?: number;
  events: {
    create: { tenantId: string; actorId: string; toStatus: string; note: string; visibleToCustomer: boolean };
  };
  stops?: { create: Array<{ tenantId: string }> };
};

/** `tx` falso: registra el orden de las operaciones y simula el resultado de la consulta del maximo. */
function fakeTx(last: LastNumbers = {}) {
  const calls: string[] = [];
  const rows = (value: unknown) => (value === undefined ? [{ last_number: 0 }] : value);
  const raw = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("FOR NO KEY UPDATE")) {
        calls.push("lock");
        return [{ id: TENANT.id }];
      }
      if (sql.includes("FROM trips")) {
        calls.push("read:trips");
        return rows(last.trips);
      }
      if (sql.includes("FROM service_requests")) {
        calls.push("read:service_requests");
        return rows(last.serviceRequests);
      }
      throw new Error(`SQL inesperado: ${sql}`);
    }),
    trip: {
      create: vi.fn(async ({ data }: { data: CreatedTripData }) => {
        calls.push("create");
        return { id: "trip-1", ...data };
      }),
    },
  };
  return { tx: raw as unknown as Tx, raw, calls };
}

const lastNumber = (n: unknown) => [{ last_number: n }];

const request: CreateTripFromRequestInput["request"] = {
  id: "sr-1",
  customerAccountId: "cust-1",
  serviceTypeId: "svc-1",
  origin: "Manzanillo International Terminal",
  destination: "Puerto de Balboa",
  requestedDate: new Date("2026-12-01T15:00:00.000Z"),
};

const baseInput: CreateTripFromRequestInput = { tenant: TENANT, actorId: "user-1", request };

describe("referencePrefix y formatReference", () => {
  it("arma SLUG-KIND- en mayusculas", () => {
    expect(referencePrefix("panatruck", "TR")).toBe("PANATRUCK-TR-");
    expect(referencePrefix("acme-norte", "SR")).toBe("ACME-NORTE-SR-");
    expect(referencePrefix("  acme  ", "TR")).toBe("ACME-TR-");
  });

  it("un slug vacio o un tipo desconocido es un error de programacion", () => {
    expect(() => referencePrefix("", "TR")).toThrow(RangeError);
    expect(() => referencePrefix("   ", "SR")).toThrow(RangeError);
    expect(() => referencePrefix("acme", "XX" as never)).toThrow(RangeError);
  });

  it.each([
    [1, "ACME-SR-0001"],
    [42, "ACME-SR-0042"],
    [9999, "ACME-SR-9999"],
    [10000, "ACME-SR-10000"], // crece, no trunca
    [123456, "ACME-SR-123456"],
  ])("formatReference(%i) = %s", (n, expected) => {
    expect(formatReference("acme", "SR", n)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])("rechaza el numero %s", (n) => {
    expect(() => formatReference("acme", "TR", n)).toThrow(RangeError);
  });
});

describe("nextReferenceNumber (MAXIMO numerico + 1, no la cantidad de filas)", () => {
  const prefix = "ACME-TR-";

  it("sin referencias empieza en 1", () => {
    expect(nextReferenceNumber([], prefix)).toBe(1);
  });

  it("los huecos no se reutilizan", () => {
    expect(nextReferenceNumber(["ACME-TR-0001", "ACME-TR-0002", "ACME-TR-0007"], prefix)).toBe(8);
  });

  it("tras borrar, el contador NO baja (count()+1 fallaba aqui: 1 fila => 2, pero la 0013 ya existe)", () => {
    expect(nextReferenceNumber(["ACME-TR-0013"], prefix)).toBe(14);
  });

  it("compara como numero, no como texto ('9999' > '10000' en orden lexico)", () => {
    expect(nextReferenceNumber(["ACME-TR-9999", "ACME-TR-10000"], prefix)).toBe(10001);
    expect(nextReferenceNumber(["ACME-TR-10000", "ACME-TR-9999"], prefix)).toBe(10001);
  });

  it("ignora lo que no es de la serie: otro prefijo, otro tipo, otra capitalizacion y sufijos raros", () => {
    const noise = [
      "ACME-TR-abc",
      "ACME-TR-",
      "ACME-TR-12a",
      "ACME-TR--5",
      "ACME-TR-1e3",
      "ACME-TR-1.5",
      "ACME-TR- 500",
      "ACME-TR-500 ",
      " ACME-TR-500",
      "OTHER-TR-0099",
      "ACME-SR-0100",
      "acme-tr-0500",
      "ACME-TRIP-0900",
      "E2E-TR-777",
      "TRIP-DEMO-001",
      "ACME-TR",
    ];
    expect(nextReferenceNumber([...noise, "ACME-TR-0005"], prefix)).toBe(6);
    expect(nextReferenceNumber(noise, prefix)).toBe(1);
  });

  it("solo cuentan sufijos de 1 a 9 digitos (mas largos desbordarian el int de PostgreSQL)", () => {
    expect(nextReferenceNumber(["ACME-TR-1234567890", "ACME-TR-99999999999999999999"], prefix)).toBe(1);
    expect(nextReferenceNumber(["ACME-TR-000000012"], prefix)).toBe(13);
    expect(nextReferenceNumber(["ACME-TR-999999999"], prefix)).toBe(1_000_000_000);
  });

  it("no depende del orden ni de los duplicados, y no modifica la lista", () => {
    const list = ["ACME-TR-0003", "ACME-TR-0001", "ACME-TR-0003", "ACME-TR-0002"];
    const copy = [...list];
    expect(nextReferenceNumber(list, prefix)).toBe(4);
    expect(list).toEqual(copy);
  });
});

describe("lockTenantForCreate", () => {
  it("toma FOR NO KEY UPDATE sobre la fila del tenant, con el id como parametro", async () => {
    const { tx, raw } = fakeTx();
    await lockTenantForCreate(tx, TENANT.id);

    expect(raw.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = raw.$queryRaw.mock.calls[0];
    const sql = strings.join("?");
    expect(sql).toMatch(/SELECT id FROM tenants WHERE id = \?::uuid FOR NO KEY UPDATE/);
    // FOR UPDATE a secas bloquearia las inserciones hijas (FOR KEY SHARE de las claves foraneas).
    expect(sql).not.toMatch(/FOR UPDATE/);
    expect(values).toEqual([TENANT.id]);
  });
});

describe("nextReference", () => {
  it("no bloquea por si sola: el llamador toma lockTenantForCreate antes", async () => {
    const { tx, calls } = fakeTx();
    await nextReference(tx, { tenant: TENANT, kind: "TR" });
    expect(calls).toEqual(["read:trips"]);
  });

  it("viajes y solicitudes se leen de su propia tabla", async () => {
    const trips = fakeTx({ trips: lastNumber(12), serviceRequests: lastNumber(40) });
    expect(await nextReference(trips.tx, { tenant: TENANT, kind: "TR" })).toBe("ACME-TR-0013");
    expect(trips.calls).toEqual(["read:trips"]);

    const requests = fakeTx({ trips: lastNumber(12), serviceRequests: lastNumber(40) });
    expect(await nextReference(requests.tx, { tenant: TENANT, kind: "SR" })).toBe("ACME-SR-0041");
    expect(requests.calls).toEqual(["read:service_requests"]);
  });

  it("envia tenant, prefijo y posicion del sufijo como PARAMETROS (nada interpolado en el SQL)", async () => {
    const { tx, raw } = fakeTx({ trips: lastNumber(0) });
    await nextReference(tx, { tenant: TENANT, kind: "TR" });

    const [strings, ...values] = raw.$queryRaw.mock.calls[0];
    const sql = strings.join("?");
    expect(values).toEqual(expect.arrayContaining([TENANT.id, "ACME-TR-"]));
    // El sufijo empieza en la posicion 9 ("ACME-TR-" tiene 8 caracteres; substr cuenta desde 1).
    expect(values.filter((value) => value === 9).length).toBeGreaterThanOrEqual(1);
    expect(sql).not.toContain(TENANT.id);
    expect(sql).not.toContain("ACME");
    // Prefijo literal (starts_with), no LIKE: un slug con "_" o "%" no actua como comodin.
    expect(sql).toContain("starts_with(reference,");
    expect(sql).not.toMatch(/\bLIKE\b/i);
    // Solo sufijos de 1-9 digitos entran en el maximo y todo va acotado al tenant.
    expect(sql).toContain("'^[0-9]{1,9}$'");
    expect(sql).toContain("tenant_id = ?::uuid");
    expect(sql).toContain("COALESCE(MAX(");
  });

  it.each([
    [0, "ACME-TR-0001"],
    [1, "ACME-TR-0002"],
    [41, "ACME-TR-0042"],
    [9998, "ACME-TR-9999"],
    [9999, "ACME-TR-10000"],
    [10000, "ACME-TR-10001"],
  ])("ultimo numero %i => %s", async (last, expected) => {
    const { tx } = fakeTx({ trips: lastNumber(last) });
    expect(await nextReference(tx, { tenant: TENANT, kind: "TR" })).toBe(expected);
  });

  it("el prefijo siempre va en mayusculas, aunque el slug no lo este", async () => {
    const { tx, raw } = fakeTx();
    expect(await nextReference(tx, { tenant: { id: TENANT.id, slug: "Acme-Norte" }, kind: "SR" })).toBe(
      "ACME-NORTE-SR-0001",
    );
    expect(raw.$queryRaw.mock.calls[0].slice(1)).toContain("ACME-NORTE-SR-");
  });

  it.each([
    ["sin filas", []],
    ["maximo nulo", lastNumber(null)],
    ["maximo negativo", lastNumber(-4)],
    ["maximo no numerico", lastNumber("abc")],
  ])("tolera una lectura vacia o rara (%s) y empieza en 1", async (_caso, value) => {
    const { tx } = fakeTx({ trips: value });
    expect(await nextReference(tx, { tenant: TENANT, kind: "TR" })).toBe("ACME-TR-0001");
  });

  it("tolera que la consulta no devuelva nada (un mock sin configurar)", async () => {
    const { tx, raw } = fakeTx();
    raw.$queryRaw.mockImplementation(async () => undefined as never);
    expect(await nextReference(tx, { tenant: TENANT, kind: "TR" })).toBe("ACME-TR-0001");
  });

  it("acepta el maximo como bigint o como texto (segun el controlador)", async () => {
    expect(await nextReference(fakeTx({ trips: lastNumber(BigInt(7)) }).tx, { tenant: TENANT, kind: "TR" })).toBe(
      "ACME-TR-0008",
    );
    expect(await nextReference(fakeTx({ trips: lastNumber("12") }).tx, { tenant: TENANT, kind: "TR" })).toBe(
      "ACME-TR-0013",
    );
  });

  it("si la numeracion llega al tope de 9 digitos, falla en vez de repetir referencias", async () => {
    const { tx } = fakeTx({ trips: lastNumber(999_999_999) });
    await expect(nextReference(tx, { tenant: TENANT, kind: "TR" })).rejects.toThrow(RangeError);
  });
});

describe("DEFAULT_ROUTE_POINTS y buildDefaultRoutePoints", () => {
  it("son los tres puntos de demostracion de siempre, con el origen y el destino de la solicitud", () => {
    expect(DEFAULT_ROUTE_POINTS).toHaveLength(3);
    expect(buildDefaultRoutePoints("Colon", "Panama")).toStrictEqual([
      { label: "Colon", lat: 9.36, lng: -79.88 },
      { label: "Las Cumbres", lat: 9.09, lng: -79.54 },
      { label: "Panama", lat: 8.95, lng: -79.56 },
    ]);
  });

  it("la constante ya es un routePoints valido ({ label, lat, lng }) y la funcion devuelve copias", () => {
    for (const point of DEFAULT_ROUTE_POINTS) {
      expect(Object.keys(point)).toEqual(["label", "lat", "lng"]);
      expect(point.label.length).toBeGreaterThan(0);
      expect(Number.isFinite(point.lat) && Number.isFinite(point.lng)).toBe(true);
    }
    const first = buildDefaultRoutePoints("A", "B");
    first[1].label = "otro";
    first[0].lat = 0;
    expect(buildDefaultRoutePoints("A", "B")[1].label).toBe("Las Cumbres");
    expect(DEFAULT_ROUTE_POINTS[0]).toEqual({ label: "Origen", lat: 9.36, lng: -79.88 });
  });
});

describe("createTripFromRequest: valores por defecto = confirmRequestAsTripAction de siempre", () => {
  const legacyData = (reference: string) => ({
    tenantId: TENANT.id,
    customerAccountId: "cust-1",
    serviceRequestId: "sr-1",
    serviceTypeId: "svc-1",
    reference,
    status: "CONFIRMED",
    origin: "Manzanillo International Terminal",
    destination: "Puerto de Balboa",
    scheduledAt: request.requestedDate,
    eta: new Date(request.requestedDate.getTime() + 4 * HOUR),
    routePoints: [
      { label: "Manzanillo International Terminal", lat: 9.36, lng: -79.88 },
      { label: "Las Cumbres", lat: 9.09, lng: -79.54 },
      { label: "Puerto de Balboa", lat: 8.95, lng: -79.56 },
    ],
    customerVisibleStatus: "Servicio confirmado",
    events: {
      create: {
        tenantId: TENANT.id,
        actorId: "user-1",
        toStatus: "CONFIRMED",
        note: "Solicitud confirmada y convertida en viaje.",
        visibleToCustomer: true,
      },
    },
  });

  it("crea exactamente el mismo registro (sin claves de mas: ni stops, ni expectedDuration)", async () => {
    const { tx, raw } = fakeTx({ trips: lastNumber(12) });
    const trip = await createTripFromRequest(tx, baseInput);

    expect(raw.trip.create).toHaveBeenCalledTimes(1);
    expect(raw.trip.create.mock.calls[0][0]).toStrictEqual({ data: legacyData("ACME-TR-0013") });
    expect(trip).toMatchObject({ id: "trip-1", reference: "ACME-TR-0013", status: "CONFIRMED" });
  });

  it("constantes publicas: nota inicial y ETA de +4 h", () => {
    expect(DEFAULT_TRIP_INITIAL_NOTE).toBe("Solicitud confirmada y convertida en viaje.");
    expect(DEFAULT_TRIP_ETA_OFFSET_MS).toBe(4 * HOUR);
  });

  it("orden con el bloqueo del tenant ya tomado: bloqueo -> lectura del maximo -> creacion", async () => {
    const { tx, calls } = fakeTx({ trips: lastNumber(3) });
    await lockTenantForCreate(tx, TENANT.id);
    await createTripFromRequest(tx, baseInput);
    expect(calls).toEqual(["lock", "read:trips", "create"]);
  });

  it("la referencia sale del maximo de viajes, no del conteo: sobrevive a borrados", async () => {
    const { tx, raw } = fakeTx({ trips: lastNumber(13) });
    await createTripFromRequest(tx, baseInput);
    expect(raw.trip.create.mock.calls[0][0].data.reference).toBe("ACME-TR-0014");
  });

  it("todas las filas que escribe llevan el tenant resuelto por el servidor", async () => {
    const { tx, raw } = fakeTx();
    await createTripFromRequest(tx, {
      ...baseInput,
      stops: [{ type: "START", addressText: "Terminal" }],
    });
    const { data } = raw.trip.create.mock.calls[0][0];
    expect(data.tenantId).toBe(TENANT.id);
    expect(data.events.create.tenantId).toBe(TENANT.id);
    expect(data.stops?.create[0].tenantId).toBe(TENANT.id);
  });

  it("no toca la solicitud ni usa nada que no sea tx (el tx falso solo tiene $queryRaw y trip.create)", async () => {
    const { tx } = fakeTx();
    await expect(createTripFromRequest(tx, baseInput)).resolves.toBeDefined();
  });

  it("el modulo no importa getDb, audit ni notificaciones, ni lleva 'use server'", () => {
    const source = readFileSync("src/lib/server/trip-creation.ts", "utf8");
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
      .join("\n");
    expect(code).not.toMatch(/@\/lib\/server\/(db|audit)"/);
    expect(code).not.toMatch(/providers\/notifications/);
    expect(code).not.toMatch(/getDb\(|audit\(|sendLocalNotification\(/);
    // (`pnpm security:check` ya prohibe en todo src las variantes "Unsafe" de $queryRaw/$executeRaw.)
    expect(code).not.toMatch(/Prisma\.raw|Prisma\.sql|\.\$transaction\(/);
    expect(source).not.toMatch(/^\s*["']use server["']/m);
  });
});

describe("createTripFromRequest: parametros opcionales", () => {
  async function create(overrides: Partial<CreateTripFromRequestInput>) {
    const { tx, raw } = fakeTx({ trips: lastNumber(0) });
    await createTripFromRequest(tx, { ...baseInput, ...overrides });
    return raw.trip.create.mock.calls[0][0].data;
  }

  it("initialNote reemplaza la nota del evento inicial; un texto vacio usa la nota por defecto", async () => {
    expect((await create({ initialNote: "Servicio programado por su transportista." })).events.create.note).toBe(
      "Servicio programado por su transportista.",
    );
    expect((await create({ initialNote: "" })).events.create.note).toBe(DEFAULT_TRIP_INITIAL_NOTE);
    expect((await create({ initialNote: "   " })).events.create.note).toBe(DEFAULT_TRIP_INITIAL_NOTE);
  });

  it("el evento inicial siempre es visible para el cliente y lo firma el actor", async () => {
    const { events } = await create({ actorId: "actor-9" });
    expect(events.create).toMatchObject({ actorId: "actor-9", toStatus: "CONFIRMED", visibleToCustomer: true });
    expect(events.create).not.toHaveProperty("fromStatus");
  });

  it("scheduledAt propio: la ETA por defecto sale de ESA hora, no de la de la solicitud", async () => {
    const scheduledAt = new Date("2026-12-05T09:30:00.000Z");
    const data = await create({ scheduledAt });
    expect(data.scheduledAt).toBe(scheduledAt);
    expect(data.eta).toEqual(new Date("2026-12-05T13:30:00.000Z"));
  });

  it("eta propia o nula", async () => {
    const eta = new Date("2026-12-01T20:00:00.000Z");
    expect((await create({ eta })).eta).toBe(eta);
    expect((await create({ eta: null })).eta).toBeNull();
  });

  it("expectedDurationSec solo se envia si se indica (si no, vale el default de la columna)", async () => {
    expect(await create({})).not.toHaveProperty("expectedDuration");
    expect((await create({ expectedDurationSec: 7200 })).expectedDuration).toBe(7200);
  });

  it("routePoints propio reemplaza a los puntos por defecto", async () => {
    const routePoints = [{ label: "A", lat: 1, lng: 2 }];
    expect((await create({ routePoints })).routePoints).toBe(routePoints);
  });

  it("stops: se crean anidados, numerados desde 1 en el orden recibido", async () => {
    const data = await create({
      stops: [
        { type: "START", label: "Patio", addressText: "Patio Norte, Colon", latitude: 9.35, longitude: -79.9 },
        { type: "DELIVERY", addressText: "Puerto de Balboa" },
      ],
    });
    expect(data.stops).toEqual({
      create: [
        {
          tenantId: TENANT.id,
          type: "START",
          sequence: 1,
          label: "Patio",
          addressText: "Patio Norte, Colon",
          latitude: 9.35,
          longitude: -79.9,
        },
        { tenantId: TENANT.id, type: "DELIVERY", sequence: 2, addressText: "Puerto de Balboa" },
      ],
    });
  });

  it("una lista de paradas vacia equivale a no indicarla", async () => {
    expect(await create({ stops: [] })).not.toHaveProperty("stops");
  });
});

describe("createTripFromRequest: datos invalidos fallan ANTES de tocar la base de datos", () => {
  async function rejected(overrides: Partial<CreateTripFromRequestInput>, message: RegExp) {
    const { tx, calls } = fakeTx();
    await expect(createTripFromRequest(tx, { ...baseInput, ...overrides })).rejects.toThrow(message);
    expect(calls).toEqual([]); // ni lectura del maximo ni creacion
  }

  it("scheduledAt invalido", () => rejected({ scheduledAt: new Date(Number.NaN) }, /fecha programada/));

  it("la fecha de la solicitud es invalida y no hay scheduledAt propio", () =>
    rejected({ request: { ...request, requestedDate: new Date(Number.NaN) } }, /fecha programada/));

  it("eta invalida", () => rejected({ eta: new Date(Number.NaN) }, /llegada/));

  it.each([0, -60, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    "expectedDurationSec %s",
    (expectedDurationSec) => rejected({ expectedDurationSec }, /duraci/),
  );

  it("parada sin direccion", () =>
    rejected({ stops: [{ type: "START", addressText: "Patio" }, { type: "PICKUP", addressText: "   " }] }, /parada 2 necesita/));

  it.each([
    [{ latitude: 91 }, /latitud/],
    [{ latitude: -91 }, /latitud/],
    [{ latitude: Number.NaN }, /latitud/],
    [{ longitude: 181 }, /longitud/],
    [{ longitude: Number.POSITIVE_INFINITY }, /longitud/],
  ])("parada con coordenadas fuera de rango %j", (coords, message) =>
    rejected({ stops: [{ type: "START", addressText: "Patio", ...coords }] }, message),
  );

  it("coordenadas en los limites exactos son validas", async () => {
    const { tx } = fakeTx();
    await expect(
      createTripFromRequest(tx, {
        ...baseInput,
        stops: [{ type: "START", addressText: "Polo", latitude: -90, longitude: 180 }],
      }),
    ).resolves.toBeDefined();
  });
});
