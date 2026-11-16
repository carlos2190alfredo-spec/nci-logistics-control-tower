import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/export/csv";
import { parseCsv } from "./csv";
import {
  EXAMPLE_ROW_WARNING,
  IMPORT_COLUMNS,
  IMPORT_KINDS,
  IMPORT_KIND_LABEL,
  IMPORT_TEMPLATES,
  isImportKind,
  mapHeaders,
  validateImport,
  type ImportKind,
} from "./catalogs";

const BOM = String.fromCharCode(0xfeff);

function run<K extends ImportKind>(kind: K, csv: string) {
  const parsed = parseCsv(csv);
  if (!parsed.ok) throw new Error(`El CSV de la prueba no se pudo leer: ${parsed.error}`);
  return validateImport(kind, parsed);
}

describe("IMPORT_KIND_LABEL e isImportKind", () => {
  it("las etiquetas son las acordadas", () => {
    expect(IMPORT_KIND_LABEL).toEqual({
      customers: "Clientes",
      vehicles: "Vehículos",
      equipment: "Equipos",
      locations: "Lugares",
    });
    expect([...IMPORT_KINDS]).toEqual(["customers", "vehicles", "equipment", "locations"]);
  });

  it("isImportKind solo acepta los cuatro tipos", () => {
    for (const kind of IMPORT_KINDS) expect(isImportKind(kind)).toBe(true);
    for (const bad of ["users", "Customers", "", null, undefined, 3, ["customers"]]) expect(isImportKind(bad)).toBe(false);
  });
});

