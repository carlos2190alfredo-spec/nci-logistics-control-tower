import { describe, expect, it, vi } from "vitest";
import type { ImportValidRow } from "@/lib/import/catalogs";
import { applyCatalogImport } from "@/lib/server/import-apply";
import { PlanLimitError } from "@/lib/server/plan-limits";
import type { Tx } from "@/lib/server/trip-creation";

const TENANT = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;

/** Tx falso: guarda lo que se crea y devuelve lo existente indicado. */
function fakeTx(opts: {
  customers?: Row[];
  vehicles?: Row[];
  equipment?: Row[];
  locations?: Row[];
  maxCustomers?: number;
  maxVehicles?: number;
}) {
  const created = { customers: [] as Row[], vehicles: [] as Row[], equipment: [] as Row[], locations: [] as Row[] };
  const order: string[] = [];
  const customers = opts.customers ?? [];
  const vehicles = opts.vehicles ?? [];
  const tx = {
    $queryRaw: vi.fn(async () => {
      order.push("lock");
      return [];
    }),
    tenant: {
      findUnique: vi.fn(async () => ({
        plan: { name: "Starter", maxUsers: 9, maxDrivers: 9, maxVehicles: opts.maxVehicles ?? 100, maxCustomers: opts.maxCustomers ?? 100, maxDocuments: 9 },
      })),
    },
    customerAccount: {
      findMany: vi.fn(async () => customers),
      count: vi.fn(async () => customers.length),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => void created.customers.push(...data)),
    },
    vehicle: {
      findMany: vi.fn(async () => vehicles),
      count: vi.fn(async () => vehicles.length),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => void created.vehicles.push(...data)),
    },
    equipment: {
      findMany: vi.fn(async () => opts.equipment ?? []),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => void created.equipment.push(...data)),
    },
    location: {
      findMany: vi.fn(async () => opts.locations ?? []),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => void created.locations.push(...data)),
    },
  };
  return { tx: tx as unknown as Tx, created, raw: tx, order };
}

const customerRow = (line: number, name: string, code?: string): ImportValidRow<"customers"> => ({
  line,
  data: { name, code, taxId: null, contactName: null, contactEmail: null, contactPhone: null, address: null, internalNotes: null } as never,
});
const vehicleRow = (line: number, plate: string, code = plate): ImportValidRow<"vehicles"> => ({
  line,
  data: { plate, code, type: "Camión" },
});

describe("applyCatalogImport", () => {
  it("toma el bloqueo del tenant primero y escribe tenantId en todas las filas", async () => {
    const { tx, created, order, raw } = fakeTx({});
    await applyCatalogImport(tx, { tenantId: TENANT, kind: "customers", rows: [customerRow(2, "Uno"), customerRow(3, "Dos")] });
    expect(order[0]).toBe("lock");
    expect(raw.customerAccount.createMany).toHaveBeenCalledTimes(1);
    expect(created.customers.every((row) => row.tenantId === TENANT)).toBe(true);
  });

  it("clientes sin código reciben CLI- consecutivos desde el máximo existente, sin saltos", async () => {
    const { tx, created } = fakeTx({ customers: [{ code: "CLI-0007", name: "Viejo" }] });
    const outcome = await applyCatalogImport(tx, {
      tenantId: TENANT,
      kind: "customers",
      rows: [customerRow(2, "A"), customerRow(3, "B"), customerRow(4, "C", "EXT-9")],
    });
    expect(created.customers.map((row) => row.code)).toEqual(["CLI-0008", "CLI-0009", "EXT-9"]);
    expect(outcome).toEqual({ created: 3, skippedExisting: 0 });
  });

  it("omite lo que ya existe sin distinguir mayúsculas ni tildes y no lo pisa", async () => {
    const { tx, created } = fakeTx({ customers: [{ code: "CLI-0001", name: "Importadora Panamá" }] });
    const outcome = await applyCatalogImport(tx, {
      tenantId: TENANT,
      kind: "customers",
      rows: [customerRow(2, "IMPORTADORA PANAMA"), customerRow(3, "Nuevo")],
    });
    expect(outcome).toEqual({ created: 1, skippedExisting: 1 });
    expect(created.customers).toHaveLength(1);
  });

  it("vehículos: placa y código comparten un espacio de identidad (cruce placa↔código)", async () => {
    const { tx, created } = fakeTx({ vehicles: [{ plate: "AB1234", code: "T-01" }] });
    const outcome = await applyCatalogImport(tx, {
      tenantId: TENANT,
      kind: "vehicles",
      rows: [vehicleRow(2, "ab1234"), vehicleRow(3, "ZZ9999", "t-01"), vehicleRow(4, "CD5678")],
    });
    expect(outcome).toEqual({ created: 1, skippedExisting: 2 });
    expect(created.vehicles.map((row) => row.plate)).toEqual(["CD5678"]);
  });

  it("si no caben en el plan no se escribe NADA (todo o nada)", async () => {
    const { tx, raw } = fakeTx({ maxVehicles: 2, vehicles: [{ plate: "OLD1", code: "OLD1" }] });
    await expect(
      applyCatalogImport(tx, { tenantId: TENANT, kind: "vehicles", rows: [vehicleRow(2, "A1"), vehicleRow(3, "A2")] }),
    ).rejects.toBeInstanceOf(PlanLimitError);
    expect(raw.vehicle.createMany).not.toHaveBeenCalled();
  });

  it("escribe en lotes de 500 y respeta el tope de equipos", async () => {
    const { tx, raw } = fakeTx({});
    const rows = Array.from({ length: 900 }, (_, i) => ({ line: i + 2, data: { code: `EQ-${i}`, type: "Chasis" } })) as ImportValidRow<"equipment">[];
    await applyCatalogImport(tx, { tenantId: TENANT, kind: "equipment", rows });
    expect(raw.equipment.createMany).toHaveBeenCalledTimes(2);
    const tooMany = Array.from({ length: 1001 }, (_, i) => ({ line: i + 2, data: { code: `X-${i}`, type: "Chasis" } })) as ImportValidRow<"equipment">[];
    const other = fakeTx({});
    await expect(applyCatalogImport(other.tx, { tenantId: TENANT, kind: "equipment", rows: tooMany })).rejects.toBeInstanceOf(RangeError);
    expect(other.raw.equipment.createMany).not.toHaveBeenCalled();
  });

  it("lugares: omite repetidos por nombre y conserva coordenadas opcionales", async () => {
    const { tx, created } = fakeTx({ locations: [{ name: "Patio Colón" }] });
    const outcome = await applyCatalogImport(tx, {
      tenantId: TENANT,
      kind: "locations",
      rows: [
        { line: 2, data: { name: "patio colon", address: "", latitude: null, longitude: null } },
        { line: 3, data: { name: "Puerto", address: "Balboa", latitude: 8.95, longitude: -79.56 } },
      ],
    });
    expect(outcome).toEqual({ created: 1, skippedExisting: 1 });
    expect(created.locations[0]).toMatchObject({ tenantId: TENANT, name: "Puerto", latitude: 8.95 });
  });
});
