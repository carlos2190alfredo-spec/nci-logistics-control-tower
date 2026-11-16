import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isForeignKeyViolation, isUniqueViolation } from "./db-errors";

/** Error con la forma que tiene `PrismaClientKnownRequestError` (code + meta), sin depender de Prisma. */
function prismaError(code: string, meta?: unknown) {
  return Object.assign(new Error(`Prisma ${code}`), { code, ...(meta === undefined ? {} : { meta }) });
}

describe("isUniqueViolation sin pista", () => {
  it("reconoce P2002, sea un Error o un objeto plano", () => {
    expect(isUniqueViolation(prismaError("P2002"))).toBe(true);
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation(prismaError("P2002", { target: ["tenant_id", "code"] }))).toBe(true);
  });

  it.each([
    ["otro codigo de Prisma (P2003)", prismaError("P2003")],
    ["registro no encontrado (P2025)", prismaError("P2025")],
    ["codigo de PostgreSQL crudo", { code: "23505" }],
    ["codigo numerico", { code: 2002 }],
    ["codigo en minusculas", { code: "p2002" }],
    ["un Error sin codigo", new Error("Unique constraint failed")],
    ["un objeto sin codigo", {}],
    ["null", null],
    ["undefined", undefined],
    ["un texto", "P2002"],
    ["un numero", 2002],
  ])("no confunde %s", (_caso, error) => {
    expect(isUniqueViolation(error)).toBe(false);
  });
});

describe("isUniqueViolation con pista de campo (meta.target)", () => {
  it("coincide si el campo esta entre las columnas (PostgreSQL informa una lista)", () => {
    const error = prismaError("P2002", { target: ["tenant_id", "plate"] });
    expect(isUniqueViolation(error, "plate")).toBe(true);
    expect(isUniqueViolation(error, "code")).toBe(false);
    expect(isUniqueViolation(error, "reference")).toBe(false);
  });

  it("no distingue entre el nombre del campo y el de la columna (camelCase / snake_case)", () => {
    const column = prismaError("P2002", { target: ["tenant_id", "client_request_key"] });
    expect(isUniqueViolation(column, "clientRequestKey")).toBe(true);
    expect(isUniqueViolation(column, "client_request_key")).toBe(true);
    expect(isUniqueViolation(column, "reference")).toBe(false);

    const field = prismaError("P2002", { target: ["tenantId", "clientRequestKey"] });
    expect(isUniqueViolation(field, "client_request_key")).toBe(true);
    expect(isUniqueViolation(field, "clientRequestKey")).toBe(true);
    expect(isUniqueViolation(field, "tenantId")).toBe(true);
  });

  it("distingue las dos restricciones unicas de una misma tabla (reference vs clientRequestKey)", () => {
    const byReference = prismaError("P2002", { target: ["tenant_id", "reference"] });
    const byKey = prismaError("P2002", { target: ["tenant_id", "client_request_key"] });
    expect(isUniqueViolation(byReference, "reference")).toBe(true);
    expect(isUniqueViolation(byReference, "clientRequestKey")).toBe(false);
    expect(isUniqueViolation(byKey, "clientRequestKey")).toBe(true);
    expect(isUniqueViolation(byKey, "reference")).toBe(false);
  });

  it("con una lista de columnas exige el nombre completo (code no es postal_code ni tenant_id es id)", () => {
    expect(isUniqueViolation(prismaError("P2002", { target: ["tenant_id", "postal_code"] }), "code")).toBe(false);
    expect(isUniqueViolation(prismaError("P2002", { target: ["tenant_id", "code"] }), "code")).toBe(true);
    expect(isUniqueViolation(prismaError("P2002", { target: ["tenant_id"] }), "id")).toBe(false);
  });

  it("tolera que target sea un texto (nombre del indice o de la restriccion)", () => {
    const error = prismaError("P2002", { target: "vehicles_tenant_id_plate_key" });
    expect(isUniqueViolation(error, "plate")).toBe(true);
    expect(isUniqueViolation(error, "code")).toBe(false);
    expect(isUniqueViolation(prismaError("P2002", { target: "plate" }), "plate")).toBe(true);
    expect(isUniqueViolation(prismaError("P2002", { target: "client_request_key" }), "clientRequestKey")).toBe(true);
  });

  it("con un nombre de indice el campo debe aparecer completo, no como parte de otra palabra", () => {
    const error = prismaError("P2002", { target: "vehicles_tenant_id_plate_key" });
    expect(isUniqueViolation(error, "plat")).toBe(false);
    expect(isUniqueViolation(error, "late")).toBe(false);
    expect(isUniqueViolation(error, "vehicle")).toBe(false);
    expect(isUniqueViolation(error, "plate")).toBe(true);
  });

  it("si Prisma no informa el destino, una pista nunca coincide (pero sin pista sigue siendo P2002)", () => {
    for (const meta of [undefined, null, {}, { target: undefined }, { target: null }, { target: 5 }, { target: [] }, { target: [1, null] }, "x"]) {
      const error = prismaError("P2002", meta);
      expect(isUniqueViolation(error, "plate"), JSON.stringify(meta)).toBe(false);
      expect(isUniqueViolation(error), JSON.stringify(meta)).toBe(true);
    }
  });

  it("otra clase de error nunca coincide, con o sin pista", () => {
    const error = prismaError("P2003", { target: ["plate"] });
    expect(isUniqueViolation(error, "plate")).toBe(false);
  });

  it("una pista vacia equivale a no pasar pista", () => {
    const error = prismaError("P2002", { target: ["tenant_id", "plate"] });
    expect(isUniqueViolation(error, "")).toBe(true);
    expect(isUniqueViolation(error, "  ")).toBe(true);
  });
});

describe("isForeignKeyViolation", () => {
  it("reconoce solo P2003", () => {
    expect(isForeignKeyViolation(prismaError("P2003", { field_name: "trips_customer_account_id_fkey (index)" }))).toBe(true);
    expect(isForeignKeyViolation({ code: "P2003" })).toBe(true);
    for (const error of [prismaError("P2002"), prismaError("P2025"), { code: "23503" }, new Error("fk"), null, undefined, "P2003"]) {
      expect(isForeignKeyViolation(error)).toBe(false);
    }
  });
});

describe("modulo", () => {
  it("no lleva 'use server' (un modulo 'use server' expone cada export como endpoint publico)", () => {
    expect(readFileSync("src/lib/server/db-errors.ts", "utf8")).not.toMatch(/^\s*["']use server["']/m);
  });
});