describe("IMPORT_COLUMNS y mapHeaders", () => {
  it("cada tipo tiene las columnas obligatorias acordadas", () => {
    const required = (kind: ImportKind) => IMPORT_COLUMNS[kind].filter((c) => c.required).map((c) => c.key);
    expect(required("customers")).toEqual(["name"]);
    expect(required("vehicles")).toEqual(["plate"]);
    expect(required("equipment")).toEqual(["code"]);
    expect(required("locations")).toEqual(["name"]);
  });

  it("ningún alias (oficial o tolerante) pertenece a dos columnas del mismo tipo", () => {
    for (const kind of IMPORT_KINDS) {
      const owner = new Map<string, string>();
      for (const col of IMPORT_COLUMNS[kind]) {
        for (const alias of [...col.aliases, ...col.alsoAccepts]) {
          const mapped = mapHeaders(kind, [alias]);
          expect(Object.keys(mapped.mapping), `${kind}: ${alias}`).toEqual([col.key]);
          const key = alias.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
          expect(owner.get(key) ?? col.key, `${kind}: alias repetido ${alias}`).toBe(col.key);
          owner.set(key, col.key);
        }
      }
    }
  });

  it("los alias oficiales son los acordados y no se pierden al añadir otros", () => {
    const official = (kind: ImportKind, key: string) => IMPORT_COLUMNS[kind].find((col) => col.key === key)?.aliases;
    expect(official("customers", "name")).toEqual(["nombre", "razón social", "cliente", "empresa", "name"]);
    expect(official("customers", "taxId")).toEqual(["ruc", "tax id", "nit", "identificación"]);
    expect(official("vehicles", "code")).toEqual(["unidad", "código", "code", "número"]);
    expect(official("equipment", "code")).toEqual(["código", "code", "número", "chasis"]);
    expect(official("locations", "longitude")).toEqual(["longitud", "lng", "lon"]);
  });

  it.each([
    ["customers", ["Nombre del cliente", "NOMBRE CLIENTE", "Company", "Customer"], "name"],
    ["customers", ["Código del cliente", "Código cliente"], "code"],
    ["customers", ["Cédula", "RUC / Cédula", "RUC/Cédula", "Identificación fiscal", "ID fiscal"], "taxId"],
    ["customers", ["Nombre de contacto", "Persona de contacto", "Contact name"], "contactName"],
    ["customers", ["Correo electrónico", "correo electronico", "Correo de contacto", "Email de contacto", "Mail"], "contactEmail"],
    ["customers", ["Teléfono de contacto", "Teléfono contacto", "Móvil"], "contactPhone"],
    ["customers", ["Dirección fiscal", "Domicilio"], "address"],
    ["customers", ["Comentarios", "Observación", "Notes"], "internalNotes"],
    ["vehicles", ["Matrícula", "Número de placa", "Placa del vehículo", "License plate"], "plate"],
    ["vehicles", ["Número de unidad", "Código de unidad", "Unit"], "code"],
    ["vehicles", ["Tipo de vehículo", "Vehicle type"], "type"],
    ["equipment", ["Código de equipo", "Número de equipo", "Número de chasis", "Equipo", "Chassis"], "code"],
    ["equipment", ["Tipo de equipo", "Equipment type"], "type"],
    ["locations", ["Nombre del lugar", "Lugar", "Place", "Location"], "name"],
    ["locations", ["Dirección del lugar", "Domicilio"], "address"],
    ["locations", ["Latitude"], "latitude"],
    ["locations", ["Longitude", "Long"], "longitude"],
  ] as const)("%s: encabezados habituales de otras herramientas, %j, se reconocen como %s", (kind, headers, key) => {
    for (const header of headers) {
      expect(mapHeaders(kind, [header]).mapping, header).toEqual({ [key]: 0 });
    }
  });

  it("un archivo típico exportado de otra herramienta se importa completo sin tocar los encabezados", () => {
    const customers = run(
      "customers",
      "Nombre del cliente;RUC / Cédula;Nombre de contacto;Correo electrónico;Teléfono de contacto\nAcme S.A.;1-234-567;Ana;ANA@acme.com;6000-1111\n",
    );
    expect(customers.headerIssues).toEqual([]);
    expect(customers.ignoredColumns).toEqual([]);
    expect(customers.valid[0].data).toMatchObject({
      name: "Acme S.A.",
      taxId: "1-234-567",
      contactName: "Ana",
      contactEmail: "ana@acme.com",
      contactPhone: "6000-1111",
    });
    const places = run("locations", "Lugar,Latitude,Longitude\nPuerto,9.35,-79.9\n");
    expect(places.valid[0].data).toMatchObject({ name: "Puerto", latitude: 9.35, longitude: -79.9 });
    const vehicles = run("vehicles", "Matrícula,Número de unidad,Tipo de vehículo\nab 123,U-7,Pickup\n");
    expect(vehicles.valid[0].data).toEqual({ plate: "AB123", code: "U-7", type: "Pickup" });
  });

  it("un encabezado ambiguo (dos columnas para lo mismo) sigue rechazándose aunque venga de los alias tolerantes", () => {
    const result = mapHeaders("customers", ["Correo", "Correo electrónico"]);
    expect(result.mapping).toEqual({ contactEmail: 0 });
    expect(result.duplicates).toEqual(["Correo"]);
  });

  it.each([
    ["customers", ["Nombre", "NOMBRE", "Razón Social", "razon_social", "RAZON-SOCIAL", "Cliente", "Empresa", "Name"], "name"],
    ["customers", ["Código", "CODIGO", "code"], "code"],
    ["customers", ["RUC", "ruc", "Tax ID", "tax_id", "NIT", "Identificación", "identificacion"], "taxId"],
    ["customers", ["Contacto", "Nombre contacto", "nombre_contacto"], "contactName"],
    ["customers", ["Correo", "Email", "E-mail", "e_mail", "CORREO"], "contactEmail"],
    ["customers", ["Teléfono", "telefono", "Tel", "Celular", "Phone"], "contactPhone"],
    ["customers", ["Dirección", "direccion", "Address"], "address"],
    ["customers", ["Notas", "Observaciones"], "internalNotes"],
    ["vehicles", ["Placa", "PLACA", "plate"], "plate"],
    ["vehicles", ["Unidad", "Código", "Code", "Número", "numero"], "code"],
    ["vehicles", ["Tipo", "Type"], "type"],
    ["equipment", ["Código", "Code", "Número", "Chasis", "CHASIS"], "code"],
    ["equipment", ["Tipo", "type"], "type"],
    ["locations", ["Nombre", "Name"], "name"],
    ["locations", ["Dirección", "Address"], "address"],
    ["locations", ["Latitud", "lat", "LAT"], "latitude"],
    ["locations", ["Longitud", "lng", "Lon", "LNG"], "longitude"],
  ] as const)("%s: %j se reconocen como %s", (kind, headers, key) => {
    for (const header of headers) {
      expect(mapHeaders(kind, [header]).mapping, header).toEqual({ [key]: 0 });
    }
  });

  it("ignora asteriscos, puntos, dos puntos, espacios y aclaraciones entre paréntesis", () => {
    expect(mapHeaders("customers", ["Nombre *"]).mapping).toEqual({ name: 0 });
    expect(mapHeaders("customers", ["Teléfono (celular)"]).mapping).toEqual({ contactPhone: 0 });
    expect(mapHeaders("vehicles", ["  Placa:  "]).mapping).toEqual({ plate: 0 });
    expect(mapHeaders("customers", ["Razón   social."]).mapping).toEqual({ name: 0 });
  });

  it("devuelve la posición de cada columna, los encabezados desconocidos y las obligatorias que faltan", () => {
    const result = mapHeaders("vehicles", ["Color", "Placa", "", "Tipo", "Año"]);
    expect(result.mapping).toEqual({ plate: 1, type: 3 });
    expect(result.unknown).toEqual(["Color", "Año"]); // los encabezados vacíos no cuentan como desconocidos
    expect(result.missingRequired).toEqual([]);
    expect(result.duplicates).toEqual([]);

    expect(mapHeaders("vehicles", ["Tipo"]).missingRequired).toEqual(["Placa"]);
    expect(mapHeaders("equipment", []).missingRequired).toEqual(["Código"]);
  });

  it("dos columnas que significan lo mismo se reportan como repetidas y gana la primera", () => {
    const result = mapHeaders("customers", ["Nombre", "Cliente", "RUC", "Tax ID"]);
    expect(result.mapping).toEqual({ name: 0, taxId: 2 });
    expect(result.duplicates).toEqual(["Nombre", "RUC"]);
  });

  it("un encabezado que no es de este tipo no se confunde (los equipos no entienden 'placa')", () => {
    expect(mapHeaders("equipment", ["Placa"]).mapping).toEqual({});
    expect(mapHeaders("equipment", ["Placa"]).missingRequired).toEqual(["Código"]);
  });
});

