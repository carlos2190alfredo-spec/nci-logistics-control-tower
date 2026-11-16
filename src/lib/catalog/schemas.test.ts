import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { describeFormFields, parseForm } from "./form";
import {
  buildCargoDetails,
  type CustomerInput,
  type CustomerUpdateInput,
  type EquipmentInput,
  type EquipmentUpdateInput,
  type LocationInput,
  type ServiceTypeInput,
  type VehicleInput,
  type VehicleUpdateInput,
  customerInputSchema,
  customerUpdateSchema,
  equipmentInputSchema,
  equipmentUpdateSchema,
  isValidLocalDateTime,
  locationInputSchema,
  newTripInputSchema,
  parseCoordinate,
  portalUserInputSchema,
  safeParseInput,
  serviceTypeInputSchema,
  vehicleInputSchema,
  vehicleUpdateSchema,
} from "./schemas";

const ID_A = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const ID_B = "00000000-0000-4000-8000-000000000001";
const ID_C = "9d6c1c52-1f0e-4d7b-9a35-6a2b6f1a0c11";

const MINUS = String.fromCharCode(0x2212);
const ZWSP = String.fromCharCode(0x200b);
const EN_DASH = String.fromCharCode(0x2013);
/** "С" y "Н" cirílicas: se ven como la "C" y la "H" latinas pero son otras letras. */
const CYRILLIC_ES = String.fromCharCode(0x0421);
const CYRILLIC_EN = String.fromCharCode(0x041d);

/** Resultado de validar: datos o, si falla, mensaje por ruta (primer mensaje de cada ruta; "" = raíz). */
function check<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.output<S> } | { ok: false; errors: Record<string, string> } {
  const result = safeParseInput(schema, input);
  if (result.success) return { ok: true, data: result.data as z.output<S> };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    if (!(path in errors)) errors[path] = issue.message;
  }
  return { ok: false, errors };
}

function parseOk<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = check(schema, input);
  if (!result.ok) throw new Error(`Debía ser válido: ${JSON.stringify(result.errors)}`);
  return result.data;
}

function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = check(schema, input);
  if (result.ok) throw new Error(`Debía fallar: ${JSON.stringify(result.data)}`);
  return result.errors;
}

