import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/lib/server/db-errors";
import {
  createTripFromRequest,
  formatReference,
  lockTenantForCreate,
  nextReference,
  nextReferenceNumber,
  referencePrefix,
} from "@/lib/server/trip-creation";
import { connectTestDb, deferred, sleep, withTimeout } from "./helpers/db";
import {
  createBasics,
  createTestTenant,
  destroyTestTenant,
  sweepStaleTestTenants,
  type TenantBasics,
  type TestTenant,
} from "./helpers/tenants";

/**
 * Referencias consecutivas, bloqueo del tenant y "Nuevo viaje" contra PostgreSQL real (ADR-038).
 * Lo que un mock no demuestra: la consulta SQL del máximo, la serialización de transacciones concurrentes,
 * la forma real del P2002 y que el bloqueo `FOR NO KEY UPDATE` no frena las inserciones hijas.
 */
const db = connectTestDb();
const REQUESTED = new Date("2026-12-01T14:00:00.000Z");
/** `TripEvent.actorId` es un UUID sin clave foránea: basta uno con formato válido. */
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

let other: TestTenant;
let otherBasics: TenantBasics;

function requestData(t: TestTenant, b: TenantBasics, reference: string, extra: Record<string, unknown> = {}) {
  return {
    tenantId: t.id,
    customerAccountId: b.customerId,
    serviceTypeId: b.serviceTypeId,
    reference,
    origin: "Colón",
    destination: "Balboa",
    requestedDate: REQUESTED,
    source: "OPERATIONS",
    ...extra,
  };
}

function tripData(t: TestTenant, b: TenantBasics, reference: string) {
  return {
    tenantId: t.id,
    customerAccountId: b.customerId,
    serviceTypeId: b.serviceTypeId,
    reference,
    origin: "Colón",
    destination: "Balboa",
    scheduledAt: REQUESTED,
  };
}

beforeAll(async () => {
  await sweepStaleTestTenants(db);
  other = await createTestTenant(db);
  otherBasics = await createBasics(db, other.id);
});

afterAll(async () => {
  await destroyTestTenant(db, other.id);
  await db.$disconnect();
});

describe("nextReference (SQL real)", () => {
  it("empieza en 0001 para una solicitud y para un viaje", async () => {
    const fresh = await createTestTenant(db);
    try {
      await db.$transaction(async (tx) => {
        await lockTenantForCreate(tx, fresh.id);
        expect(await nextReference(tx, { tenant: fresh, kind: "SR" })).toBe(formatReference(fresh.slug, "SR", 1));
        expect(await nextReference(tx, { tenant: fresh, kind: "TR" })).toBe(formatReference(fresh.slug, "TR", 1));
      });
    } finally {
      await destroyTestTenant(db, fresh.id);
    }
  });

  it("toma el MÁXIMO del sufijo e ignora lo que no es de la serie (y coincide con la función pura)", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      const prefix = referencePrefix(t.slug, "SR");
      const own = [
        `${prefix}0001`,
        `${prefix}0007`, // hueco: no se reutiliza
        `${prefix}abc`, // no numérico
        `${prefix}12a`, // mezcla
        `${prefix}1234567890`, // 10 dígitos: desbordaría un int de PostgreSQL, se ignora
        `${prefix}20260101123456`, // 14 dígitos: ídem
        `${t.slug}-sr-0099`, // otra capitalización
      ];
      for (const reference of own) await db.serviceRequest.create({ data: requestData(t, b, reference) });
      // Otro tenant con una referencia que lleva el prefijo de ESTE: no cuenta (el máximo es por tenant).
      await db.serviceRequest.create({ data: requestData(other, otherBasics, `${prefix}0500`) });
      // Un viaje TR no cuenta para las solicitudes SR.
      await db.trip.create({ data: tripData(t, b, `${referencePrefix(t.slug, "TR")}0040`) });

      const next = await db.$transaction(async (tx) => {
        await lockTenantForCreate(tx, t.id);
        return nextReference(tx, { tenant: t, kind: "SR" });
      });
      expect(next).toBe(formatReference(t.slug, "SR", 8));
      // Misma respuesta que la versión en memoria que usa la interfaz.
      expect(nextReferenceNumber(own, prefix)).toBe(8);

      const nextTrip = await db.$transaction(async (tx) => {
        await lockTenantForCreate(tx, t.id);
        return nextReference(tx, { tenant: t, kind: "TR" });
      });
      expect(nextTrip).toBe(formatReference(t.slug, "TR", 41));
    } finally {
      await db.serviceRequest.deleteMany({ where: { tenantId: other.id, reference: { contains: "-SR-0500" } } });
      await destroyTestTenant(db, t.id);
    }
  });

  it("una referencia de 9 dígitos agota la numeración con un error claro, sin romper la consulta", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      await db.serviceRequest.create({ data: requestData(t, b, `${referencePrefix(t.slug, "SR")}999999999`) });
      await expect(
        db.$transaction(async (tx) => {
          await lockTenantForCreate(tx, t.id);
          return nextReference(tx, { tenant: t, kind: "SR" });
        }),
      ).rejects.toThrow("Se agotó la numeración");
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });
});