describe("validateImport: encabezados", () => {
  it("falta una columna obligatoria: un solo problema claro, sin validar filas", () => {
    const result = run("vehicles", "Nombre,Tipo\nA,B\nC,D\n");
    expect(result.headerIssues).toEqual(["Falta la columna obligatoria «Placa». Nombres que se aceptan: placa, plate."]);
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.totalRows).toBe(2);
    expect(result.ignoredColumns).toEqual(["Nombre"]);
  });

  it("una columna repetida es un problema de encabezado (la importación sería ambigua)", () => {
    const result = run("customers", "Nombre,Cliente\nAcme,Acme\n");
    expect(result.headerIssues).toEqual([
      "La columna «Nombre» aparece más de una vez en el encabezado, escrita como «Nombre» y «Cliente». Deje solo una.",
    ]);
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it("si la columna repetida se escribió igual (o solo cambia el uso de mayúsculas), el aviso no la repite", () => {
    const same = "La columna «Nombre» aparece más de una vez en el encabezado. Deje solo una.";
    expect(run("customers", "Nombre,Nombre\nAcme,Acme\n").headerIssues).toEqual([same]);
    expect(run("customers", "Nombre,NOMBRE,nombre\nAcme,Acme,Acme\n").headerIssues).toEqual([same]);
  });

  it("dice cómo escribió la persona cada columna repetida (el caso real: «Código» y «Número» son la misma «Unidad»)", () => {
    expect(run("vehicles", "Placa,Código,Número\nAB-123,U1,U1\n").headerIssues).toEqual([
      "La columna «Unidad» aparece más de una vez en el encabezado, escrita como «Código» y «Número». Deje solo una.",
    ]);
    expect(run("vehicles", "Unidad,Placa,Código,Número\nU1,AB-123,U1,U1\n").headerIssues).toEqual([
      "La columna «Unidad» aparece más de una vez en el encabezado, escrita como «Unidad», «Código» y «Número». Deje solo una.",
    ]);
  });

  it("con varias columnas repetidas, un aviso por cada una y en el orden en que aparecen en el archivo", () => {
    const result = run("customers", "RUC,Cliente,Tax ID,Nombre\n1,Acme,1,Acme\n");
    expect(result.headerIssues).toEqual([
      "La columna «RUC» aparece más de una vez en el encabezado, escrita como «RUC» y «Tax ID». Deje solo una.",
      "La columna «Nombre» aparece más de una vez en el encabezado, escrita como «Cliente» y «Nombre». Deje solo una.",
    ]);
  });

  it("mapHeaders entrega el detalle de cada columna repetida, con los encabezados tal como se escribieron", () => {
    const result = mapHeaders("vehicles", ["Placa", "  Código ", "Número"]);
    expect(result.duplicates).toEqual(["Unidad"]);
    expect(result.duplicateDetails).toEqual([{ label: "Unidad", headers: ["Código", "Número"] }]);
    expect(mapHeaders("vehicles", ["Placa", "Tipo"]).duplicateDetails).toEqual([]);
  });

  it("las columnas desconocidas no bloquean: se ignoran y se informan", () => {
    const result = run("vehicles", "Placa,Color,Año\nAB-123,Rojo,2020\n");
    expect(result.headerIssues).toEqual([]);
    expect(result.ignoredColumns).toEqual(["Color", "Año"]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data).toEqual({ plate: "AB-123", code: "AB-123", type: "Vehículo" });
  });

  it("el nombre de la columna obligatoria que falta es el oficial y no depende de cómo se escriba el resto", () => {
    expect(run("customers", "RUC\n1\n").headerIssues[0]).toContain("«Nombre»");
    expect(run("locations", "Dirección\nX\n").headerIssues[0]).toContain("«Nombre»");
    expect(run("equipment", "Tipo\nX\n").headerIssues[0]).toContain("«Código»");
  });
});

describe("validateImport: clientes", () => {
  it("normaliza cada campo con las mismas reglas que el formulario", () => {
    const result = run(
      "customers",
      "Razón Social;RUC;Contacto;E-mail;Tel;Dirección;Observaciones\n  Acme   Logística  ;155-1 DV 5;Ana  Pérez; ANA@Acme.COM ;6000-0001;Calle 50;Paga a 30 días\n",
    );
    expect(result.headerIssues).toEqual([]);
    expect(result.valid).toEqual([
      {
        line: 2,
        data: {
          name: "Acme Logística",
          taxId: "155-1 DV 5",
          contactName: "Ana Pérez",
          contactEmail: "ana@acme.com",
          contactPhone: "6000-0001",
          address: "Calle 50",
          internalNotes: "Paga a 30 días",
        },
      },
    ]);
  });

  it("el código es opcional: si viene se normaliza; si no, queda sin definir para que el servidor lo genere", () => {
    const result = run("customers", "Nombre,Código\nAcme,\nBeta, cli 7 \n");
    expect(result.valid[0].data.code).toBeUndefined();
    expect(result.valid[1].data.code).toBe("CLI-7");
  });

  it("cada error empieza con el nombre de la columna tal como la escribió la persona", () => {
    const result = run("customers", "Razón social,E-mail\n,x@y.co\nAcme,no-es-correo\n");
    expect(result.invalid).toEqual([
      { line: 2, errors: ["Razón social: Escriba el nombre del cliente."], raw: ["", "x@y.co"] },
      {
        line: 3,
        errors: ["E-mail: Escriba el correo de contacto con un formato válido, por ejemplo nombre@empresa.com."],
        raw: ["Acme", "no-es-correo"],
      },
    ]);
  });

  it("una fila con varios problemas los lista todos, una vez cada uno", () => {
    const result = run("customers", `Nombre,Correo,Código\nA,mal,***\n`);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].errors).toEqual([
      "Nombre: El nombre del cliente debe tener al menos 2 caracteres.",
      "Correo: Escriba el correo de contacto con un formato válido, por ejemplo nombre@empresa.com.",
      "Código: El código del cliente solo puede tener letras, números, punto, guion y guion bajo.",
    ]);
  });

  it("detecta el mismo nombre dos veces (sin distinguir mayúsculas ni tildes) y apunta a la primera línea", () => {
    const result = run("customers", "Nombre\nIndustrias Colón\nBeta\nINDUSTRIAS COLON\n  industrias   colón \n");
    expect(result.valid.map((row) => row.line)).toEqual([2, 3]);
    expect(result.invalid).toEqual([
      { line: 4, errors: ["Repetido: ya aparece en la línea 2 (Nombre)."], raw: ["INDUSTRIAS COLON"] },
      { line: 5, errors: ["Repetido: ya aparece en la línea 2 (Nombre)."], raw: ["industrias   colón"] },
    ]);
    expect(result.duplicatesInFile).toBe(2);
  });

  it("detecta el mismo código dos veces aunque se escriba distinto", () => {
    const result = run("customers", "Nombre,Código\nAcme,CLI-0005\nBeta,cli 0005\nGama,CLI-0006\n");
    expect(result.valid.map((row) => row.data.name)).toEqual(["Acme", "Gama"]);
    expect(result.invalid[0].errors).toEqual(["Repetido: ya aparece en la línea 2 (Código)."]);
    expect(result.duplicatesInFile).toBe(1);
  });

  it("nombres parecidos pero distintos no son repetidos", () => {
    const result = run("customers", "Nombre\nAcme S.A.\nAcme SA\nAcme Sur\n");
    expect(result.valid).toHaveLength(3);
    expect(result.duplicatesInFile).toBe(0);
  });

  it("una fila inválida por otro motivo NO reclama el nombre: la versión corregida de más abajo sí se importa", () => {
    const result = run("customers", "Nombre,Correo\nAcme,roto\nAcme,ok@acme.com\n");
    expect(result.invalid.map((row) => row.line)).toEqual([2]);
    expect(result.invalid[0].errors[0]).toContain("Correo:");
    expect(result.valid.map((row) => row.line)).toEqual([3]);
    expect(result.duplicatesInFile).toBe(0);
  });

  it("las filas válidas e inválidas conservan el orden del archivo y los números de línea reales", () => {
    const result = run("customers", 'Nombre\n"Acme\nSur"\n\nBeta\nA\nGama\n');
    expect(result.valid.map((row) => [row.line, row.data.name])).toEqual([
      [2, "Acme Sur"],
      [5, "Beta"],
      [7, "Gama"],
    ]);
    expect(result.invalid.map((row) => row.line)).toEqual([6]);
    expect(result.totalRows).toBe(4);
  });

  it("una fila con más celdas que el encabezado se rechaza (una coma sin comillas desplazaría las columnas)", () => {
    const result = run("customers", "Nombre,Dirección,Teléfono\nAcme,Calle 1, piso 2,6000-0001\nBeta,Calle 2,6000-0002\n");
    expect(result.valid.map((row) => row.data.name)).toEqual(["Beta"]);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].line).toBe(2);
    expect(result.invalid[0].errors[0]).toContain("entre comillas");
    expect(result.invalid[0].raw).toEqual(["Acme", "Calle 1", "piso 2"]);
  });

  it("una fila con menos celdas se acepta con un aviso", () => {
    const result = run("customers", "Nombre,Dirección,Teléfono\nAcme,Calle 1\n");
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].warnings).toEqual(["La fila tiene 2 celdas y el encabezado 3; se completó con celdas vacías."]);
    expect(result.valid[0].data.contactPhone).toBeNull();
  });

  it("una fila con celdas sobrantes VACÍAS se importa con aviso (no se pierde ningún dato)", () => {
    const result = run("customers", "Nombre,Dirección\nAcme,Calle 1,,\nBeta,Calle 2\n");
    expect(result.invalid).toEqual([]);
    expect(result.valid.map((row) => row.data.name)).toEqual(["Acme", "Beta"]);
    expect(result.valid[0].warnings).toEqual([
      "La fila tiene 4 celdas y el encabezado 2; se ignoraron las celdas sobrantes, que estaban vacías.",
    ]);
    expect(result.valid[1].warnings).toBeUndefined();
  });

  it("un valor que parece una fórmula se importa como texto tal cual (la protección está en la exportación)", () => {
    const result = run("customers", 'Nombre,Notas\nAcme,"=1+1"\n');
    expect(result.valid[0].data.internalNotes).toBe("=1+1");
  });
});

