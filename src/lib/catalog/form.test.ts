import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeFormFields, parseForm } from "./form";
import {
  customerInputSchema,
  equipmentInputSchema,
  newTripInputSchema,
  portalUserInputSchema,
  serviceTypeInputSchema,
  vehicleInputSchema,
} from "./schemas";

const ID_A = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const ID_B = "00000000-0000-4000-8000-000000000001";
const ID_C = "9d6c1c52-1f0e-4d7b-9a35-6a2b6f1a0c11";

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

function expectFailure<T extends { ok: boolean }>(result: T): Extract<T, { ok: false }> {
  if (result.ok) throw new Error("Debía fallar");
  return result as Extract<T, { ok: false }>;
}

function expectSuccess<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`Debía ser válido: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

describe("parseForm: lectura del formulario", () => {
  it("valida y normaliza un formulario correcto", () => {
    const result = expectSuccess(
      parseForm(customerInputSchema, form({ name: "  Acme   S.A. ", contactEmail: " ANA@X.CO ", taxId: "" })),
    );
    expect(result.data).toMatchObject({ name: "Acme S.A.", contactEmail: "ana@x.co", taxId: null });
  });

  it("solo lee los campos del esquema: los campos internos de Next y los inventados no cuentan", () => {
    const result = expectSuccess(
      parseForm(
        customerInputSchema,
        form({
          name: "Acme",
          "$ACTION_ID_abc123": "1",
          "$ACTION_REF_1": "",
          "1_$ACTION_KEY": "k",
          tenantId: ID_A, // intento de asignación masiva
          active: "false",
          __proto__: "x",
        }),
      ),
    );
    expect(Object.keys(result.data)).not.toContain("tenantId");
    expect(Object.keys(result.data)).not.toContain("active");
    expect(result.data.name).toBe("Acme");
  });

  it("un campo vacío o con solo espacios llega como undefined (obligatorio → error; opcional → null)", () => {
    expect(expectFailure(parseForm(customerInputSchema, form({ name: "" }))).fieldErrors.name).toBe("Escriba el nombre del cliente.");
    expect(expectFailure(parseForm(customerInputSchema, form({ name: "   \t " }))).fieldErrors.name).toBe(
      "Escriba el nombre del cliente.",
    );
    expect(expectSuccess(parseForm(customerInputSchema, form({ name: "Acme", address: "   " }))).data.address).toBeNull();
  });

  it("un campo vacío o en blanco ni siquiera llega al esquema (con un esquema que distingue '' de undefined)", () => {
    const probe = z.strictObject({ a: z.string().optional(), b: z.string().optional(), c: z.string().optional() });
    const result = expectSuccess(parseForm(probe, form({ a: "", b: "  \t ", c: "x" })));
    expect(result.data).toStrictEqual({ c: "x" });
    expect("a" in result.data).toBe(false);
    expect("b" in result.data).toBe(false);
  });

  it("ignora los archivos: un File en un campo de texto cuenta como ausente y no vuelve en values", () => {
    const data = new FormData();
    data.append("name", new File(["contenido"], "nombre.txt", { type: "text/plain" }));
    data.append("address", "Calle 1");
    const result = expectFailure(parseForm(customerInputSchema, data));
    expect(result.fieldErrors.name).toBe("Escriba el nombre del cliente.");
    expect(result.values).toEqual({ address: "Calle 1" });
  });

  it("anida los campos con punto (container.number)", () => {
    const result = expectSuccess(
      parseForm(
        newTripInputSchema,
        form({
          customerAccountId: ID_A,
          serviceTypeId: ID_B,
          origin: "Balboa",
          destination: "Colón",
          scheduledAt: "2026-11-20T14:00",
          clientRequestKey: ID_C,
          "container.number": "mscu 123",
          "container.terminal": "MIT",
        }),
      ),
    );
    expect(result.data.container).toEqual({ number: "MSCU123", terminal: "MIT", emptyReturnRequired: false });
  });

  it("sin ningún dato de contenedor, el viaje no lleva bloque de contenedor aunque la casilla esté desmarcada", () => {
    const result = expectSuccess(
      parseForm(
        newTripInputSchema,
        form({
          customerAccountId: ID_A,
          serviceTypeId: ID_B,
          origin: "Balboa",
          destination: "Colón",
          scheduledAt: "2026-11-20T14:00",
          clientRequestKey: ID_C,
        }),
      ),
    );
    expect(result.data.container).toBeUndefined();
  });

  it("acepta nombres planos de formulario con destino anidado mediante nested, y reporta los errores con ese nombre", () => {
    const fields = {
      customerAccountId: ID_A,
      serviceTypeId: ID_B,
      origin: "Balboa",
      destination: "Colón",
      scheduledAt: "2026-11-20T14:00",
      clientRequestKey: ID_C,
    };
    const nested = { containerNumber: "container.number", containerSeal: "container.sealNumber" };
    const ok = expectSuccess(parseForm(newTripInputSchema, form({ ...fields, containerNumber: "abc 1", containerSeal: "S-1" }), { nested }));
    expect(ok.data.container).toMatchObject({ number: "ABC1", sealNumber: "S-1" });

    const bad = expectFailure(parseForm(newTripInputSchema, form({ ...fields, containerSeal: "s".repeat(31) }), { nested }));
    expect(Object.keys(bad.fieldErrors)).toEqual(["containerSeal"]);
    expect(bad.fieldErrors.containerSeal).toBe("El número de sello no puede superar 30 caracteres.");
    expect(bad.values.containerSeal).toHaveLength(31);
  });

  it("si un nombre llega repetido (campo oculto + control), se usa el PRIMER valor de forma determinista", () => {
    const result = expectSuccess(parseForm(customerInputSchema, form({ name: ["Primero", "Segundo"] })));
    expect(result.data.name).toBe("Primero");
    const failure = expectFailure(parseForm(customerInputSchema, form({ name: ["", "Segundo"], contactEmail: ["mal", "bien@x.co"] })));
    expect(failure.values).toEqual({ name: "", contactEmail: "mal" });
  });
});

describe("parseForm: casillas de verificación", () => {
  it.each([["on"], ["true"], ["1"], ["yes"], ["si"], ["Sí"], [" ON "]])("%j marcada → true", (token) => {
    expect(expectSuccess(parseForm(serviceTypeInputSchema, form({ name: "Carga", requiresEquipment: token }))).data.requiresEquipment).toBe(
      true,
    );
  });

  it("una casilla desmarcada (ausente) vale false: nunca reactiva el valor por defecto true", () => {
    const result = expectSuccess(parseForm(serviceTypeInputSchema, form({ name: "Carga" })));
    expect(result.data.requiresEquipment).toBe(false);
  });

  it.each([["off"], ["false"], ["0"], ["no"], [""], ["quizás"]])("%j → false", (token) => {
    expect(expectSuccess(parseForm(serviceTypeInputSchema, form({ name: "Carga", requiresEquipment: token }))).data.requiresEquipment).toBe(
      false,
    );
  });

  it("con un campo oculto 'false' y la casilla marcada con el mismo nombre, gana la casilla", () => {
    const result = expectSuccess(parseForm(serviceTypeInputSchema, form({ name: "Carga", requiresEquipment: ["false", "on"] })));
    expect(result.data.requiresEquipment).toBe(true);
  });

  it("detecta solo las casillas del esquema, también las anidadas", () => {
    const fields = describeFormFields(newTripInputSchema).filter((field) => field.boolean);
    expect(fields).toEqual([{ path: "container.emptyReturnRequired", boolean: true }]);
    expect(describeFormFields(serviceTypeInputSchema).find((field) => field.path === "requiresEquipment")?.boolean).toBe(true);
  });

  it("opts.booleans cubre un campo que el esquema no declara como booleano", () => {
    const schema = z.strictObject({ aviso: z.preprocess((value) => value, z.boolean()) });
    expect(expectFailure(parseForm(schema, form({}))).fieldErrors).toHaveProperty("aviso"); // sin la opción: ausente → error
    expect(expectSuccess(parseForm(schema, form({ aviso: "on" }), { booleans: ["aviso"] })).data).toEqual({ aviso: true });
    expect(expectSuccess(parseForm(schema, form({}), { booleans: ["aviso"] })).data).toEqual({ aviso: false });
  });

  it("la casilla marcada vuelve en values como 'on' y la desmarcada no aparece", () => {
    const checked = expectFailure(parseForm(serviceTypeInputSchema, form({ name: "", requiresEquipment: "on" })));
    expect(checked.values).toEqual({ name: "", requiresEquipment: "on" });
    const unchecked = expectFailure(parseForm(serviceTypeInputSchema, form({ name: "" })));
    expect(unchecked.values).toEqual({ name: "" });
  });
});

describe("parseForm: errores", () => {
  it("el mensaje resumen nombra el primer campo con problema", () => {
    const result = expectFailure(parseForm(customerInputSchema, form({ name: "" })));
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Escriba el nombre del cliente.");
    expect(result.fieldErrors).toEqual({ name: "Escriba el nombre del cliente." });
  });

  it("el 'primer campo' lo marca el orden del esquema, no el del formulario enviado", () => {
    const result = expectFailure(parseForm(customerInputSchema, form({ contactEmail: "x", name: "" })));
    expect(result.message.startsWith("Escriba el nombre del cliente.")).toBe(true);
  });

  it("con varios errores añade cuántos campos más hay por revisar (singular y plural)", () => {
    const two = expectFailure(parseForm(customerInputSchema, form({ name: "", contactEmail: "x" })));
    expect(two.message).toBe("Escriba el nombre del cliente. Hay 1 campo más por revisar.");
    expect(Object.keys(two.fieldErrors)).toEqual(["name", "contactEmail"]);

    const four = expectFailure(parseForm(portalUserInputSchema, form({})));
    expect(four.message).toBe("Seleccione el cliente. Hay 3 campos más por revisar.");
    expect(Object.keys(four.fieldErrors)).toEqual(["customerAccountId", "name", "email", "role"]);
  });

  it("devuelve un solo mensaje por campo", () => {
    const result = expectFailure(parseForm(vehicleInputSchema, form({ plate: "--", code: "!!!" })));
    expect(Object.keys(result.fieldErrors).sort()).toEqual(["code", "plate"]);
    expect(typeof result.fieldErrors.plate).toBe("string");
  });

  it("si un campo falla por dos motivos, gana el PRIMER mensaje (el más importante), no el último", () => {
    // "ab" incumple a la vez el mínimo de 5 y el patrón de solo dígitos: Zod emite dos incidencias para `code`.
    const probe = z.strictObject({
      code: z.string().min(5, "Muy corto.").regex(/^\d+$/, "Solo dígitos."),
    });
    const result = expectFailure(parseForm(probe, form({ code: "ab" })));
    expect(result.fieldErrors).toEqual({ code: "Muy corto." });
    expect(result.message).toBe("Muy corto.");
  });

  it("values devuelve lo escrito tal cual (sin normalizar) para repintar el formulario", () => {
    const result = expectFailure(parseForm(customerInputSchema, form({ name: "  ", contactEmail: "  MAL ", address: "Calle  1" })));
    expect(result.values).toEqual({ name: "  ", contactEmail: "  MAL ", address: "Calle  1" });
  });

  it("values solo contiene cadenas de campos del esquema (nada de campos internos ni ajenos)", () => {
    const result = expectFailure(parseForm(customerInputSchema, form({ name: "", tenantId: ID_A, "$ACTION_ID_x": "1" })));
    expect(Object.keys(result.values)).toEqual(["name"]);
    for (const value of Object.values(result.values)) expect(typeof value).toBe("string");
  });

  it("acota el tamaño de lo que devuelve en values (una carga absurda no se refleja entera)", () => {
    const result = expectFailure(parseForm(customerInputSchema, form({ name: "n".repeat(100_000) })));
    expect(result.values.name.length).toBe(2000);
    expect(result.fieldErrors.name).toBe("El nombre del cliente no puede superar 120 caracteres.");
  });

  it("los errores del contenedor usan la ruta con punto como clave", () => {
    const result = expectFailure(
      parseForm(
        newTripInputSchema,
        form({
          customerAccountId: ID_A,
          serviceTypeId: ID_B,
          origin: "Balboa",
          destination: "Colón",
          scheduledAt: "2026-11-20T14:00",
          clientRequestKey: ID_C,
          "container.sealNumber": "s".repeat(31),
        }),
      ),
    );
    expect(Object.keys(result.fieldErrors)).toEqual(["container.sealNumber"]);
  });

  it("un select sin elegir y una fecha imposible se reportan en su campo", () => {
    const result = expectFailure(
      parseForm(
        newTripInputSchema,
        form({ customerAccountId: "", serviceTypeId: ID_B, origin: "Balboa", destination: "Colón", scheduledAt: "2026-02-31T10:00", clientRequestKey: ID_C }),
      ),
    );
    expect(result.fieldErrors.customerAccountId).toBe("Seleccione el cliente.");
    expect(result.fieldErrors.scheduledAt).toContain("no es válida");
  });
});

describe("parseForm: esquemas con transformación", () => {
  it("descubre los campos a través de la transformación y aplica los valores por defecto", () => {
    const result = expectSuccess(parseForm(vehicleInputSchema, form({ plate: " pan 101 ", "$ACTION_ID_z": "1" })));
    expect(result.data).toEqual({ plate: "PAN101", code: "PAN101", type: "Vehículo" });
  });

  it("equipos: el código se normaliza y el tipo toma el valor por defecto", () => {
    expect(expectSuccess(parseForm(equipmentInputSchema, form({ code: "ch 40" }))).data).toEqual({ code: "CH-40", type: "Equipo" });
  });
});

describe("parseForm: alias y casillas declaradas por quien llama", () => {
  // Un esquema que NO dice que `flag` sea booleano: solo `opts.booleans` lo convierte en casilla.
  const loose = z.strictObject({ flag: z.unknown().transform((value) => value) });

  it("opts.booleans puede nombrar el campo del esquema o el nombre plano del formulario", () => {
    const byPath = parseForm(loose, form({ flag: "on" }), { booleans: ["flag"] });
    expect(expectSuccess(byPath).data.flag).toBe(true);
    expect(expectSuccess(parseForm(loose, form({}), { booleans: ["flag"] })).data.flag).toBe(false);

    const alias = { myFlag: "flag" };
    // Con alias, la casilla se declara por el nombre del formulario...
    expect(expectSuccess(parseForm(loose, form({ myFlag: "on" }), { nested: alias, booleans: ["myFlag"] })).data.flag).toBe(true);
    expect(expectSuccess(parseForm(loose, form({}), { nested: alias, booleans: ["myFlag"] })).data.flag).toBe(false);
    // ...o por la ruta del esquema.
    expect(expectSuccess(parseForm(loose, form({ myFlag: "yes" }), { nested: alias, booleans: ["flag"] })).data.flag).toBe(true);
    expect(expectSuccess(parseForm(loose, form({}), { nested: alias, booleans: ["flag"] })).data.flag).toBe(false);
  });

  it("sin declararlo como casilla, un campo con alias se lee como texto (y ausente = no llega)", () => {
    expect(expectSuccess(parseForm(loose, form({ myFlag: "on" }), { nested: { myFlag: "flag" } })).data.flag).toBe("on");
    const missing = expectSuccess(parseForm(z.strictObject({ flag: z.string().optional() }), form({}), { nested: { myFlag: "flag" } }));
    expect(missing.data).toStrictEqual({});
  });
});

describe("parseForm: robustez (nunca lanza)", () => {
  it("un problema del objeto completo (no de un campo) se usa como mensaje pero no se inventa un campo", () => {
    const schema = z
      .strictObject({ a: z.string().optional() })
      .superRefine((_, ctx) => ctx.addIssue({ code: "custom", message: "Revise el formulario completo." }));
    const result = expectFailure(parseForm(schema, form({ a: "x" })));
    expect(result.message).toBe("Revise el formulario completo.");
    expect(result.fieldErrors).toEqual({});
    expect(Object.keys(result.fieldErrors)).not.toContain("");
    expect(result.values).toEqual({ a: "x" });
  });

  it("devuelve un error genérico en español si formData no es un FormData", () => {
    for (const bad of [null, undefined, {}, "texto", 42]) {
      const result = expectFailure(parseForm(customerInputSchema, bad as unknown as FormData));
      expect(result.message).toBe("No se pudo procesar el formulario. Revise los datos e inténtelo de nuevo.");
      expect(result.fieldErrors).toEqual({});
      expect(result.values).toEqual({});
    }
  });

  it("devuelve el error genérico si una transformación del esquema lanza", () => {
    const schema = z.strictObject({
      x: z.string().transform(() => {
        throw new Error("fallo interno");
      }),
    });
    const result = expectFailure(parseForm(schema, form({ x: "a" })));
    expect(result.message).toBe("No se pudo procesar el formulario. Revise los datos e inténtelo de nuevo.");
    expect(result.message).not.toContain("fallo interno");
  });

  it("no contamina Object.prototype aunque un alias apunte a una ruta peligrosa", () => {
    const schema = z.strictObject({ nombre: z.string().optional() });
    parseForm(schema, form({ evil: "1", nombre: "x" }), { nested: { evil: "__proto__.polluted" } });
    parseForm(schema, form({ evil: "1" }), { nested: { evil: "constructor.prototype.polluted" } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("describeFormFields", () => {
  it("un esquema que no es un objeto no declara campos", () => {
    expect(describeFormFields(z.string())).toEqual([]);
  });

  it("recorre objetos anidados, opcionales y valores por defecto", () => {
    const schema = z.strictObject({
      a: z.string(),
      b: z.boolean().default(true),
      c: z.strictObject({ d: z.string().optional(), e: z.boolean().optional() }).optional(),
    });
    expect(describeFormFields(schema)).toEqual([
      { path: "a", boolean: false },
      { path: "b", boolean: true },
      { path: "c.d", boolean: false },
      { path: "c.e", boolean: true },
    ]);
  });
});