describe("concurrencia", () => {
  it("12 altas simultáneas con el bloqueo del tenant reciben 0001…0012 sin repetir ni fallar", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, () =>
          db.$transaction(
            async (tx) => {
              await lockTenantForCreate(tx, t.id);
              const reference = await nextReference(tx, { tenant: t, kind: "SR" });
              await tx.serviceRequest.create({ data: requestData(t, b, reference) });
              return reference;
            },
            { timeout: 30_000, maxWait: 30_000 },
          ),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected");
      expect(failed).toEqual([]);
      const references = results.map((r) => (r as PromiseFulfilledResult<string>).value).sort();
      expect(references).toEqual(Array.from({ length: 12 }, (_, i) => formatReference(t.slug, "SR", i + 1)));
      expect(await db.serviceRequest.count({ where: { tenantId: t.id } })).toBe(12);
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });

  it("sin el bloqueo, dos creaciones calculan el mismo número y la restricción única lo atrapa (forma real del P2002)", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      const calculated = deferred();
      const proceed = deferred();
      // B calcula la referencia SIN bloqueo y espera.
      const stale = db.$transaction(async (tx) => {
        const reference = await nextReference(tx, { tenant: t, kind: "SR" });
        calculated.resolve();
        await proceed.promise;
        await tx.serviceRequest.create({ data: requestData(t, b, reference) });
      });
      await calculated.promise;
      // Mientras tanto A crea la 0001 y confirma.
      await db.serviceRequest.create({ data: requestData(t, b, formatReference(t.slug, "SR", 1)) });
      proceed.resolve();

      const error = await stale.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).not.toBeNull();
      expect((error as { code?: string }).code).toBe("P2002");
      // Los nombres de campo que el código usa para distinguir qué restricción falló.
      expect(isUniqueViolation(error)).toBe(true);
      expect(isUniqueViolation(error, "reference")).toBe(true);
      expect(isUniqueViolation(error, "tenantId")).toBe(true);
      expect(isUniqueViolation(error, "plate")).toBe(false);
      expect(isUniqueViolation(error, "clientRequestKey")).toBe(false);
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });

  it("FOR NO KEY UPDATE: quien tiene el bloqueo NO frena inserciones hijas, pero sí a otro que pida el mismo bloqueo", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      const held = deferred();
      const release = deferred();
      const holder = db.$transaction(
        async (tx) => {
          await lockTenantForCreate(tx, t.id);
          held.resolve();
          await release.promise;
        },
        { timeout: 30_000 },
      );
      await held.promise;

      // Inserciones hijas (toman FOR KEY SHARE sobre el tenant por su clave foránea): deben terminar ya.
      await withTimeout(db.vehicle.create({ data: { tenantId: t.id, code: "V-LOCK", plate: "P-LOCK", type: "CAMION" } }), 5000, "insertar vehículo");
      await withTimeout(db.serviceRequest.create({ data: requestData(t, b, "REF-LIBRE-1") }), 5000, "insertar solicitud");

      // Un segundo creador SÍ espera hasta el COMMIT del primero.
      let secondEntered = false;
      const second = db.$transaction(
        async (tx) => {
          await lockTenantForCreate(tx, t.id);
          secondEntered = true;
        },
        { timeout: 30_000, maxWait: 30_000 },
      );
      await sleep(400);
      expect(secondEntered).toBe(false);

      release.resolve();
      await holder;
      await withTimeout(second, 5000, "segundo bloqueo");
      expect(secondEntered).toBe(true);
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });
});

