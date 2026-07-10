import { describe, expect, it } from "vitest";
import { canonicalizePayload, offlineSyncRequestSchema, OFFLINE_SCHEMA_VERSION } from "./protocol";

describe("offline protocol", () => {
  it("canonicalizePayload es estable ante reordenamiento de claves", () => {
    const a = canonicalizePayload({ b: 2, a: 1, nested: { z: 9, y: 8 } });
    const b = canonicalizePayload({ nested: { y: 8, z: 9 }, a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it("rechaza actionType desconocido", () => {
    const result = offlineSyncRequestSchema.safeParse({
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      commands: [
        {
          schemaVersion: OFFLINE_SCHEMA_VERSION,
          idempotencyKey: "00000000-0000-4000-8000-000000000000",
          clientQueuedAt: new Date().toISOString(),
          localSequence: 1,
          payload: { actionType: "trip.delete", tripId: "00000000-0000-4000-8000-000000000000" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza transiciones fuera de whitelist", () => {
    const result = offlineSyncRequestSchema.safeParse({
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      commands: [
        {
          schemaVersion: OFFLINE_SCHEMA_VERSION,
          idempotencyKey: "00000000-0000-4000-8000-000000000001",
          clientQueuedAt: new Date().toISOString(),
          localSequence: 1,
          payload: {
            actionType: "trip.transition",
            tripId: "00000000-0000-4000-8000-000000000000",
            nextStatus: "CLOSED",
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("acepta transición válida", () => {
    const result = offlineSyncRequestSchema.safeParse({
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      commands: [
        {
          schemaVersion: OFFLINE_SCHEMA_VERSION,
          idempotencyKey: "00000000-0000-4000-8000-000000000002",
          clientQueuedAt: new Date().toISOString(),
          localSequence: 1,
          payload: {
            actionType: "trip.transition",
            tripId: "00000000-0000-4000-8000-000000000000",
            nextStatus: "EN_ROUTE_TO_ORIGIN",
            note: "En camino",
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza lote demasiado grande", () => {
    const command = {
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
      clientQueuedAt: new Date().toISOString(),
      localSequence: 1,
      payload: {
        actionType: "trip.transition" as const,
        tripId: "00000000-0000-4000-8000-000000000000",
        nextStatus: "IN_TRANSIT" as const,
      },
    };
    const result = offlineSyncRequestSchema.safeParse({
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      commands: Array.from({ length: 26 }, (_, index) => ({
        ...command,
        idempotencyKey: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        localSequence: index + 1,
      })),
    });
    expect(result.success).toBe(false);
  });
});
