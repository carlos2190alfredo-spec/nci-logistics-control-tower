import { describe, expect, it } from "vitest";
import { getUsageState, USAGE_WARNING_RATIO } from "@/components/ui/usage-bar";

describe("getUsageState (límites del plan)", () => {
  it("por debajo del 90 % no avisa", () => {
    expect(getUsageState(0, 10)).toEqual({ percent: 0, level: "ok", statusText: null });
    expect(getUsageState(8, 10)).toEqual({ percent: 80, level: "ok", statusText: null });
    // El umbral anterior de la página de Configuración era 80 %: ahora 80–89 % sigue en azul.
    expect(getUsageState(5, 6)).toEqual({ percent: 83, level: "ok", statusText: null });
  });

  it("desde el 90 % advierte en texto: 'Cerca del límite'", () => {
    expect(getUsageState(9, 10)).toEqual({ percent: 90, level: "warning", statusText: "Cerca del límite" });
    expect(getUsageState(49, 50)).toEqual({ percent: 98, level: "warning", statusText: "Cerca del límite" });
    expect(getUsageState(99, 100)).toEqual({ percent: 99, level: "warning", statusText: "Cerca del límite" });
  });

  it("el nivel usa la razón exacta, no el porcentaje redondeado (89,6 % NO es advertencia)", () => {
    // 17/19 = 89,47 % redondea a 89; 52/58 = 89,66 % redondea a 90 pero sigue por debajo del umbral.
    expect(getUsageState(17, 19).level).toBe("ok");
    const nearlyNinety = getUsageState(52, 58);
    expect(nearlyNinety.percent).toBe(90);
    expect(nearlyNinety.level).toBe("ok");
    expect(nearlyNinety.statusText).toBeNull();
  });

  it("al 100 % es peligro: 'Límite alcanzado'", () => {
    expect(getUsageState(3, 3)).toEqual({ percent: 100, level: "danger", statusText: "Límite alcanzado" });
    expect(getUsageState(10, 10).level).toBe("danger");
  });

  it("por encima del límite (plan reducido) es peligro, la barra no se desborda y el texto lo dice", () => {
    expect(getUsageState(12, 10)).toEqual({ percent: 100, level: "danger", statusText: "Límite superado" });
    expect(getUsageState(1000, 3).percent).toBe(100);
  });

  it("un límite 0 no deja cupo: cuenta como alcanzado (no divide por cero)", () => {
    expect(getUsageState(0, 0)).toEqual({ percent: 100, level: "danger", statusText: "Límite alcanzado" });
    expect(getUsageState(2, 0)).toEqual({ percent: 100, level: "danger", statusText: "Límite superado" });
  });

  it("valores no válidos (NaN, negativos) no rompen el cálculo", () => {
    expect(getUsageState(Number.NaN, 10)).toEqual({ percent: 0, level: "ok", statusText: null });
    expect(getUsageState(-5, 10)).toEqual({ percent: 0, level: "ok", statusText: null });
    // Un límite ilegible no se interpreta como "sin límite": se trata como sin cupo.
    expect(getUsageState(3, Number.NaN).level).toBe("danger");
  });

  it("el umbral publicado es el 90 % de la especificación", () => {
    expect(USAGE_WARNING_RATIO).toBe(0.9);
  });
});