describe("Nuevo viaje (solicitud CONVERTED + viaje CONFIRMED en una transacción)", () => {
  async function createNewTrip(t: TestTenant, b: TenantBasics, extra: { clientRequestKey?: string; stops?: Parameters<typeof createTripFromRequest>[1]["stops"] } = {}) {
    return db.$transaction(
      async (tx) => {
        await lockTenantForCreate(tx, t.id);
        const reference = await nextReference(tx, { tenant: t, kind: "SR" });
        const request = await tx.serviceRequest.create({
          data: requestData(t, b, reference, { status: "CONVERTED", clientRequestKey: extra.clientRequestKey }),
        });
        const trip = await createTripFromRequest(tx, { tenant: t, actorId: ACTOR_ID, request, stops: extra.stops });
        return { request, trip };
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
  }

  it("crea solicitud y viaje con referencias propias, evento inicial visible, ETA y ruta por defecto", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      const { request, trip } = await createNewTrip(t, b, {
        stops: [
          { type: "PICKUP", addressText: "Muelle 1", latitude: 9.36, longitude: -79.9 },
          { type: "DELIVERY", addressText: "Bodega Las Cumbres" },
        ],
      });
      expect(request.reference).toBe(formatReference(t.slug, "SR", 1));
      expect(trip.reference).toBe(formatReference(t.slug, "TR", 1));
      expect(trip.status).toBe("CONFIRMED");
      expect(trip.serviceRequestId).toBe(request.id);
      expect(trip.eta?.getTime()).toBe(REQUESTED.getTime() + 4 * 60 * 60 * 1000);

      const stored = await db.trip.findUniqueOrThrow({
        where: { id: trip.id },
        include: { events: true, stops: { orderBy: { sequence: "asc" } } },
      });
      expect(stored.tenantId).toBe(t.id);
      expect(stored.events).toHaveLength(1);
      expect(stored.events[0]).toMatchObject({ toStatus: "CONFIRMED", visibleToCustomer: true, tenantId: t.id });
      expect(stored.stops.map((s) => [s.sequence, s.type, s.tenantId])).toEqual([
        [1, "PICKUP", t.id],
        [2, "DELIVERY", t.id],
      ]);
      const points = stored.routePoints as { label: string }[];
      expect(points).toHaveLength(3);
      expect([points[0].label, points[2].label]).toEqual(["Colón", "Balboa"]);
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });

  it("8 viajes simultáneos obtienen solicitudes y viajes consecutivos, sin duplicados", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => createNewTrip(t, b)));
      expect(results.filter((r) => r.status === "rejected")).toEqual([]);
      const ok = results.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof createNewTrip>>>).value);
      const expected = Array.from({ length: 8 }, (_, i) => i + 1);
      expect(ok.map((r) => r.request.reference).sort()).toEqual(expected.map((n) => formatReference(t.slug, "SR", n)));
      expect(ok.map((r) => r.trip.reference).sort()).toEqual(expected.map((n) => formatReference(t.slug, "TR", n)));
      expect(await db.tripEvent.count({ where: { tenantId: t.id } })).toBe(8);
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });

  it("repetir el mismo clientRequestKey falla con P2002 identificable y no deja nada a medias", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      await createNewTrip(t, b, { clientRequestKey: "doble-clic-1" });
      const error = await createNewTrip(t, b, { clientRequestKey: "doble-clic-1" }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(isUniqueViolation(error, "clientRequestKey")).toBe(true);
      expect(isUniqueViolation(error, "reference")).toBe(false);
      // La segunda transacción se revirtió completa: una solicitud, un viaje.
      expect(await db.serviceRequest.count({ where: { tenantId: t.id } })).toBe(1);
      expect(await db.trip.count({ where: { tenantId: t.id } })).toBe(1);
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });

  it("dos solicitudes sin clientRequestKey (NULL) no chocan entre sí", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      await createNewTrip(t, b);
      await createNewTrip(t, b);
      expect(await db.serviceRequest.count({ where: { tenantId: t.id } })).toBe(2);
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });

  it("si la creación del viaje falla (parada inválida), la solicitud también se revierte", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      await expect(createNewTrip(t, b, { stops: [{ type: "PICKUP", addressText: "   " }] })).rejects.toThrow("necesita una dirección");
      expect(await db.serviceRequest.count({ where: { tenantId: t.id } })).toBe(0);
      expect(await db.trip.count({ where: { tenantId: t.id } })).toBe(0);
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });

  it("una solicitud solo puede tener un viaje (serviceRequestId único)", async () => {
    const t = await createTestTenant(db);
    const b = await createBasics(db, t.id);
    try {
      const { request } = await createNewTrip(t, b);
      const error = await db
        .$transaction(async (tx) => {
          await lockTenantForCreate(tx, t.id);
          return createTripFromRequest(tx, { tenant: t, actorId: ACTOR_ID, request });
        })
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(isUniqueViolation(error, "serviceRequestId")).toBe(true);
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });
});