describe("validateImport: vehículos", () => {
  it("la unidad por defecto es la placa y el tipo por defecto es 'Vehículo'", () => {
    const result = run("vehicles", "Placa,Unidad,Tipo\nab-123,,\nCD 456,U-9,Tracto camión\n");
    expect(result.valid.map((row) => row.data)).toEqual([
      { plate: "AB-123", code: "AB-123", type: "Vehículo" },
      { plate: "CD456", code: "U-9", type: "Tracto camión" },
    ]);
  });

  it("detecta la misma placa escrita distinto (espacios, minúsculas)", () => {
    const result = run("vehicles", "Placa\nAB123\nab 123\nab-123\n");
    expect(result.valid.map((row) => row.data.plate)).toEqual(["AB123", "AB-123"]);
    expect(result.invalid).toEqual([{ line: 3, errors: ["Repetido: ya aparece en la línea 2 (Placa)."], raw: ["ab 123"] }]);
  });

  it("detecta una unidad que choca con la unidad por defecto (la placa) de otra fila", () => {
    const result = run("vehicles", "Placa,Unidad\nAB-123,\nZZ-999,AB-123\n");
    expect(result.valid).toHaveLength(1);
    expect(result.invalid[0].errors).toEqual(["Repetido: ya aparece en la línea 2 (Unidad)."]);
  });

  it("dos filas con la misma placa son repetidas aunque el resto de datos cambie", () => {
    const result = run("vehicles", "Placa,Tipo\nAB-123,Camión\nAB-123,Cabezal\n");
    expect(result.duplicatesInFile).toBe(1);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data.type).toBe("Camión");
  });

  it("los errores usan el nombre de columna del archivo ('Plate') y el mensaje del esquema", () => {
    const result = run("vehicles", "Plate\nA\n###\n\n");
    expect(result.invalid.map((row) => row.errors)).toEqual([
      ["Plate: La placa del vehículo debe tener al menos 3 caracteres."],
      ["Plate: La placa del vehículo solo puede tener letras, números y guiones (por ejemplo, ABC-123)."],
    ]);
  });

  it("una placa en blanco en medio del archivo se reporta en su línea", () => {
    const result = run("vehicles", "Placa,Tipo\nAB-123,Camión\n,Cabezal\n");
    expect(result.invalid).toEqual([{ line: 3, errors: ["Placa: Escriba la placa del vehículo."], raw: ["", "Cabezal"] }]);
  });
});