describe("customerInputSchema", () => {
  it("con solo el nombre, deja los demás campos en null y el código sin definir", () => {
    const data = parseOk(customerInputSchema, { name: "Acme" });
    expect(data).toEqual({
      name: "Acme",
      taxId: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      address: null,
      internalNotes: null,
    });
    expect(data.code).toBeUndefined();
  });

  it("normaliza todo lo que guarda: espacios, correo en minúsculas, notas con sus saltos de línea", () => {
    const data = parseOk(customerInputSchema, {
      name: "  Acme    Logística   S.A. ",
      taxId: " 155-704-928  DV 55 ",
      contactName: "  Ana  Pérez ",
      contactEmail: "  ANA@Acme.COM ",
      contactPhone: " 6000-0001 ",
      address: " Calle 50,  piso 3 ",
      internalNotes: "Pagan a 30 días.\r\n\r\n\r\n\r\nLlamar antes.",
    });
    expect(data).toEqual({
      name: "Acme Logística S.A.",
      taxId: "155-704-928 DV 55",
      contactName: "Ana Pérez",
      contactEmail: "ana@acme.com",
      contactPhone: "6000-0001",
      address: "Calle 50, piso 3",
      internalNotes: "Pagan a 30 días.\n\nLlamar antes.",
    });
  });

  it("los campos opcionales vacíos o con solo espacios salen como null (para poder borrar un valor al editar)", () => {
    const data = parseOk(customerInputSchema, { name: "Acme", taxId: "   ", contactEmail: "", address: ZWSP, internalNotes: "\n\n" });
    expect(data.taxId).toBeNull();
    expect(data.contactEmail).toBeNull();
    expect(data.address).toBeNull();
    expect(data.internalNotes).toBeNull();
  });

  it("el nombre es obligatorio y el mensaje lo nombra", () => {
    expect(errorsOf(customerInputSchema, {})).toEqual({ name: "Escriba el nombre del cliente." });
    expect(errorsOf(customerInputSchema, { name: "   " }).name).toBe("Escriba el nombre del cliente.");
    expect(errorsOf(customerInputSchema, { name: null }).name).toBe("Escriba el nombre del cliente.");
  });

  it("el nombre tiene entre 2 y 120 caracteres", () => {
    expect(errorsOf(customerInputSchema, { name: "A" }).name).toBe("El nombre del cliente debe tener al menos 2 caracteres.");
    expect(check(customerInputSchema, { name: "AB" }).ok).toBe(true);
    expect(check(customerInputSchema, { name: "a".repeat(120) }).ok).toBe(true);
    expect(errorsOf(customerInputSchema, { name: "a".repeat(121) }).name).toBe(
      "El nombre del cliente no puede superar 120 caracteres.",
    );
  });

  it("cuenta la longitud DESPUÉS de normalizar (los espacios sobrantes no cuentan)", () => {
    expect(check(customerInputSchema, { name: `${" ".repeat(50)}${"a".repeat(120)}${" ".repeat(50)}` }).ok).toBe(true);
  });

  it.each([
    ["taxId", 40, "El RUC o identificación fiscal no puede superar 40 caracteres."],
    ["contactName", 120, "El nombre de contacto no puede superar 120 caracteres."],
    ["contactPhone", 40, "El teléfono de contacto no puede superar 40 caracteres."],
    ["address", 300, "La dirección no puede superar 300 caracteres."],
    ["internalNotes", 1000, "Las notas internas no pueden superar 1000 caracteres."],
  ])("%s admite hasta %i caracteres y no uno más", (field, max, message) => {
    expect(check(customerInputSchema, { name: "Acme", [field]: "a".repeat(max) }).ok).toBe(true);
    expect(errorsOf(customerInputSchema, { name: "Acme", [field]: "a".repeat(max + 1) })[field]).toBe(message);
  });

  it("valida el correo: formato y largo máximo de 200", () => {
    for (const bad of ["no-es-correo", "a@b", "a b@c.com", "a@@c.com", "@c.com", "a@c."]) {
      expect(errorsOf(customerInputSchema, { name: "Acme", contactEmail: bad }).contactEmail, bad).toContain(
        "el correo de contacto con un formato válido",
      );
    }
    expect(check(customerInputSchema, { name: "Acme", contactEmail: "owner@panatruck.local" }).ok).toBe(true);
    const long = `${"a".repeat(190)}@ejemplo.com`; // 202 caracteres
    expect(errorsOf(customerInputSchema, { name: "Acme", contactEmail: long }).contactEmail).toBe(
      "El correo de contacto no puede superar 200 caracteres.",
    );
  });

  it("el correo admite EXACTAMENTE 200 caracteres y rechaza 201 (frontera inclusiva)", () => {
    const exact = `${"a".repeat(188)}@ejemplo.com`; // 188 + 12 = 200
    expect(exact).toHaveLength(200);
    expect(check(customerInputSchema, { name: "Acme", contactEmail: exact }).ok).toBe(true);
    const over = `${"a".repeat(189)}@ejemplo.com`;
    expect(over).toHaveLength(201);
    expect(errorsOf(customerInputSchema, { name: "Acme", contactEmail: over }).contactEmail).toBe(
      "El correo de contacto no puede superar 200 caracteres.",
    );
  });

  it("el código, si viene (importación CSV), se normaliza y se genera en otro caso", () => {
    expect(parseOk(customerInputSchema, { name: "Acme", code: " cli 7 " }).code).toBe("CLI-7");
    expect(parseOk(customerInputSchema, { name: "Acme", code: "   " }).code).toBeUndefined();
  });

  it("un código con solo símbolos se rechaza con un mensaje claro (no se ignora en silencio)", () => {
    expect(errorsOf(customerInputSchema, { name: "Acme", code: "***" }).code).toBe(
      "El código del cliente solo puede tener letras, números, punto, guion y guion bajo.",
    );
  });

  it("un código de más de 32 caracteres se rechaza en lugar de truncarse en silencio", () => {
    expect(check(customerInputSchema, { name: "Acme", code: "A".repeat(32) }).ok).toBe(true);
    expect(errorsOf(customerInputSchema, { name: "Acme", code: "A".repeat(33) }).code).toBe(
      "El código del cliente no puede superar 32 caracteres.",
    );
  });

  it("es estricto: un campo desconocido (p. ej. tenantId) es un error, no se ignora", () => {
    expect(errorsOf(customerInputSchema, { name: "Acme", tenantId: ID_A })).toEqual({
      "": "El formulario incluye campos que no se permiten.",
    });
    expect(errorsOf(customerInputSchema, { name: "Acme", active: false })[""]).toBeDefined();
  });

  it("no se deja engañar por __proto__ ni constructor en los datos", () => {
    const hostile = JSON.parse('{"name":"Acme","__proto__":{"admin":true}}');
    expect(check(customerInputSchema, hostile).ok).toBe(false);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it("si no llega un objeto, el mensaje no es técnico", () => {
    expect(errorsOf(customerInputSchema, "hola")[""]).toBe("No se recibieron los datos del formulario.");
    expect(errorsOf(customerInputSchema, null)[""]).toBe("No se recibieron los datos del formulario.");
  });

  it("un valor que no es texto produce un mensaje que nombra el campo", () => {
    expect(errorsOf(customerInputSchema, { name: 5 }).name).toBe("Revise el nombre del cliente.");
  });
});

describe("vehicleInputSchema", () => {
  it("normaliza la placa y por defecto el código es la placa y el tipo es 'Vehículo'", () => {
    expect(parseOk(vehicleInputSchema, { plate: " pan-101 " })).toEqual({
      plate: "PAN-101",
      code: "PAN-101",
      type: "Vehículo",
    });
    expect(parseOk(vehicleInputSchema, { plate: "ab 12 34" }).plate).toBe("AB1234");
  });

  it("devuelve exactamente las claves plate, code y type (sin claves sobrantes)", () => {
    expect(Object.keys(parseOk(vehicleInputSchema, { plate: "ABC123" })).sort()).toEqual(["code", "plate", "type"]);
  });

  it("un código explícito se normaliza y no se pisa con la placa; el tipo en blanco usa el valor por defecto", () => {
    expect(parseOk(vehicleInputSchema, { plate: "AB123", code: " unidad 7 ", type: "   " })).toEqual({
      plate: "AB123",
      code: "UNIDAD-7",
      type: "Vehículo",
    });
    expect(parseOk(vehicleInputSchema, { plate: "AB123", type: "  Tracto   camión " }).type).toBe("Tracto camión");
  });

  it("la placa es obligatoria", () => {
    expect(errorsOf(vehicleInputSchema, {})).toEqual({ plate: "Escriba la placa del vehículo." });
    expect(errorsOf(vehicleInputSchema, { plate: "  " }).plate).toBe("Escriba la placa del vehículo.");
  });

  it("la placa tiene entre 3 y 15 caracteres", () => {
    expect(errorsOf(vehicleInputSchema, { plate: "ab" }).plate).toBe("La placa del vehículo debe tener al menos 3 caracteres.");
    expect(check(vehicleInputSchema, { plate: "abc" }).ok).toBe(true);
    expect(check(vehicleInputSchema, { plate: "A".repeat(15) }).ok).toBe(true);
    expect(errorsOf(vehicleInputSchema, { plate: "A".repeat(16) }).plate).toBe(
      "La placa del vehículo no puede superar 15 caracteres.",
    );
  });

  it("la placa solo admite letras, números y guiones separando grupos", () => {
    for (const ok of ["ABC123", "123456", "AB-1234", "A-B-123", "pan-101"]) {
      expect(check(vehicleInputSchema, { plate: ok }).ok, ok).toBe(true);
    }
    for (const bad of ["AB.123", "AB#123", "AB_123", "-ABC", "ABC-", "AB--123", "---", "AB/123", "AB😀12"]) {
      expect(errorsOf(vehicleInputSchema, { plate: bad }).plate, bad).toBe(
        "La placa del vehículo solo puede tener letras, números y guiones (por ejemplo, ABC-123).",
      );
    }
  });

  it("acepta el guion tipográfico de Word y las tildes (se normalizan)", () => {
    expect(parseOk(vehicleInputSchema, { plate: `pan${String.fromCharCode(0x2013)}101` }).plate).toBe("PAN-101");
    expect(parseOk(vehicleInputSchema, { plate: "Áb-12" }).plate).toBe("AB-12");
  });

  it("el código admite hasta 32 caracteres y rechaza más", () => {
    expect(check(vehicleInputSchema, { plate: "ABC", code: "U".repeat(32) }).ok).toBe(true);
    expect(errorsOf(vehicleInputSchema, { plate: "ABC", code: "U".repeat(33) }).code).toBe(
      "El código del vehículo no puede superar 32 caracteres.",
    );
    expect(errorsOf(vehicleInputSchema, { plate: "ABC", code: "!!!" }).code).toContain("solo puede tener letras");
  });

  it("un código de una sola cifra es válido (número de unidad)", () => {
    expect(parseOk(vehicleInputSchema, { plate: "ABC", code: "7" }).code).toBe("7");
  });

  it("el tipo admite hasta 60 caracteres", () => {
    expect(check(vehicleInputSchema, { plate: "ABC", type: "t".repeat(60) }).ok).toBe(true);
    expect(errorsOf(vehicleInputSchema, { plate: "ABC", type: "t".repeat(61) }).type).toBe(
      "El tipo de vehículo no puede superar 60 caracteres.",
    );
  });

  it("es estricto con los campos desconocidos", () => {
    expect(errorsOf(vehicleInputSchema, { plate: "ABC", status: "AVAILABLE" })[""]).toBeDefined();
  });
});

describe("equipmentInputSchema", () => {
  it("normaliza el código y por defecto el tipo es 'Equipo'", () => {
    expect(parseOk(equipmentInputSchema, { code: " eq 5 " })).toEqual({ code: "EQ-5", type: "Equipo" });
    expect(parseOk(equipmentInputSchema, { code: "CH-1", type: "  Chasis   40'  " })).toEqual({
      code: "CH-1",
      type: "Chasis 40'",
    });
  });

  it("el código es obligatorio, de 2 a 32 caracteres, y no se trunca", () => {
    expect(errorsOf(equipmentInputSchema, {}).code).toBe("Escriba el código del equipo.");
    expect(errorsOf(equipmentInputSchema, { code: "e" }).code).toBe("El código del equipo debe tener al menos 2 caracteres.");
    expect(check(equipmentInputSchema, { code: "E".repeat(32) }).ok).toBe(true);
    expect(errorsOf(equipmentInputSchema, { code: "E".repeat(33) }).code).toBe(
      "El código del equipo no puede superar 32 caracteres.",
    );
  });

  it("un código con guiones sobrantes (principio, final o repetidos) llega limpio: lo que se valida es lo que se guarda", () => {
    expect(parseOk(equipmentInputSchema, { code: "eq-" }).code).toBe("EQ");
    expect(parseOk(equipmentInputSchema, { code: "-eq-1-" }).code).toBe("EQ-1");
    expect(parseOk(equipmentInputSchema, { code: "e  -  q" }).code).toBe("E-Q");
    // La longitud se mide DESPUÉS de limpiar: "e-" queda en una letra y no llega al mínimo de 2.
    expect(errorsOf(equipmentInputSchema, { code: "e-" }).code).toBe("El código del equipo debe tener al menos 2 caracteres.");
  });

  it("rechaza un código sin ningún carácter válido con un mensaje claro", () => {
    expect(errorsOf(equipmentInputSchema, { code: "###" }).code).toBe(
      "El código del equipo solo puede tener letras, números, punto, guion y guion bajo.",
    );
  });

  it("el tipo admite hasta 60 caracteres", () => {
    expect(errorsOf(equipmentInputSchema, { code: "EQ-1", type: "t".repeat(61) }).type).toBe(
      "El tipo de equipo no puede superar 60 caracteres.",
    );
  });
});

describe("locationInputSchema", () => {
  it("la dirección vacía se guarda como cadena vacía (la columna es obligatoria) y sin coordenadas son null", () => {
    expect(parseOk(locationInputSchema, { name: "  Puerto   de Balboa " })).toEqual({
      name: "Puerto de Balboa",
      address: "",
      latitude: null,
      longitude: null,
    });
  });

  it("el nombre es obligatorio (2–120) y la dirección admite hasta 300", () => {
    expect(errorsOf(locationInputSchema, {}).name).toBe("Escriba el nombre del lugar.");
    expect(errorsOf(locationInputSchema, { name: "P" }).name).toBe("El nombre del lugar debe tener al menos 2 caracteres.");
    expect(errorsOf(locationInputSchema, { name: "p".repeat(121) }).name).toBe(
      "El nombre del lugar no puede superar 120 caracteres.",
    );
    expect(check(locationInputSchema, { name: "Bodega", address: "d".repeat(300) }).ok).toBe(true);
    expect(errorsOf(locationInputSchema, { name: "Bodega", address: "d".repeat(301) }).address).toBe(
      "La dirección no puede superar 300 caracteres.",
    );
  });

  it("acepta coordenadas con punto o con coma decimal (Excel en español escribe 8,9824)", () => {
    expect(parseOk(locationInputSchema, { name: "Bodega", latitude: "8,9824", longitude: "-79,5199" })).toMatchObject({
      latitude: 8.9824,
      longitude: -79.5199,
    });
    expect(parseOk(locationInputSchema, { name: "Bodega", latitude: "8.9824", longitude: "-79.5199" })).toMatchObject({
      latitude: 8.9824,
      longitude: -79.5199,
    });
  });

  it("acepta el signo menos tipográfico y números ya convertidos", () => {
    expect(parseOk(locationInputSchema, { name: "Bodega", latitude: 8.98, longitude: `${MINUS}79.5` })).toMatchObject({
      latitude: 8.98,
      longitude: -79.5,
    });
  });

  it("los límites de latitud (±90) y longitud (±180) son inclusivos", () => {
    expect(check(locationInputSchema, { name: "Polo", latitude: "90", longitude: "180" }).ok).toBe(true);
    expect(check(locationInputSchema, { name: "Polo", latitude: "-90", longitude: "-180" }).ok).toBe(true);
    expect(errorsOf(locationInputSchema, { name: "Polo", latitude: "90.0001", longitude: "0" }).latitude).toBe(
      "La latitud debe estar entre -90 y 90.",
    );
    expect(errorsOf(locationInputSchema, { name: "Polo", latitude: "0", longitude: "-180.5" }).longitude).toBe(
      "La longitud debe estar entre -180 y 180.",
    );
  });

  it("exige ambas coordenadas o ninguna, y el error cae en el campo que falta", () => {
    expect(errorsOf(locationInputSchema, { name: "Bodega", latitude: "8.98" })).toEqual({
      longitude: "Indique también la longitud, porque con la latitud sola no se puede ubicar el lugar.",
    });
    expect(errorsOf(locationInputSchema, { name: "Bodega", longitude: "-79.5" })).toEqual({
      latitude: "Indique también la latitud, porque con la longitud sola no se puede ubicar el lugar.",
    });
    expect(check(locationInputSchema, { name: "Bodega", latitude: "", longitude: "  " }).ok).toBe(true);
  });

  it("no acepta texto, grados, notación científica ni valores no finitos como coordenada", () => {
    for (const bad of ["abc", "8.98N", "8°", "1e3", "NaN", "Infinity", "8.9.8", "8,9,8", "--5", "8 .9"]) {
      expect(errorsOf(locationInputSchema, { name: "Bodega", latitude: bad, longitude: "0" }).latitude, bad).toBe(
        "Escriba la latitud como un número con decimales, por ejemplo 8.9824.",
      );
    }
    expect(errorsOf(locationInputSchema, { name: "Bodega", latitude: Number.NaN, longitude: 0 }).latitude).toContain(
      "como un número con decimales",
    );
    expect(errorsOf(locationInputSchema, { name: "Bodega", latitude: Number.POSITIVE_INFINITY, longitude: 0 }).latitude).toContain(
      "como un número con decimales",
    );
  });

  it("el cero negativo se guarda como 0", () => {
    const data = parseOk(locationInputSchema, { name: "Ecuador", latitude: "-0", longitude: "-0.0" });
    expect(Object.is(data.latitude, 0)).toBe(true);
    expect(Object.is(data.longitude, 0)).toBe(true);
  });
});

describe("parseCoordinate", () => {
  it.each([
    ["8.9824", 8.9824],
    ["8,9824", 8.9824],
    ["+8.5", 8.5],
    ["-79.5", -79.5],
    [` ${MINUS}79,5 `, -79.5],
    ["0", 0],
    ["12", 12],
    [8.5, 8.5],
  ])("interpreta %j como %d", (raw, expected) => {
    expect(parseCoordinate(raw as string | number)).toBe(expected);
  });

  it.each([["", "empty"], ["   ", "empty"], ["x", "invalid"], ["1e3", "invalid"], [".5", "invalid"], ["5.", "invalid"], [Number.NaN, "invalid"]])(
    "clasifica %j como %s",
    (raw, expected) => {
      expect(parseCoordinate(raw as string | number)).toBe(expected);
    },
  );
});

describe("serviceTypeInputSchema", () => {
  it("normaliza el nombre y respeta requiresEquipment", () => {
    expect(parseOk(serviceTypeInputSchema, { name: "  Carga   refrigerada ", requiresEquipment: false })).toEqual({
      name: "Carga refrigerada",
      requiresEquipment: false,
    });
    expect(parseOk(serviceTypeInputSchema, { name: "Carga", requiresEquipment: true }).requiresEquipment).toBe(true);
  });

  it("si no se indica requiresEquipment, vale true (igual que la columna)", () => {
    expect(parseOk(serviceTypeInputSchema, { name: "Carga" }).requiresEquipment).toBe(true);
  });

  it("el nombre es obligatorio (2–80)", () => {
    expect(errorsOf(serviceTypeInputSchema, {}).name).toBe("Escriba el nombre del servicio.");
    expect(errorsOf(serviceTypeInputSchema, { name: "C" }).name).toBe("El nombre del servicio debe tener al menos 2 caracteres.");
    expect(check(serviceTypeInputSchema, { name: "n".repeat(80) }).ok).toBe(true);
    expect(errorsOf(serviceTypeInputSchema, { name: "n".repeat(81) }).name).toBe(
      "El nombre del servicio no puede superar 80 caracteres.",
    );
  });

  it("requiresEquipment solo acepta un booleano (la casilla la convierte parseForm)", () => {
    expect(errorsOf(serviceTypeInputSchema, { name: "Carga", requiresEquipment: "on" }).requiresEquipment).toBe(
      "Indique si el servicio requiere un equipo.",
    );
  });
});

describe("portalUserInputSchema", () => {
  const valid = { customerAccountId: ID_A, name: " Ana  Pérez ", email: " ANA@Cliente.COM ", role: "CUSTOMER_VIEWER" };

  it("normaliza el nombre y el correo, y respeta el rol", () => {
    expect(parseOk(portalUserInputSchema, valid)).toEqual({
      customerAccountId: ID_A,
      name: "Ana Pérez",
      email: "ana@cliente.com",
      role: "CUSTOMER_VIEWER",
    });
    expect(parseOk(portalUserInputSchema, { ...valid, role: "customer_admin" }).role).toBe("CUSTOMER_ADMIN");
  });

  it("no tiene campo de contraseña: enviar una es un error (la contraseña la define la persona con su enlace)", () => {
    expect(errorsOf(portalUserInputSchema, { ...valid, password: "x" })[""]).toBeDefined();
  });

  it("todos los campos son obligatorios y los mensajes los nombran", () => {
    expect(errorsOf(portalUserInputSchema, {})).toEqual({
      customerAccountId: "Seleccione el cliente.",
      name: "Escriba el nombre de la persona.",
      email: "Escriba el correo electrónico.",
      role: "Seleccione el tipo de acceso.",
    });
  });

  it("el identificador del cliente debe ser un UUID RFC estricto", () => {
    expect(check(portalUserInputSchema, { ...valid, customerAccountId: ID_B }).ok).toBe(true);
    expect(check(portalUserInputSchema, { ...valid, customerAccountId: ID_A.toUpperCase() }).ok).toBe(true);
    for (const bad of ["00000000-0000-0000-0000-000000000001", "abc", "3f2b8c1e9a4d4e6f8b7a1c2d3e4f5a6b", "1 OR 1=1", ID_A + "x"]) {
      expect(errorsOf(portalUserInputSchema, { ...valid, customerAccountId: bad }).customerAccountId, bad).toBe(
        "Elija una opción válida para el cliente.",
      );
    }
  });

  it("el identificador del cliente sale en minúsculas aunque llegue en mayúsculas (una sola forma canónica)", () => {
    expect(ID_A).toBe(ID_A.toLowerCase());
    expect(ID_A.toUpperCase()).not.toBe(ID_A);
    expect(parseOk(portalUserInputSchema, { ...valid, customerAccountId: ID_A.toUpperCase() }).customerAccountId).toBe(ID_A);
    expect(parseOk(portalUserInputSchema, { ...valid, customerAccountId: `  ${ID_A.toUpperCase()} ` }).customerAccountId).toBe(ID_A);
  });

  it("rechaza un rol fuera de la lista (no se puede crear un acceso de equipo desde aquí)", () => {
    for (const role of ["TENANT_OWNER", "DRIVER", "ADMIN", "", "CUSTOMER"]) {
      expect(check(portalUserInputSchema, { ...valid, role }).ok, role).toBe(false);
    }
    expect(errorsOf(portalUserInputSchema, { ...valid, role: "TENANT_OWNER" }).role).toBe(
      "Elija una opción válida para el tipo de acceso.",
    );
  });

  it("un rol vacío o en blanco pide elegir uno (no dice que la opción es inválida)", () => {
    for (const role of ["", "   "]) {
      expect(errorsOf(portalUserInputSchema, { ...valid, role }).role, JSON.stringify(role)).toBe("Seleccione el tipo de acceso.");
    }
  });

  it("valida el correo y el nombre", () => {
    expect(errorsOf(portalUserInputSchema, { ...valid, email: "nope" }).email).toContain("formato válido");
    expect(errorsOf(portalUserInputSchema, { ...valid, name: "A" }).name).toBe("El nombre de la persona debe tener al menos 2 caracteres.");
    expect(check(portalUserInputSchema, { ...valid, name: "n".repeat(100) }).ok).toBe(true);
    expect(errorsOf(portalUserInputSchema, { ...valid, name: "n".repeat(101) }).name).toBe(
      "El nombre de la persona no puede superar 100 caracteres.",
    );
  });
});

describe("isValidLocalDateTime", () => {
  it.each([
    "2026-11-20T14:00",
    "2026-11-20T14:00:30",
    "2026-11-20T00:00",
    "2026-11-20T23:59:59",
    "2028-02-29T10:00", // año bisiesto
    "2026-12-31T23:59",
    "2000-01-01T00:00",
    "2100-12-31T23:59",
  ])("acepta %s", (value) => {
    expect(isValidLocalDateTime(value)).toBe(true);
  });

  it.each([
    "2026-02-31T10:00",
    "2027-02-29T10:00", // no bisiesto
    "2026-04-31T10:00",
    "2026-13-01T10:00",
    "2026-00-10T10:00",
    "2026-11-00T10:00",
    "2026-11-20T24:00",
    "2026-11-20T14:60",
    "2026-11-20T14:00:60",
    "2026-11-20",
    "2026-11-20 14:00",
    "2026-11-20T14:00Z",
    "2026-11-20T14:00:00-05:00",
    "2026-11-20T14:00:00.000",
    "1999-12-31T23:59",
    "2101-01-01T00:00",
    "26-11-20T14:00",
    "",
    "mañana",
  ])("rechaza %j", (value) => {
    expect(isValidLocalDateTime(value)).toBe(false);
  });
});

describe("newTripInputSchema", () => {
  const base = {
    customerAccountId: ID_A,
    serviceTypeId: ID_B,
    origin: "  Puerto de Balboa ",
    destination: "Colón",
    scheduledAt: "2026-11-20T14:00",
    clientRequestKey: ID_C,
  };

  it("con los campos obligatorios aplica los valores por defecto", () => {
    expect(parseOk(newTripInputSchema, base)).toEqual({
      customerAccountId: ID_A,
      serviceTypeId: ID_B,
      origin: "Puerto de Balboa",
      destination: "Colón",
      scheduledAt: "2026-11-20T14:00",
      priority: "NORMAL",
      contactName: null,
      contactPhone: null,
      source: "OPERATIONS",
      notes: null,
      clientRequestKey: ID_C,
      container: undefined,
    });
  });

  it("acepta todos los campos y los normaliza", () => {
    const data = parseOk(newTripInputSchema, {
      ...base,
      priority: "urgent",
      contactName: "  Luis  Mora ",
      contactPhone: " 6000-1234 ",
      source: " whatsapp ",
      notes: "Portón azul.\r\n\r\n\r\nPreguntar por Luis.",
    });
    expect(data).toMatchObject({
      priority: "URGENT",
      contactName: "Luis Mora",
      contactPhone: "6000-1234",
      source: "WHATSAPP",
      notes: "Portón azul.\n\nPreguntar por Luis.",
    });
  });

  it("todos los obligatorios faltantes se nombran, en el orden del formulario", () => {
    const errors = errorsOf(newTripInputSchema, {});
    expect(errors).toEqual({
      customerAccountId: "Seleccione el cliente.",
      serviceTypeId: "Seleccione el tipo de servicio.",
      origin: "Escriba el origen del viaje.",
      destination: "Escriba el destino del viaje.",
      scheduledAt: "Indique la fecha y hora del servicio.",
      clientRequestKey: "El formulario venció. Recargue la página e inténtelo de nuevo.",
    });
    expect(Object.keys(errors)).toEqual([
      "customerAccountId",
      "serviceTypeId",
      "origin",
      "destination",
      "scheduledAt",
      "clientRequestKey",
    ]);
  });

  it("origen y destino tienen entre 2 y 200 caracteres", () => {
    expect(errorsOf(newTripInputSchema, { ...base, origin: "B" }).origin).toBe("El origen del viaje debe tener al menos 2 caracteres.");
    expect(check(newTripInputSchema, { ...base, origin: "o".repeat(200), destination: "d".repeat(200) }).ok).toBe(true);
    expect(errorsOf(newTripInputSchema, { ...base, destination: "d".repeat(201) }).destination).toBe(
      "El destino del viaje no puede superar 200 caracteres.",
    );
  });

  it("valida la fecha con calendario real y da un mensaje que la nombra", () => {
    expect(errorsOf(newTripInputSchema, { ...base, scheduledAt: "2026-02-31T10:00" }).scheduledAt).toBe(
      "La fecha y hora del servicio no es válida. Elija una fecha y una hora existentes.",
    );
    expect(errorsOf(newTripInputSchema, { ...base, scheduledAt: "2026-11-20T14:00:00-05:00" }).scheduledAt).toContain("no es válida");
    expect(check(newTripInputSchema, { ...base, scheduledAt: "2026-11-20T14:00:45" }).ok).toBe(true);
  });

  it("la prioridad y el canal solo admiten sus valores; PORTAL no es un canal elegible", () => {
    expect(errorsOf(newTripInputSchema, { ...base, priority: "HIGH" }).priority).toBe("Elija una opción válida para la prioridad.");
    expect(errorsOf(newTripInputSchema, { ...base, source: "PORTAL" }).source).toBe(
      "Elija una opción válida para el canal de la solicitud.",
    );
    for (const source of ["OPERATIONS", "PHONE", "WHATSAPP", "EMAIL", "WALK_IN"]) {
      expect(parseOk(newTripInputSchema, { ...base, source }).source).toBe(source);
    }
    expect(parseOk(newTripInputSchema, { ...base, priority: "", source: "   " })).toMatchObject({
      priority: "NORMAL",
      source: "OPERATIONS",
    });
  });

  it("los identificadores deben ser UUID estrictos", () => {
    expect(errorsOf(newTripInputSchema, { ...base, customerAccountId: "abc" }).customerAccountId).toBe(
      "Elija una opción válida para el cliente.",
    );
    expect(errorsOf(newTripInputSchema, { ...base, serviceTypeId: "00000000-0000-0000-0000-000000000001" }).serviceTypeId).toBe(
      "Elija una opción válida para el tipo de servicio.",
    );
    expect(errorsOf(newTripInputSchema, { ...base, clientRequestKey: "no-es-uuid" }).clientRequestKey).toBe(
      "El formulario venció. Recargue la página e inténtelo de nuevo.",
    );
  });

  it("los identificadores salen en minúsculas: la clave de idempotencia no se puede duplicar cambiando mayúsculas", () => {
    const upper = { ...base, customerAccountId: ID_A.toUpperCase(), serviceTypeId: ID_C.toUpperCase(), clientRequestKey: ID_C.toUpperCase() };
    expect(ID_A.toUpperCase()).not.toBe(ID_A);
    expect(ID_C.toUpperCase()).not.toBe(ID_C);
    expect(parseOk(newTripInputSchema, upper)).toMatchObject({
      customerAccountId: ID_A,
      serviceTypeId: ID_C,
      clientRequestKey: ID_C,
    });
    // "abc…" y "ABC…" producen EXACTAMENTE el mismo valor: un solo registro por clave en la base de datos.
    expect(parseOk(newTripInputSchema, upper).clientRequestKey).toBe(parseOk(newTripInputSchema, base).clientRequestKey);
  });

  it("contacto y notas respetan sus máximos (100 / 40 / 1000)", () => {
    expect(check(newTripInputSchema, { ...base, contactName: "c".repeat(100), contactPhone: "1".repeat(40), notes: "n".repeat(1000) }).ok).toBe(
      true,
    );
    expect(errorsOf(newTripInputSchema, { ...base, contactName: "c".repeat(101) }).contactName).toBe(
      "El nombre de contacto no puede superar 100 caracteres.",
    );
    expect(errorsOf(newTripInputSchema, { ...base, contactPhone: "1".repeat(41) }).contactPhone).toBe(
      "El teléfono de contacto no puede superar 40 caracteres.",
    );
    expect(errorsOf(newTripInputSchema, { ...base, notes: "n".repeat(1001) }).notes).toBe(
      "Las notas no pueden superar 1000 caracteres.",
    );
  });

  it("es estricto: tenantId, status o cualquier campo desconocido se rechaza", () => {
    for (const extra of [{ tenantId: ID_A }, { status: "CONFIRMED" }, { createdById: ID_A }, { reference: "X-1" }]) {
      expect(errorsOf(newTripInputSchema, { ...base, ...extra })[""]).toBe("El formulario incluye campos que no se permiten.");
    }
  });

  describe("contenedor", () => {
    it("sin ningún dato de contenedor, el resultado no lleva bloque de contenedor", () => {
      expect(parseOk(newTripInputSchema, base).container).toBeUndefined();
      expect(parseOk(newTripInputSchema, { ...base, container: {} }).container).toBeUndefined();
      expect(parseOk(newTripInputSchema, { ...base, container: { number: "  ", terminal: "", emptyReturnRequired: false } }).container).toBeUndefined();
    });

    it("la casilla 'devolver vacío' marcada, sola, sí cuenta como dato", () => {
      expect(parseOk(newTripInputSchema, { ...base, container: { emptyReturnRequired: true } }).container).toEqual({
        emptyReturnRequired: true,
      });
    });

    it("normaliza el contenedor y solo conserva las claves con valor; emptyReturnRequired siempre es booleano", () => {
      const data = parseOk(newTripInputSchema, {
        ...base,
        container: {
          number: " mscu 123456-7 ",
          size: " 40HC ",
          type: "  Dry ",
          shippingLine: " Naviera   Ejemplo ",
          terminal: " MIT ",
          sealNumber: " SEL-123 ",
          loadStatus: "loaded",
          emptyReturnRequired: false,
          bookingReference: " BKG-1 ",
        },
      });
      expect(data.container).toEqual({
        number: "MSCU123456-7",
        size: "40HC",
        type: "Dry",
        shippingLine: "Naviera Ejemplo",
        terminal: "MIT",
        sealNumber: "SEL-123",
        loadStatus: "LOADED",
        emptyReturnRequired: false,
        bookingReference: "BKG-1",
      });
      const partial = parseOk(newTripInputSchema, { ...base, container: { terminal: "MIT" } }).container;
      expect(partial).toEqual({ terminal: "MIT", emptyReturnRequired: false });
      expect(Object.keys(partial ?? {})).not.toContain("number");
    });

    it("los errores del contenedor llevan la ruta completa (container.campo) para marcar el campo correcto", () => {
      const errors = errorsOf(newTripInputSchema, {
        ...base,
        container: { number: "n".repeat(21), sealNumber: "s".repeat(31), loadStatus: "FULL" },
      });
      expect(errors).toEqual({
        "container.number": "El número de contenedor no puede superar 20 caracteres.",
        "container.sealNumber": "El número de sello no puede superar 30 caracteres.",
        "container.loadStatus": "Elija una opción válida para el estado de carga.",
      });
    });

    it("los máximos del contenedor son 20/20/40/80/80/30/60", () => {
      const limits: [string, number][] = [
        ["number", 20],
        ["size", 20],
        ["type", 40],
        ["shippingLine", 80],
        ["terminal", 80],
        ["sealNumber", 30],
        ["bookingReference", 60],
      ];
      for (const [field, max] of limits) {
        expect(check(newTripInputSchema, { ...base, container: { [field]: "x".repeat(max) } }).ok, field).toBe(true);
        expect(errorsOf(newTripInputSchema, { ...base, container: { [field]: "x".repeat(max + 1) } })[`container.${field}`], field).toContain(
          `no puede superar ${max} caracteres`,
        );
      }
    });

    it("rechaza campos desconocidos dentro del contenedor", () => {
      expect(errorsOf(newTripInputSchema, { ...base, container: { number: "ABC", weight: 5 } })["container"]).toBe(
        "El formulario incluye campos que no se permiten.",
      );
    });
  });
});

describe("buildCargoDetails", () => {
  const portalSource = readFileSync(fileURLToPath(new URL("../server/actions.ts", import.meta.url)), "utf8");

  /**
   * Claves de un bloque `nombre: { … }` dentro del `cargoDetails` que escribe el portal de clientes.
   * No depende de la sangría ni del formato: toma una ventana de texto desde `cargoDetails:` y busca el
   * primer bloque de ese nombre (sus valores son expresiones sin llaves propias).
   */
  function portalKeys(block: "contact" | "container"): string[] {
    const start = portalSource.indexOf("cargoDetails:");
    if (start === -1) throw new Error("No se encontró cargoDetails en createServiceRequestAction: ¿cambió su forma?");
    const inner = new RegExp(`\\b${block}:\\s*\\{([^{}]*)\\}`).exec(portalSource.slice(start, start + 2500));
    if (!inner) throw new Error(`No se encontró el bloque ${block} en cargoDetails del portal`);
    return [...inner[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();
  }

  const fullTrip = parseOk(newTripInputSchema, {
    customerAccountId: ID_A,
    serviceTypeId: ID_B,
    origin: "Balboa",
    destination: "Colón",
    scheduledAt: "2026-11-20T14:00",
    clientRequestKey: ID_C,
    contactName: "Luis",
    contactPhone: "6000-1234",
    container: {
      number: "MSCU1234567",
      size: "40HC",
      type: "Dry",
      shippingLine: "Naviera",
      terminal: "MIT",
      sealNumber: "S1",
      loadStatus: "EMPTY",
      emptyReturnRequired: true,
      bookingReference: "B1",
    },
  });

  it("produce la MISMA forma que el portal de clientes (mismas claves de contacto y de contenedor)", () => {
    const details = buildCargoDetails(fullTrip);
    expect(Object.keys(details).sort()).toEqual(["contact", "container"]);
    expect(Object.keys(details.contact).sort()).toEqual(portalKeys("contact"));
    expect(Object.keys(details.container ?? {}).sort()).toEqual(portalKeys("container"));
  });

  it("el estado de carga usa los mismos valores que valida el portal", () => {
    expect(portalSource).toMatch(/loadStatus:\s*z\.enum\(\[\s*"LOADED",\s*"EMPTY"\s*\]\)/);
    expect(buildCargoDetails(fullTrip).container?.loadStatus).toBe("EMPTY");
  });

  const minimalTrip = {
    customerAccountId: ID_A,
    serviceTypeId: ID_B,
    origin: "Balboa",
    destination: "Colón",
    scheduledAt: "2026-11-20T14:00",
    clientRequestKey: ID_C,
  };

  it("solo lleva los campos presentes: sin contenedor ni contacto queda { contact: {} } (nunca null ni cadenas vacías)", () => {
    const details = buildCargoDetails(parseOk(newTripInputSchema, minimalTrip));
    expect(details).toStrictEqual({ contact: {} });
    expect(JSON.stringify(details)).toBe('{"contact":{}}');
  });

  it("un contacto a medias solo lleva la mitad escrita", () => {
    const onlyName = buildCargoDetails(parseOk(newTripInputSchema, { ...minimalTrip, contactName: "Luis" }));
    expect(onlyName).toStrictEqual({ contact: { name: "Luis" } });
    const onlyPhone = buildCargoDetails(parseOk(newTripInputSchema, { ...minimalTrip, contactPhone: "6000-1234" }));
    expect(onlyPhone).toStrictEqual({ contact: { phone: "6000-1234" } });
  });

  it("nunca incluye datos de demostración ni campos que no sean contacto y contenedor", () => {
    const details = buildCargoDetails(fullTrip) as Record<string, unknown>;
    expect(Object.keys(details).sort()).toEqual(["contact", "container"]);
    expect(JSON.stringify(details)).not.toMatch(/demo/i);
  });

  it("devuelve una copia del contenedor: modificarla no altera la entrada", () => {
    const details = buildCargoDetails(fullTrip);
    if (details.container) details.container.number = "OTRO";
    expect(fullTrip.container?.number).toBe("MSCU1234567");
  });

  it("es serializable a JSON sin pérdidas (se guarda en una columna Json)", () => {
    const details = buildCargoDetails(fullTrip);
    expect(JSON.parse(JSON.stringify(details))).toEqual(details);
  });
});

describe("códigos: ningún símbolo se borra en silencio", () => {
  const SYMBOLS_MESSAGE = (what: string) => `El código del ${what} solo puede tener letras, números, punto, guion y guion bajo.`;

  it("equipo: CH/40/01 se rechaza en lugar de guardarse como CH4001", () => {
    for (const code of ["CH/40/01", "EQ#5", "A&B", "TRL (azul)", "chasis 40'", "50%", "a;b", "x@y"]) {
      expect(errorsOf(equipmentInputSchema, { code }).code, code).toBe(SYMBOLS_MESSAGE("equipo"));
    }
  });

  it("unidad de vehículo y código de cliente (CSV) aplican la misma regla, cada uno con su nombre en el mensaje", () => {
    expect(errorsOf(vehicleInputSchema, { plate: "ABC123", code: "U/12" }).code).toBe(SYMBOLS_MESSAGE("vehículo"));
    expect(errorsOf(customerInputSchema, { name: "Acme", code: "CLI/7" }).code).toBe(SYMBOLS_MESSAGE("cliente"));
  });

  it("las letras de otro alfabeto que se ven como latinas se rechazan (antes 'СН-40' se guardaba como '40')", () => {
    const lookalike = `${CYRILLIC_ES}${CYRILLIC_EN}-40`;
    expect(errorsOf(equipmentInputSchema, { code: lookalike }).code).toBe(SYMBOLS_MESSAGE("equipo"));
    expect(errorsOf(vehicleInputSchema, { plate: "ABC123", code: lookalike }).code).toBe(SYMBOLS_MESSAGE("vehículo"));
  });

  it("la comprobación llega antes que la longitud: un código largo con símbolos dice lo de los símbolos", () => {
    expect(errorsOf(equipmentInputSchema, { code: `${"A".repeat(40)}/` }).code).toBe(SYMBOLS_MESSAGE("equipo"));
  });

  it("lo que solo cambia de forma SÍ se acepta: mayúsculas, tildes, espacios, guion tipográfico, invisibles, punto y guion bajo", () => {
    expect(parseOk(equipmentInputSchema, { code: " ch 40.a_b-1 " }).code).toBe("CH-40.A_B-1");
    expect(parseOk(equipmentInputSchema, { code: "Chasís ñ1" }).code).toBe("CHASIS-N1");
    expect(parseOk(equipmentInputSchema, { code: `ch${EN_DASH}40` }).code).toBe("CH-40");
    expect(parseOk(equipmentInputSchema, { code: `ch${ZWSP}40` }).code).toBe("CH40");
    expect(parseOk(vehicleInputSchema, { plate: "ABC123", code: "u 12" }).code).toBe("U-12");
    expect(parseOk(customerInputSchema, { name: "Acme", code: " cli 7 " }).code).toBe("CLI-7");
  });

  it("un código vacío en un campo opcional sigue sin definirse (no es un símbolo)", () => {
    expect(parseOk(customerInputSchema, { name: "Acme", code: "" }).code).toBeUndefined();
    expect(parseOk(vehicleInputSchema, { plate: "ABC123", code: "  " }).code).toBe("ABC123");
  });
});

describe("esquemas de edición: el código es inmutable", () => {
  const sortedPaths = (schema: z.ZodType) => describeFormFields(schema).map((field) => field.path);

  it("customerUpdateSchema tiene los mismos campos que el alta MENOS el código", () => {
    expect(sortedPaths(customerInputSchema)).toContain("code");
    expect(sortedPaths(customerUpdateSchema)).toEqual(sortedPaths(customerInputSchema).filter((path) => path !== "code"));
  });

  it("customerUpdateSchema normaliza igual que el alta y rechaza un code enviado a mano", () => {
    const input = { name: " Acme  S.A. ", contactEmail: " A@B.CO ", internalNotes: "a\r\nb" };
    // El alta devuelve `code: undefined` (la acción lo genera): el resto de la salida es idéntico.
    expect(parseOk(customerUpdateSchema, input)).toEqual(parseOk(customerInputSchema, input));
    expect(parseOk(customerUpdateSchema, input)).toMatchObject({ name: "Acme S.A.", contactEmail: "a@b.co", internalNotes: "a\nb" });
    expect(Object.keys(parseOk(customerUpdateSchema, input))).not.toContain("code");
    expect(errorsOf(customerUpdateSchema, { name: "Acme", code: "CLI-9999" })[""]).toBe(
      "El formulario incluye campos que no se permiten.",
    );
  });

  it("vía parseForm, un code que un cliente malicioso añade al formulario de edición ni se lee", () => {
    const formData = new FormData();
    formData.set("name", "Acme");
    formData.set("code", "CLI-9999");
    formData.set("tenantId", ID_A);
    const parsed = parseForm(customerUpdateSchema, formData);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Object.keys(parsed.data)).not.toContain("code");
    // Con el esquema de alta, en cambio, el code sí entra (es lo que usa la importación CSV).
    const created = parseForm(customerInputSchema, formData);
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.data.code).toBe("CLI-9999");
  });

  it("vehicleUpdateSchema: solo placa y tipo; la placa se valida igual que en el alta", () => {
    expect(parseOk(vehicleUpdateSchema, { plate: " pan 102 ", type: "  Tracto  camión " })).toEqual({
      plate: "PAN102",
      type: "Tracto camión",
    });
    expect(Object.keys(parseOk(vehicleUpdateSchema, { plate: "ABC123" })).sort()).toEqual(["plate", "type"]);
    expect(parseOk(vehicleUpdateSchema, { plate: "ABC123" }).type).toBe("Vehículo");
    expect(errorsOf(vehicleUpdateSchema, {}).plate).toBe("Escriba la placa del vehículo.");
    expect(errorsOf(vehicleUpdateSchema, { plate: "AB#1" }).plate).toBe(
      "La placa del vehículo solo puede tener letras, números y guiones (por ejemplo, ABC-123).",
    );
    expect(errorsOf(vehicleUpdateSchema, { plate: "ABC123", type: "t".repeat(61) }).type).toBe(
      "El tipo de vehículo no puede superar 60 caracteres.",
    );
  });

  it("vehicleUpdateSchema no deja que un renombrado de placa arrastre el código (con el esquema de alta sí lo haría)", () => {
    // Con vehicleInputSchema, un código ausente se convierte en la placa NUEVA: usarlo al editar reescribiría el código.
    expect(parseOk(vehicleInputSchema, { plate: "NUEVA-1" }).code).toBe("NUEVA-1");
    expect(Object.keys(parseOk(vehicleUpdateSchema, { plate: "NUEVA-1" }))).not.toContain("code");
    expect(errorsOf(vehicleUpdateSchema, { plate: "NUEVA-1", code: "U-1" })[""]).toBe(
      "El formulario incluye campos que no se permiten.",
    );
    expect(sortedPaths(vehicleUpdateSchema)).toEqual(["plate", "type"]);
  });

  it("equipmentUpdateSchema: solo el tipo", () => {
    expect(parseOk(equipmentUpdateSchema, { type: " Cama  baja " })).toEqual({ type: "Cama baja" });
    expect(parseOk(equipmentUpdateSchema, {})).toEqual({ type: "Equipo" });
    expect(errorsOf(equipmentUpdateSchema, { type: "t".repeat(61) }).type).toBe("El tipo de equipo no puede superar 60 caracteres.");
    expect(errorsOf(equipmentUpdateSchema, { type: "Cama baja", code: "EQ-9" })[""]).toBe(
      "El formulario incluye campos que no se permiten.",
    );
    expect(sortedPaths(equipmentUpdateSchema)).toEqual(["type"]);
  });
});

// Comprobación EN COMPILACIÓN: los campos que producen los esquemas existen en las columnas de Prisma y
// son asignables a ellas. Si alguien agrega o renombra un campo de un lado sin el otro, `tsc` falla.
type NoExtraKeys<Output, Column> = Exclude<keyof Output, keyof Column> extends never ? true : false;
type Assert<T extends true> = T;
type _CustomerFits = Assert<NoExtraKeys<CustomerInput, Prisma.CustomerAccountUncheckedCreateInput>>;
type _CustomerUpdateFits = Assert<NoExtraKeys<CustomerUpdateInput, Prisma.CustomerAccountUncheckedUpdateInput>>;
type _VehicleFits = Assert<NoExtraKeys<VehicleInput, Prisma.VehicleUncheckedCreateInput>>;
type _VehicleUpdateFits = Assert<NoExtraKeys<VehicleUpdateInput, Prisma.VehicleUncheckedUpdateInput>>;
type _EquipmentFits = Assert<NoExtraKeys<EquipmentInput, Prisma.EquipmentUncheckedCreateInput>>;
type _EquipmentUpdateFits = Assert<NoExtraKeys<EquipmentUpdateInput, Prisma.EquipmentUncheckedUpdateInput>>;
type _LocationFits = Assert<NoExtraKeys<LocationInput, Prisma.LocationUncheckedCreateInput>>;
type _ServiceTypeFits = Assert<NoExtraKeys<ServiceTypeInput, Prisma.ServiceTypeUncheckedCreateInput>>;

describe("la salida de los esquemas encaja con las columnas de Prisma (comprobado al compilar)", () => {
  it("la salida se puede pasar tal cual a create/update junto con el tenantId que pone el servidor", () => {
    const customer = parseOk(customerInputSchema, { name: "Acme", contactEmail: "a@b.co" });
    const { code, ...customerFields } = customer;
    const customerRow = { tenantId: "t", code: code ?? "CLI-0001", ...customerFields } satisfies Prisma.CustomerAccountUncheckedCreateInput;
    const customerEdit = parseOk(customerUpdateSchema, { name: "Acme" }) satisfies Prisma.CustomerAccountUncheckedUpdateInput;

    const vehicleRow = { tenantId: "t", ...parseOk(vehicleInputSchema, { plate: "ABC123" }) } satisfies Prisma.VehicleUncheckedCreateInput;
    const vehicleEdit = parseOk(vehicleUpdateSchema, { plate: "ABC123" }) satisfies Prisma.VehicleUncheckedUpdateInput;
    const equipmentRow = { tenantId: "t", ...parseOk(equipmentInputSchema, { code: "EQ-1" }) } satisfies Prisma.EquipmentUncheckedCreateInput;
    const equipmentEdit = parseOk(equipmentUpdateSchema, {}) satisfies Prisma.EquipmentUncheckedUpdateInput;
    const locationRow = { tenantId: "t", ...parseOk(locationInputSchema, { name: "Patio" }) } satisfies Prisma.LocationUncheckedCreateInput;
    const serviceRow = {
      tenantId: "t",
      code: "X",
      ...parseOk(serviceTypeInputSchema, { name: "Servicio" }),
    } satisfies Prisma.ServiceTypeUncheckedCreateInput;

    expect(customerRow).toMatchObject({ tenantId: "t", code: "CLI-0001", name: "Acme", taxId: null });
    expect(customerEdit.name).toBe("Acme");
    expect(vehicleRow).toEqual({ tenantId: "t", plate: "ABC123", code: "ABC123", type: "Vehículo" });
    expect(vehicleEdit).toEqual({ plate: "ABC123", type: "Vehículo" });
    expect(equipmentRow).toEqual({ tenantId: "t", code: "EQ-1", type: "Equipo" });
    expect(equipmentEdit).toEqual({ type: "Equipo" });
    expect(locationRow).toEqual({ tenantId: "t", name: "Patio", address: "", latitude: null, longitude: null });
    expect(serviceRow).toEqual({ tenantId: "t", code: "X", name: "Servicio", requiresEquipment: true });
  });
});

describe("safeParseInput", () => {
  it("usa mensajes de reserva en español sin tocar la configuración global de Zod", () => {
    const schema = z.string().min(3);
    const spanish = safeParseInput(schema, "a");
    expect(spanish.success).toBe(false);
    if (!spanish.success) expect(spanish.error.issues[0].message).not.toMatch(/Too small|Invalid/);
    // Fuera de safeParseInput, Zod sigue en inglés: la configuración global no se modificó.
    const plain = schema.safeParse("a");
    expect(plain.success).toBe(false);
    if (!plain.success) expect(plain.error.issues[0].message).toMatch(/Too small/);
  });
});

describe("todos los esquemas: mensajes y estabilidad", () => {
  const schemas: [string, z.ZodType][] = [
    ["customer", customerInputSchema],
    ["customerUpdate", customerUpdateSchema],
    ["vehicle", vehicleInputSchema],
    ["vehicleUpdate", vehicleUpdateSchema],
    ["equipment", equipmentInputSchema],
    ["equipmentUpdate", equipmentUpdateSchema],
    ["location", locationInputSchema],
    ["serviceType", serviceTypeInputSchema],
    ["portalUser", portalUserInputSchema],
    ["newTrip", newTripInputSchema],
  ];

  const garbage: unknown[] = [
    undefined,
    null,
    "",
    "   ",
    0,
    5,
    -1,
    true,
    false,
    {},
    [],
    ["a"],
    "x".repeat(5000),
    "<script>alert(1)</script>",
    "'; DROP TABLE customers; --",
    "NaN",
    "\u0000",
  ];

  /** Construye un objeto con SOLO ese campo (ruta con punto) asignado a `value`. */
  function only(path: string, value: unknown): Record<string, unknown> {
    const segments = path.split(".");
    const root: Record<string, unknown> = {};
    let cursor = root;
    segments.slice(0, -1).forEach((segment) => {
      const next: Record<string, unknown> = {};
      cursor[segment] = next;
      cursor = next;
    });
    cursor[segments[segments.length - 1]] = value;
    return root;
  }

  const TECHNICAL = /Invalid|Required|Expected|expected|Too (small|big)|received|Entrada inválida|se esperaba|recibido|Llave desconocida|undefined|NaN|\[object/;

  // Recorre cada campo con ~17 valores hostiles: con la máquina cargada supera con holgura los 5 s por defecto.
  it.each(schemas)("%s: ningún valor basura produce un mensaje técnico, en inglés o vacío", { timeout: 60_000 }, (_name, schema) => {
    const fields = describeFormFields(schema);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      for (const value of garbage) {
        const result = safeParseInput(schema, only(field.path, value));
        if (result.success) continue;
        for (const issue of result.error.issues) {
          expect(issue.message.trim(), `${field.path} = ${JSON.stringify(value)}`).not.toBe("");
          expect(issue.message, `${field.path} = ${JSON.stringify(value)}`).not.toMatch(TECHNICAL);
        }
      }
    }
  });

  it.each(schemas)("%s: el objeto vacío falla con mensajes que terminan en punto y no repiten el mismo texto", (_name, schema) => {
    const result = safeParseInput(schema, {});
    if (result.success) return; // serviceType exige solo el nombre; todos fallan salvo que no haya obligatorios
    const messages = result.error.issues.map((issue) => issue.message);
    for (const message of messages) expect(message).toMatch(/\.$/);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("la salida de cada esquema vuelve a validarse a sí misma sin cambios (normalización idempotente)", () => {
    const samples: [z.ZodType, unknown][] = [
      [customerInputSchema, { name: " Acme  S.A. ", contactEmail: "A@B.CO", internalNotes: "a\r\n\r\n\r\nb", code: " cli 3 " }],
      [customerUpdateSchema, { name: " Acme  S.A. ", contactEmail: "A@B.CO", internalNotes: "a\r\n\r\n\r\nb" }],
      [vehicleInputSchema, { plate: "pan 101", code: "u 7" }],
      [vehicleUpdateSchema, { plate: "pan 101", type: "  Tracto  camión " }],
      [equipmentInputSchema, { code: " eq 5 ", type: "  Chasis " }],
      [equipmentUpdateSchema, { type: "  Chasis " }],
      [locationInputSchema, { name: " Bodega ", address: " Calle  1 ", latitude: "8,98", longitude: "-79,5" }],
      [serviceTypeInputSchema, { name: " Carga  X ", requiresEquipment: false }],
      [portalUserInputSchema, { customerAccountId: ID_A, name: " Ana ", email: " A@B.CO ", role: "CUSTOMER_ADMIN" }],
      [
        newTripInputSchema,
        {
          customerAccountId: ID_A,
          serviceTypeId: ID_B,
          origin: " Balboa ",
          destination: " Colón ",
          scheduledAt: "2026-11-20T14:00",
          clientRequestKey: ID_C,
          notes: "a\r\n\r\n\r\nb",
          container: { number: "mscu 12", emptyReturnRequired: true },
        },
      ],
    ];
    for (const [schema, input] of samples) {
      const once = parseOk(schema, input);
      expect(parseOk(schema, once)).toEqual(once);
    }
  });

  it("describeFormFields descubre campos en cada esquema, también los envueltos en una transformación", () => {
    expect(describeFormFields(vehicleInputSchema).map((f) => f.path)).toEqual(["plate", "code", "type"]);
    expect(describeFormFields(newTripInputSchema).map((f) => f.path)).toContain("container.sealNumber");
    expect(describeFormFields(locationInputSchema).map((f) => f.path)).toEqual(["name", "address", "latitude", "longitude"]);
  });
});
