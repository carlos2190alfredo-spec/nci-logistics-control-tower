import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma";
import {
  SERVICE_TYPE_TEMPLATES,
  findServiceTypeTemplate,
  templateToCreateData,
  templatesToLoad,
} from "./service-type-templates";

const seedSource = readFileSync(fileURLToPath(new URL("../../../prisma/seed.ts", import.meta.url)), "utf8");

/** Pares [código, nombre] del arreglo `serviceTypes` de prisma/seed.ts. */
function seededServiceTypes(): [string, string][] {
  const block = /const serviceTypes = \[([\s\S]*?)\] as const;/.exec(seedSource);
  if (!block) throw new Error("No se encontró el arreglo serviceTypes en prisma/seed.ts");
  return [...block[1].matchAll(/\[\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*\]/g)].map((m) => [m[1], m[2]]);
}

describe("SERVICE_TYPE_TEMPLATES", () => {
  it("son exactamente las cinco plantillas acordadas, en orden", () => {
    expect(SERVICE_TYPE_TEMPLATES.map((t) => [t.code, t.name, t.requiresEquipment])).toEqual([
      ["CONTAINER", "Transporte de contenedor", true],
      ["EMPTY_RETURN", "Retorno de contenedor vacío", true],
      ["FUEL", "Transporte de combustible", true],
      ["GENERAL", "Carga general", false],
      ["SPECIAL", "Carga terrestre o especial", true],
    ]);
  });

  it("los códigos y los nombres son únicos", () => {
    expect(new Set(SERVICE_TYPE_TEMPLATES.map((t) => t.code)).size).toBe(SERVICE_TYPE_TEMPLATES.length);
    expect(new Set(SERVICE_TYPE_TEMPLATES.map((t) => t.name)).size).toBe(SERVICE_TYPE_TEMPLATES.length);
  });

  it("los códigos son válidos como código de servicio (mayúsculas, dígitos y guion bajo, hasta 40)", () => {
    for (const template of SERVICE_TYPE_TEMPLATES) {
      expect(template.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(template.code.length).toBeLessThanOrEqual(40);
    }
  });

  it("exactamente un tipo no requiere equipo (carga general)", () => {
    const withoutEquipment = SERVICE_TYPE_TEMPLATES.filter((t) => !t.requiresEquipment);
    expect(withoutEquipment.map((t) => t.code)).toEqual(["GENERAL"]);
  });

  it("todas llevan los mismos documentos que el seed y una descripción útil", () => {
    for (const template of SERVICE_TYPE_TEMPLATES) {
      expect([...template.requiredDocs]).toEqual(["orden", "evidencia"]);
      expect(template.description.length).toBeGreaterThan(20);
    }
  });

  it("las descripciones aclaran si se requiere equipo, de acuerdo con la bandera", () => {
    for (const template of SERVICE_TYPE_TEMPLATES) {
      if (template.requiresEquipment) expect(template.description).toMatch(/Requiere un (chasis o )?equipo/);
      else expect(template.description).toMatch(/No requiere equipo/);
    }
  });
});

describe("coincidencia con prisma/seed.ts (los E2E y Driver.authorizations dependen de ello)", () => {
  it("cada tipo del seed existe como plantilla, con el mismo código y el mismo nombre al carácter", () => {
    const seeded = seededServiceTypes();
    expect(seeded.length).toBeGreaterThanOrEqual(3);
    for (const [code, name] of seeded) {
      const template = SERVICE_TYPE_TEMPLATES.find((t) => t.code === code);
      expect(template, `falta la plantilla ${code}`).toBeDefined();
      expect(template?.name).toBe(name);
    }
  });

  it("los tipos del seed son CONTAINER, FUEL y SPECIAL (si el seed cambia, hay que revisar las plantillas)", () => {
    expect(seededServiceTypes().map(([code]) => code)).toEqual(["CONTAINER", "FUEL", "SPECIAL"]);
  });

  it("los documentos requeridos del seed son los de las plantillas", () => {
    const match = /requiredDocs:\s*\[([^\]]*)\]/.exec(seedSource);
    expect(match).not.toBeNull();
    const docs = [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    for (const template of SERVICE_TYPE_TEMPLATES) expect([...template.requiredDocs]).toEqual(docs);
  });

  it("las autorizaciones de los conductores del seed apuntan a plantillas que existen", () => {
    const match = /authorizations:\s*\[([^\]]*)\]/.exec(seedSource);
    expect(match).not.toBeNull();
    const codes = [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(findServiceTypeTemplate(code)).toBeDefined();
  });
});

describe("templateToCreateData", () => {
  const template = SERVICE_TYPE_TEMPLATES[0];

  it("arma la fila a crear para la empresa indicada", () => {
    expect(templateToCreateData(template, "11111111-1111-4111-8111-111111111111")).toEqual({
      tenantId: "11111111-1111-4111-8111-111111111111",
      code: "CONTAINER",
      name: "Transporte de contenedor",
      active: true,
      requiresEquipment: true,
      optionalFields: {},
      requiredDocs: ["orden", "evidencia"],
    });
  });

  it("es compatible con el tipo de entrada de Prisma (comprobado al compilar)", () => {
    const data = templateToCreateData(SERVICE_TYPE_TEMPLATES[3], "t") satisfies Prisma.ServiceTypeUncheckedCreateInput;
    expect(data.requiresEquipment).toBe(false);
  });

  it("devuelve copias: modificar el resultado no altera la plantilla", () => {
    const data = templateToCreateData(template, "t");
    data.requiredDocs.push("extra");
    expect([...template.requiredDocs]).toEqual(["orden", "evidencia"]);
    expect(templateToCreateData(template, "t").requiredDocs).toEqual(["orden", "evidencia"]);
  });
});

describe("templatesToLoad", () => {
  it("devuelve todas las plantillas cuando la empresa no tiene ningún tipo", () => {
    expect(templatesToLoad([]).map((t) => t.code)).toEqual(["CONTAINER", "EMPTY_RETURN", "FUEL", "GENERAL", "SPECIAL"]);
  });

  it("excluye las que ya existen (sin distinguir mayúsculas ni espacios) y conserva el orden", () => {
    expect(templatesToLoad(["container", " FUEL "]).map((t) => t.code)).toEqual(["EMPTY_RETURN", "GENERAL", "SPECIAL"]);
  });

  it("no cuenta como existente un código parecido (CARGA-GENERAL no bloquea GENERAL)", () => {
    expect(templatesToLoad(["CARGA-GENERAL", "MUDANZA"])).toHaveLength(5);
  });

  it("respeta la selección de la persona y nunca ofrece una plantilla ya existente", () => {
    expect(templatesToLoad(["FUEL"], ["fuel", "general", "inexistente"]).map((t) => t.code)).toEqual(["GENERAL"]);
    expect(templatesToLoad([], [])).toEqual([]);
  });

  it("acepta cualquier iterable (por ejemplo un Set)", () => {
    expect(templatesToLoad(new Set(["CONTAINER"]), new Set(["CONTAINER", "GENERAL"])).map((t) => t.code)).toEqual(["GENERAL"]);
  });
});

describe("findServiceTypeTemplate", () => {
  it("encuentra por código sin distinguir mayúsculas y devuelve undefined si no existe", () => {
    expect(findServiceTypeTemplate("general")?.name).toBe("Carga general");
    expect(findServiceTypeTemplate("NOPE")).toBeUndefined();
  });
});
