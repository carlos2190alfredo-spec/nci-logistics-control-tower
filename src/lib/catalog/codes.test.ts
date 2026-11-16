import { describe, expect, it } from "vitest";
import { CUSTOMER_CODE_PREFIX, createCodeAllocator, nextCodeFromExisting, uniqueSlugCode } from "./codes";

describe("nextCodeFromExisting", () => {
  it("empieza en 0001 cuando no hay códigos", () => {
    expect(nextCodeFromExisting([], "CLI-")).toBe("CLI-0001");
    expect(CUSTOMER_CODE_PREFIX).toBe("CLI-");
  });

  it("usa el MÁXIMO del sufijo, no la cantidad (un conteo chocaría tras un borrado)", () => {
    // Con count()+1 saldría CLI-0003, que ya existe como CLI-0007 + hueco: aquí debe ser 0008.
    expect(nextCodeFromExisting(["CLI-0001", "CLI-0007"], "CLI-")).toBe("CLI-0008");
    expect(nextCodeFromExisting(["CLI-0003"], "CLI-")).toBe("CLI-0004");
  });

  it("no depende del orden de la lista", () => {
    expect(nextCodeFromExisting(["CLI-0009", "CLI-0002", "CLI-0005"], "CLI-")).toBe("CLI-0010");
  });

  it("ignora el ruido: otros prefijos, sufijos no numéricos y cadenas raras", () => {
    const noise = ["CUST-1", "CLI-", "CLI-ABC", "CLI-12A", "XYZ-0100", "", "  ", "CLI-0002-b", "CLI--3", "CLI- 4"];
    expect(nextCodeFromExisting([...noise, "CLI-0003"], "CLI-")).toBe("CLI-0004");
    expect(nextCodeFromExisting(noise, "CLI-")).toBe("CLI-0001");
  });

  it("acepta códigos sin ceros a la izquierda y distingue la serie por prefijo", () => {
    expect(nextCodeFromExisting(["CLI-7", "VH-50"], "CLI-")).toBe("CLI-0008");
    expect(nextCodeFromExisting(["CLI-7", "VH-50"], "VH-")).toBe("VH-0051");
  });

  it("no distingue mayúsculas al leer los existentes (códigos antiguos en minúsculas siguen contando)", () => {
    expect(nextCodeFromExisting(["cli-0020"], "CLI-")).toBe("CLI-0021");
    expect(nextCodeFromExisting([" CLI-0030 "], "CLI-")).toBe("CLI-0031");
  });

  it("crece cuando el número necesita más dígitos que el relleno", () => {
    expect(nextCodeFromExisting(["CLI-9999"], "CLI-")).toBe("CLI-10000");
  });

  it("respeta un relleno distinto y un relleno de cero", () => {
    expect(nextCodeFromExisting(["EQ-009"], "EQ-", 3)).toBe("EQ-010");
    expect(nextCodeFromExisting([], "EQ-", 0)).toBe("EQ-1");
  });

  it("trata el prefijo como texto literal, no como expresión regular", () => {
    expect(nextCodeFromExisting(["EQ.5", "EQX9"], "EQ.")).toBe("EQ.0006");
  });

  it("ignora sufijos absurdamente largos para que un código importado no envenene la serie", () => {
    const poisoned = "CLI-" + "9".repeat(20);
    expect(nextCodeFromExisting([poisoned, "CLI-0005"], "CLI-")).toBe("CLI-0006");
  });

  it("es exacto con números grandes pero válidos (sin pérdida de precisión de coma flotante)", () => {
    expect(nextCodeFromExisting(["CLI-123456789012345"], "CLI-")).toBe("CLI-123456789012346");
  });

  it("el límite es exactamente 15 dígitos: con 15 el cálculo es exacto, con 16 el sufijo se ignora", () => {
    // 15 nueves + 1 = 10^15: exacto en coma flotante. Con 16 dígitos ya no habría garantía, así que se descarta.
    expect(nextCodeFromExisting(["CLI-999999999999999"], "CLI-")).toBe("CLI-1000000000000000");
    expect(nextCodeFromExisting(["CLI-1000000000000000"], "CLI-")).toBe("CLI-0001");
    expect(nextCodeFromExisting(["CLI-1000000000000000", "CLI-0042"], "CLI-")).toBe("CLI-0043");
  });

  it("tolera entradas que no son texto", () => {
    expect(nextCodeFromExisting([null as unknown as string, 5 as unknown as string, "CLI-0002"], "CLI-")).toBe("CLI-0003");
  });
});

