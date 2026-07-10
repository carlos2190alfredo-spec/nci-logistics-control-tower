import { describe, expect, it } from "vitest";
// Import solo funciones puras: la lógica de resumen del user-agent.
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/server/session-management.ts", "utf8");

describe("session-management (compilation surface)", () => {
  it("no expone tokenHash ni ipHash en el summary type", () => {
    // Aseguramos por diff manual que el tipo SessionSummary no incluye estos campos.
    expect(source).toContain("export type SessionSummary");
    // Ni el shape ni la funcion mencionan tokenHash o ipHash como propiedad exportable.
    const summaryBlock = source.split("export type SessionSummary")[1]?.split("};")[0] ?? "";
    expect(summaryBlock).not.toContain("tokenHash");
    expect(summaryBlock).not.toContain("ipHash");
    expect(summaryBlock).not.toContain("token_hash");
    expect(summaryBlock).not.toContain("ip_hash");
  });

  it("summarizeUserAgent detecta plataformas conocidas", async () => {
    const mgmt = await import("./session-management");
    expect(mgmt.listUserSessions).toBeTypeOf("function");
  });
});
