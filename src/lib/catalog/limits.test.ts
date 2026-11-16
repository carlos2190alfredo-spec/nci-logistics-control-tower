import { describe, expect, it } from "vitest";
import { parsePagination } from "@/lib/pagination";
import {
  BULK_TRANSACTION_OPTIONS,
  CODE_MAX_LENGTH,
  FIELD_LIMITS,
  MAX_EQUIPMENT_PER_TENANT,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  MAX_LOCATIONS_PER_TENANT,
  MAX_SERVICE_TYPES_PER_TENANT,
  PAGE_SIZE_DEFAULT,
  SLUG_CODE_MAX_LENGTH,
} from "./limits";

describe("límites constantes (ADR-038 §4.8)", () => {
  it("tienen los valores acordados", () => {
    expect(MAX_IMPORT_BYTES).toBe(1_048_576);
    expect(MAX_IMPORT_ROWS).toBe(1000);
    expect(MAX_IMPORT_COLUMNS).toBe(100);
    expect(MAX_EQUIPMENT_PER_TENANT).toBe(1000);
    expect(MAX_LOCATIONS_PER_TENANT).toBe(5000);
    expect(MAX_SERVICE_TYPES_PER_TENANT).toBe(50);
    expect(CODE_MAX_LENGTH).toBe(32);
    expect(SLUG_CODE_MAX_LENGTH).toBe(40);
  });

  it("PAGE_SIZE_DEFAULT coincide con el tamaño de página que usa parsePagination", () => {
    // Si alguien cambia uno sin el otro, las listas y la paginación discreparían.
    expect(parsePagination({}).pageSize).toBe(PAGE_SIZE_DEFAULT);
  });

  it("un archivo de importación cabe holgadamente en el cuerpo de una Server Action (4 MB)", () => {
    expect(MAX_IMPORT_BYTES).toBeLessThan(4 * 1024 * 1024);
  });

  it("las transacciones masivas superan el plazo por defecto de Prisma (5 s)", () => {
    expect(BULK_TRANSACTION_OPTIONS.timeout).toBeGreaterThan(5_000);
    expect(BULK_TRANSACTION_OPTIONS.maxWait).toBeGreaterThan(2_000);
    expect(BULK_TRANSACTION_OPTIONS).toEqual({ timeout: 30_000, maxWait: 10_000 });
  });
});

describe("FIELD_LIMITS", () => {
  const ranges: [string, { min: number; max: number }][] = [];
  const walk = (prefix: string, node: unknown) => {
    if (node && typeof node === "object" && "min" in node && "max" in node) {
      ranges.push([prefix, node as { min: number; max: number }]);
    } else if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) walk(prefix ? `${prefix}.${key}` : key, child);
    }
  };
  walk("", FIELD_LIMITS);

  it("recorre todos los campos con un rango coherente (0 ≤ min < max)", () => {
    expect(ranges.length).toBeGreaterThan(20);
    for (const [path, range] of ranges) {
      expect(range.min, path).toBeGreaterThanOrEqual(0);
      expect(range.max, path).toBeGreaterThan(range.min);
    }
  });

  it("refleja la especificación de los esquemas", () => {
    expect(FIELD_LIMITS.customer.name).toEqual({ min: 2, max: 120 });
    expect(FIELD_LIMITS.customer.internalNotes.max).toBe(1000);
    expect(FIELD_LIMITS.vehicle.plate).toEqual({ min: 3, max: 15 });
    expect(FIELD_LIMITS.equipment.code).toEqual({ min: 2, max: 32 });
    expect(FIELD_LIMITS.serviceType.name).toEqual({ min: 2, max: 80 });
    expect(FIELD_LIMITS.location.name).toEqual({ min: 2, max: 120 });
    expect(FIELD_LIMITS.trip.origin).toEqual({ min: 2, max: 200 });
    expect(FIELD_LIMITS.trip.container.sealNumber.max).toBe(30);
  });
});