describe("validateImport: equipos", () => {
  it("normaliza el código, acepta 'Chasis' como encabezado y usa 'Equipo' como tipo por defecto", () => {
    const result = run("equipment", "Chasis;Tipo\nch 40;\nCH-41;Plataforma\n");
    expect(result.valid.map((row) => row.data)).toEqual([
      { code: "CH-40", type: "Equipo" },
      { code: "CH-41", type: "Plataforma" },
    ]);
  });

  it("detecta códigos repetidos y rechaza los demasiado cortos o largos", () => {
    const result = run("equipment", `Código\nEQ-1\neq 1\nE\n${"X".repeat(33)}\n`);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid.map((row) => row.errors[0])).toEqual([
      "Repetido: ya aparece en la línea 2 (Código).",
      "Código: El código del equipo debe tener al menos 2 caracteres.",
      "Código: El código del equipo no puede superar 32 caracteres.",
    ]);
  });
});

describe("validateImport: lugares", () => {
  it("lee coordenadas con coma decimal (Excel en español) y deja null las que no están", () => {
    const result = run("locations", 'Nombre;Dirección;Latitud;Longitud\nPuerto de Balboa;Av. Balboa;"8,9556";"-79,5667"\nBodega Norte;;;\n');
    expect(result.valid.map((row) => row.data)).toEqual([
      { name: "Puerto de Balboa", address: "Av. Balboa", latitude: 8.9556, longitude: -79.5667 },
      { name: "Bodega Norte", address: "", latitude: null, longitude: null },
    ]);
  });

  it("lee un valor que el exportador del sistema protegió con apóstrofo (toCsv convierte '-79.5' en texto)", () => {
    const text = toCsv([{ n: "Puerto", lat: 8.95, lng: -79.56 }], [
      { header: "Nombre", value: (r) => r.n },
      { header: "Latitud", value: (r) => r.lat },
      { header: "Longitud", value: (r) => r.lng },
    ]);
    expect(text).toContain("'-79.56"); // el exportador sí antepone el apóstrofo
    const result = run("locations", text);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data).toMatchObject({ latitude: 8.95, longitude: -79.56 });
  });

  it("una sola coordenada se rechaza y el error nombra la columna que falta", () => {
    const result = run("locations", "Nombre,Latitud,Longitud\nPuerto,8.9,\n");
    expect(result.invalid).toEqual([
      {
        line: 2,
        errors: ["Longitud: Indique también la longitud, porque con la latitud sola no se puede ubicar el lugar."],
        raw: ["Puerto", "8.9", ""],
      },
    ]);
  });

  it("si la columna de la coordenada que falta no existe en el archivo, el error usa su nombre oficial", () => {
    const result = run("locations", "Nombre,Latitud\nPuerto,8.9\n");
    expect(result.invalid[0].errors).toEqual([
      "Longitud: Indique también la longitud, porque con la latitud sola no se puede ubicar el lugar.",
    ]);
  });

  it("rechaza coordenadas con texto o fuera de rango, con el nombre de la columna", () => {
    const result = run("locations", "Nombre,Lat,Lng\nA1,8.9N,10\nB1,100,10\n");
    expect(result.invalid.map((row) => row.errors)).toEqual([
      ["Lat: Escriba la latitud como un número con decimales, por ejemplo 8.9824."],
      ["Lat: La latitud debe estar entre -90 y 90."],
    ]);
  });

  it("detecta el mismo nombre de lugar sin distinguir mayúsculas ni tildes", () => {
    const result = run("locations", "Nombre\nPuerto de Colón\npuerto de colon\nPuerto Balboa\n");
    expect(result.valid.map((row) => row.data.name)).toEqual(["Puerto de Colón", "Puerto Balboa"]);
    expect(result.invalid[0].errors).toEqual(["Repetido: ya aparece en la línea 2 (Nombre)."]);
  });
});

