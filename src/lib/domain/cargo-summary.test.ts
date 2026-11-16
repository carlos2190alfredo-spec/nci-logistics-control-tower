import { describe, expect, it } from "vitest";
import { summarizeCargo } from "@/lib/domain/cargo-summary";

describe("summarizeCargo", () => {
  it("resume contacto, contenedor y booking", () => {
    expect(
      summarizeCargo({
        contact: { name: "Ana Pérez", phone: "6000-0000" },
        container: { number: "MSCU1234567", size: "40", type: "HC", bookingReference: "BK-9" },
      }),
    ).toEqual({ contact: "Ana Pérez · 6000-0000", container: "MSCU1234567 · 40 · HC", booking: "BK-9" });
  });

  it.each([[null], [undefined], ["texto"], [42], [[]], [{}], [{ contact: 5, container: "x" }], [{ demo: true }]])(
    "devuelve null con %j",
    (input) => {
      expect(summarizeCargo(input)).toBeNull();
    },
  );

  it("recorta valores largos y colapsa espacios", () => {
    const result = summarizeCargo({ contact: { name: `  ${"a".repeat(200)}  b ` } });
    expect(result?.contact?.length).toBeLessThanOrEqual(60);
  });
});
