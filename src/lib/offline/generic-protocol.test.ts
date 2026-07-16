import { describe, expect, it } from "vitest";
import {
  canonicalizeAction,
  formDataToRecord,
  recordToFormData,
  syncActionRequestSchema,
  syncActionSchema,
  SYNC_ACTION_SCHEMA_VERSION,
  type SyncAction,
} from "./generic-protocol";

const baseAction = (over: Partial<SyncAction> = {}): SyncAction => ({
  schemaVersion: SYNC_ACTION_SCHEMA_VERSION,
  idempotencyKey: "00000000-0000-4000-8000-000000000000",
  clientQueuedAt: new Date("2026-07-16T00:00:00.000Z").toISOString(),
  localSequence: 1,
  tenantSlug: "panatruck-demo",
  actionId: "driver.create",
  formData: { name: "Pedro", code: "DRV-1" },
  ...over,
});

describe("generic offline protocol", () => {
  it("canonicalizeAction es estable ante reordenamiento de claves", () => {
    const a = canonicalizeAction(baseAction({ formData: { b: "2", a: "1" } }));
    const b = canonicalizeAction(baseAction({ formData: { a: "1", b: "2" } }));
    expect(a).toBe(b);
  });

  it("acepta una acción válida", () => {
    const result = syncActionSchema.safeParse(baseAction());
    expect(result.success).toBe(true);
  });

  it("rechaza idempotencyKey que no es UUID", () => {
    const result = syncActionSchema.safeParse(baseAction({ idempotencyKey: "no-es-uuid" }));
    expect(result.success).toBe(false);
  });

  it("coacciona valores numéricos a string", () => {
    const result = syncActionSchema.safeParse(
      baseAction({ formData: { weight: 1200 } as unknown as Record<string, string> }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.formData.weight).toBe("1200");
    }
  });

  it("rechaza más de 64 campos en formData", () => {
    const formData: Record<string, string> = {};
    for (let i = 0; i < 65; i++) formData[`f${i}`] = "x";
    const result = syncActionSchema.safeParse(baseAction({ formData }));
    expect(result.success).toBe(false);
  });

  it("rechaza un valor de campo mayor a 8192 caracteres", () => {
    const result = syncActionSchema.safeParse(
      baseAction({ formData: { big: "x".repeat(8193) } }),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza schemaVersion incorrecta", () => {
    const result = syncActionSchema.safeParse(
      baseAction({ schemaVersion: 99 as unknown as typeof SYNC_ACTION_SCHEMA_VERSION }),
    );
    expect(result.success).toBe(false);
  });

  it("acepta un lote de hasta 25 acciones", () => {
    const actions = Array.from({ length: 25 }, (_, i) =>
      baseAction({
        idempotencyKey: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        localSequence: i + 1,
      }),
    );
    const result = syncActionRequestSchema.safeParse({
      schemaVersion: SYNC_ACTION_SCHEMA_VERSION,
      actions,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un lote de más de 25 acciones", () => {
    const actions = Array.from({ length: 26 }, (_, i) =>
      baseAction({
        idempotencyKey: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        localSequence: i + 1,
      }),
    );
    const result = syncActionRequestSchema.safeParse({
      schemaVersion: SYNC_ACTION_SCHEMA_VERSION,
      actions,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un lote vacío", () => {
    const result = syncActionRequestSchema.safeParse({
      schemaVersion: SYNC_ACTION_SCHEMA_VERSION,
      actions: [],
    });
    expect(result.success).toBe(false);
  });

  it("formDataToRecord convierte strings y omite archivos", () => {
    const fd = new FormData();
    fd.append("name", "Pedro");
    fd.append("code", "DRV-1");
    fd.append("file", new File(["contenido"], "foto.jpg", { type: "image/jpeg" }));
    const record = formDataToRecord(fd);
    expect(record.name).toBe("Pedro");
    expect(record.code).toBe("DRV-1");
    expect(record.file).toBe("[FILE_OMITTED]");
  });

  it("recordToFormData es el inverso de formDataToRecord para strings", () => {
    const original = { name: "Maria", role: "DISPATCHER" };
    const fd = recordToFormData(original);
    const back = formDataToRecord(fd);
    expect(back).toEqual(original);
  });
});