describe("validateImport: encabezados hostiles", () => {
  it("un encabezado larguísimo con miles de paréntesis sin cerrar no se vuelve cuadrático", () => {
    const started = Date.now();
    const mapped = mapHeaders("customers", ["(".repeat(200_000), `Nombre${"(".repeat(100_000)}`]);
    // El primero queda vacío al quitar los signos (se ignora); el segundo se reconoce como "Nombre".
    expect(mapped.mapping).toEqual({ name: 1 });
    expect(mapped.unknown).toEqual([]);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("solo se informan las primeras 50 columnas desconocidas, recortadas", () => {
    const headers = ["Nombre", ...Array.from({ length: 80 }, (_, i) => `Extra ${i}${"x".repeat(300)}`)];
    const result = validateImport("customers", { headers, rows: [{ line: 2, cells: ["Acme", ...headers.slice(1).map(() => "")] }] });
    expect(result.ignoredColumns).toHaveLength(50);
    expect(Math.max(...result.ignoredColumns.map((name) => name.length))).toBeLessThanOrEqual(120);
    expect(result.valid).toHaveLength(1);
  });
});

describe("validateImport: volumen", () => {
  it("valida 1000 filas correctas y detecta los repetidos que se cuelan al final", () => {
    const header = "Placa,Unidad,Tipo";
    const rows = Array.from({ length: 1000 }, (_, i) => `AB-${String(i + 1).padStart(4, "0")},U${i + 1},Camión`);
    const started = Date.now();
    const clean = run("vehicles", [header, ...rows].join("\r\n"));
    expect(clean.valid).toHaveLength(1000);
    expect(clean.invalid).toHaveLength(0);
    expect(clean.valid[999].line).toBe(1001);
    expect(Date.now() - started).toBeLessThan(5000);

    // 998 filas únicas + 2 repetidas = 1000 filas de datos (el máximo permitido).
    const dirty = run("vehicles", [header, ...rows.slice(0, 998), rows[0], rows[500]].join("\n"));
    expect(dirty.duplicatesInFile).toBe(2);
    expect(dirty.valid).toHaveLength(998);
    expect(dirty.invalid.map((row) => row.line)).toEqual([1000, 1001]);
    expect(dirty.invalid[0].errors).toEqual(["Repetido: ya aparece en la línea 2 (Placa)."]);
    expect(dirty.invalid[1].errors).toEqual(["Repetido: ya aparece en la línea 502 (Placa)."]);
  });

  it("un archivo sin filas de datos no llega aquí (parseCsv lo rechaza), pero validar cero filas es seguro", () => {
    const result = validateImport("customers", { headers: ["Nombre"], rows: [] });
    expect(result).toEqual({
      valid: [],
      invalid: [],
      headerIssues: [],
      duplicatesInFile: 0,
      ignoredColumns: [],
      totalRows: 0,
      exampleRows: 0,
    });
  });
});

describe("IMPORT_TEMPLATES", () => {
  const seedSource = readFileSync(fileURLToPath(new URL("../../../prisma/seed.ts", import.meta.url)), "utf8");
  /** Nombres de las empresas y clientes de demostración que el seed crea. */
  const demoNames = [
    ...[...seedSource.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]),
    ...[...seedSource.matchAll(/customers:\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])),
    "Panatruck",
    "TransLogistica",
  ];

  it("hay una plantilla por tipo, con nombre de archivo propio", () => {
    expect(Object.keys(IMPORT_TEMPLATES).sort()).toEqual([...IMPORT_KINDS].sort());
    expect(IMPORT_TEMPLATES.customers.filename).toBe("plantilla-clientes.csv");
    expect(IMPORT_TEMPLATES.vehicles.filename).toBe("plantilla-vehiculos.csv");
    expect(IMPORT_TEMPLATES.equipment.filename).toBe("plantilla-equipos.csv");
    expect(IMPORT_TEMPLATES.locations.filename).toBe("plantilla-lugares.csv");
    for (const kind of IMPORT_KINDS) expect(IMPORT_TEMPLATES[kind].filename).toMatch(/^[a-z0-9-]+\.csv$/);
  });

  it.each(IMPORT_KINDS.map((kind) => [kind]))("%s: empieza con BOM, usa coma y fin de línea CRLF", (kind) => {
    const { csv } = IMPORT_TEMPLATES[kind];
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const parsed = parseCsv(csv);
    expect(parsed.ok && parsed.delimiter).toBe(",");
  });

  it.each(IMPORT_KINDS.map((kind) => [kind]))("%s: el encabezado se reconoce completo y las 2 filas de ejemplo son válidas", (kind) => {
    const parsed = parseCsv(IMPORT_TEMPLATES[kind].csv);
    if (!parsed.ok) throw new Error(parsed.error);
    const mapped = mapHeaders(kind, parsed.headers);
    expect(mapped.missingRequired).toEqual([]);
    expect(mapped.unknown).toEqual([]);
    expect(mapped.duplicates).toEqual([]);
    expect(Object.keys(mapped.mapping)).toHaveLength(IMPORT_COLUMNS[kind].length); // todas las columnas están en la plantilla
    expect(parsed.rows).toHaveLength(2);
    const result = validateImport(kind, parsed);
    expect(result.headerIssues).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.valid).toHaveLength(2);
  });

  it.each(IMPORT_KINDS.map((kind) => [kind]))("%s: los encabezados llevan los nombres oficiales con tildes", (kind) => {
    const parsed = parseCsv(IMPORT_TEMPLATES[kind].csv);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.headers).toEqual(IMPORT_COLUMNS[kind].map((col) => col.label));
  });

  it("las filas de ejemplo son claramente ficticias y no usan nombres de las empresas de demostración", () => {
    expect(demoNames.length).toBeGreaterThanOrEqual(6);
    for (const kind of IMPORT_KINDS) {
      const { csv } = IMPORT_TEMPLATES[kind];
      const parsed = parseCsv(csv);
      if (!parsed.ok) throw new Error(parsed.error);
      for (const row of parsed.rows) expect(row.cells[0], `${kind}: ${row.cells[0]}`).toMatch(/ejemplo/i);
      for (const name of demoNames) expect(csv.toLowerCase(), `${kind} no debe contener ${name}`).not.toContain(name.toLowerCase());
      expect(csv).not.toMatch(/PAN-\d|TRA-\d|\.local/);
    }
  });

  it("los textos con comas van entre comillas y la plantilla de lugares trae coordenadas negativas intactas", () => {
    expect(IMPORT_TEMPLATES.customers.csv).toContain('"Calle de ejemplo 1, Ciudad de Panamá"');
    expect(IMPORT_TEMPLATES.locations.csv).toContain(",-79.5199");
    expect(IMPORT_TEMPLATES.locations.csv).not.toContain("'-79"); // sin el apóstrofo antifórmulas
    const result = run("locations", IMPORT_TEMPLATES.locations.csv);
    expect(result.valid[0].data.longitude).toBe(-79.5199);
  });

  describe("filas de ejemplo sin borrar", () => {
    it.each(IMPORT_KINDS.map((kind) => [kind]))(
      "%s: la plantilla sin tocar sigue siendo válida pero cada fila de ejemplo trae un aviso (no se bloquea)",
      (kind) => {
        const result = run(kind, IMPORT_TEMPLATES[kind].csv);
        expect(result.invalid).toEqual([]);
        expect(result.valid).toHaveLength(2);
        expect(result.exampleRows).toBe(2);
        for (const row of result.valid) expect(row.warnings, `línea ${row.line}`).toContain(EXAMPLE_ROW_WARNING);
      },
    );

    it("el aviso es una frase completa en español, con tratamiento de usted", () => {
      expect(EXAMPLE_ROW_WARNING).toBe(
        "Parece la fila de ejemplo de la plantilla. Si no es un dato real, bórrela del archivo antes de importar.",
      );
    });

    it("se reconoce aunque la persona cambie mayúsculas, espacios o tildes", () => {
      expect(run("customers", "Nombre\n  ejemplo   CLIENTE uno s.a. \n").exampleRows).toBe(1);
      expect(run("vehicles", "Placa\nejemplo 001\n").exampleRows).toBe(0); // "EJEMPLO001" ya no es la placa de ejemplo
      expect(run("vehicles", "Placa\n ejemplo-001 \n").exampleRows).toBe(1);
      expect(run("equipment", "Código\nejemplo-eq-1\n").exampleRows).toBe(1);
      expect(run("locations", "Nombre\n LUGAR DE EJEMPLO 1\n").exampleRows).toBe(1);
    });

    it("una fila real, o una de ejemplo a la que la persona ya cambió el dato principal, NO lleva el aviso", () => {
      const result = run("customers", "Nombre,RUC\nTransportes del Istmo,1-2-3\nEJEMPLO Cliente Uno S.A. Sucursal,0-000-0001\n");
      expect(result.exampleRows).toBe(0);
      for (const row of result.valid) expect(row.warnings).toBeUndefined();
    });

    it("solo avisa en la fila de ejemplo cuando el archivo mezcla datos reales y de ejemplo", () => {
      const result = run("vehicles", "Placa,Tipo\nAB-123,Pickup\nEJEMPLO-001,Tracto camión\nCD-456,Pickup\n");
      expect(result.exampleRows).toBe(1);
      expect(result.valid.map((row) => row.warnings)).toEqual([undefined, [EXAMPLE_ROW_WARNING], undefined]);
    });

    it("conserva el otro aviso de la fila (celdas que faltan) y añade el del ejemplo", () => {
      const result = run("customers", "Nombre,RUC,Correo\nEJEMPLO Cliente Uno S.A.,1\n");
      expect(result.valid[0].warnings).toHaveLength(2);
      expect(result.valid[0].warnings?.[0]).toContain("se completó con celdas vacías");
      expect(result.valid[0].warnings?.[1]).toBe(EXAMPLE_ROW_WARNING);
    });

    it("una fila de ejemplo repetida es un repetido (inválida), no un ejemplo más", () => {
      const result = run("equipment", "Código\nEJEMPLO-EQ-1\nEJEMPLO-EQ-1\n");
      expect(result.exampleRows).toBe(1);
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
      expect(result.duplicatesInFile).toBe(1);
    });

    it("un archivo con problemas de encabezado no cuenta ejemplos", () => {
      const result = run("vehicles", "Tipo\nEJEMPLO-001\n");
      expect(result.headerIssues).not.toEqual([]);
      expect(result.exampleRows).toBe(0);
    });

    it("no hay recursión ni estado compartido: validar muchas veces da siempre el mismo resultado", () => {
      const first = run("customers", IMPORT_TEMPLATES.customers.csv).exampleRows;
      for (let n = 0; n < 5; n += 1) expect(run("customers", IMPORT_TEMPLATES.customers.csv).exampleRows).toBe(first);
    });
  });

  it("los datos de ejemplo no chocan entre sí (no hay repetidos dentro de la propia plantilla)", () => {
    for (const kind of IMPORT_KINDS) expect(run(kind, IMPORT_TEMPLATES[kind].csv).duplicatesInFile).toBe(0);
  });
});