describe("createCodeAllocator", () => {
  it("entrega códigos consecutivos a partir del máximo existente", () => {
    const next = createCodeAllocator(["CLI-0010", "CLI-0002"], "CLI-");
    expect([next(), next(), next()]).toEqual(["CLI-0011", "CLI-0012", "CLI-0013"]);
  });

  it("nunca repite un código, aunque se pidan muchos (importación de 1000 filas)", () => {
    const next = createCodeAllocator([], "CLI-");
    const codes = Array.from({ length: 1000 }, () => next());
    expect(new Set(codes).size).toBe(1000);
    expect(codes[0]).toBe("CLI-0001");
    expect(codes[999]).toBe("CLI-1000");
  });

  it("es independiente entre asignadores", () => {
    const a = createCodeAllocator(["CLI-0005"], "CLI-");
    const b = createCodeAllocator(["CLI-0005"], "CLI-");
    expect(a()).toBe("CLI-0006");
    expect(a()).toBe("CLI-0007");
    expect(b()).toBe("CLI-0006");
  });
});

describe("uniqueSlugCode", () => {
  it("devuelve la base si está libre", () => {
    expect(uniqueSlugCode("CARGA_REFRIGERADA", new Set())).toBe("CARGA_REFRIGERADA");
    expect(uniqueSlugCode("CARGA", new Set(["OTRA"]))).toBe("CARGA");
  });

  it("añade _2, _3… cuando la base está ocupada", () => {
    expect(uniqueSlugCode("CARGA", new Set(["CARGA"]))).toBe("CARGA_2");
    expect(uniqueSlugCode("CARGA", new Set(["CARGA", "CARGA_2"]))).toBe("CARGA_3");
    expect(uniqueSlugCode("CARGA", new Set(["CARGA", "CARGA_2", "CARGA_3", "CARGA_5"]))).toBe("CARGA_4");
  });

  it("no distingue mayúsculas al comparar con los ocupados", () => {
    expect(uniqueSlugCode("CARGA", new Set(["carga"]))).toBe("CARGA_2");
  });

  it("recorta la base para no superar 40 caracteres con el sufijo", () => {
    const base = "A".repeat(40);
    const second = uniqueSlugCode(base, new Set([base]));
    expect(second).toBe(`${"A".repeat(38)}_2`);
    expect(second).toHaveLength(40);

    const taken = new Set([base, second]);
    for (let n = 3; n <= 9; n += 1) taken.add(`${"A".repeat(38)}_${n}`);
    const tenth = uniqueSlugCode(base, taken);
    expect(tenth).toBe(`${"A".repeat(37)}_10`);
    expect(tenth).toHaveLength(40);
  });

  it("no deja un doble guion bajo cuando el recorte cae justo en un separador", () => {
    const base = `${"A".repeat(37)}_BC`; // 40 caracteres: el recorte a 38 deja "…A_" antes del sufijo
    const result = uniqueSlugCode(base, new Set([base]));
    expect(result).not.toContain("__");
    expect(result).toBe(`${"A".repeat(37)}_2`);
  });

  it("normaliza una base que no es un código válido", () => {
    expect(uniqueSlugCode("carga refrigerada", new Set())).toBe("CARGA_REFRIGERADA");
    expect(uniqueSlugCode("Z".repeat(60), new Set())).toHaveLength(40);
  });

  it("usa la alternativa cuando la base queda vacía", () => {
    expect(uniqueSlugCode("¿¡?!", new Set())).toBe("CODIGO");
    expect(uniqueSlugCode("", new Set(["CODIGO"]))).toBe("CODIGO_2");
    expect(uniqueSlugCode("", new Set(), "SERVICIO")).toBe("SERVICIO");
  });

  it("siempre devuelve un código libre y válido, incluso con muchos ocupados", () => {
    const taken = new Set<string>(["X"]);
    for (let n = 2; n <= 300; n += 1) taken.add(`X_${n}`);
    const result = uniqueSlugCode("X", taken);
    expect(result).toBe("X_301");
    expect(taken.has(result)).toBe(false);
  });
});
