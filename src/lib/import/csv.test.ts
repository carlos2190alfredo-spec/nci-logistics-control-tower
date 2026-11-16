import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/export/csv";
import { MAX_IMPORT_BYTES, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "@/lib/catalog/limits";
import { decodeCsvBytes, detectDelimiter, formatFileSize, parseCsv, type CsvRow } from "./csv";

const BOM = String.fromCharCode(0xfeff);
const NBSP = String.fromCharCode(0x00a0);
const REPLACEMENT = String.fromCharCode(0xfffd);

function ok(text: string, opts?: Parameters<typeof parseCsv>[1]) {
  const result = parseCsv(text, opts);
  if (!result.ok) throw new Error(`Debía leerse: ${result.error}`);
  return result;
}

function fail(text: string, opts?: Parameters<typeof parseCsv>[1]): string {
  const result = parseCsv(text, opts);
  if (result.ok) throw new Error("Debía fallar");
  return result.error;
}

const cellsOf = (rows: CsvRow[]) => rows.map((row) => row.cells);

describe("parseCsv: lectura básica", () => {
  it("lee encabezado y filas con coma, y numera las líneas físicas desde 1", () => {
    const result = ok("Placa,Tipo\nAB-123,Camión\nCD-456,Cabezal\n");
    expect(result.delimiter).toBe(",");
    expect(result.headers).toEqual(["Placa", "Tipo"]);
    expect(result.rows).toEqual([
      { line: 2, cells: ["AB-123", "Camión"] },
      { line: 3, cells: ["CD-456", "Cabezal"] },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("no exige un salto de línea final", () => {
    expect(cellsOf(ok("a,b\n1,2").rows)).toEqual([["1", "2"]]);
    expect(cellsOf(ok("a,b\n1,2\n\n\n").rows)).toEqual([["1", "2"]]);
  });

  it("quita el BOM de Excel (y varios) antes de leer el encabezado", () => {
    expect(ok(`${BOM}Placa;Unidad\nAB;U1`).headers).toEqual(["Placa", "Unidad"]);
    expect(ok(`${BOM}${BOM}a,b\n1,2`).headers).toEqual(["a", "b"]);
  });

  it("un BOM seguido de líneas en blanco no impide detectar el delimitador del encabezado", () => {
    // Sin quitar el BOM, la primera línea "con contenido" sería el propio BOM (sin delimitadores) y la coma ganaría.
    const result = ok(`${BOM}\r\nPlaca;Tipo\r\nAB1;X\r\n`);
    expect(result.delimiter).toBe(";");
    expect(result.headers).toEqual(["Placa", "Tipo"]);
    expect(result.rows).toEqual([{ line: 3, cells: ["AB1", "X"] }]);
    expect(detectDelimiter(`${BOM}\n\na;b\n`)).toBe(";");
  });

  it("recorta las celdas, incluidos los espacios de no separación", () => {
    expect(cellsOf(ok(`a,b\n  x ,${NBSP}y${NBSP}`).rows)).toEqual([["x", "y"]]);
  });

  it("conserva los acentos y los caracteres no latinos", () => {
    expect(cellsOf(ok("n\nÑandú — Colón 😀").rows)).toEqual([["Ñandú — Colón 😀"]]);
  });

  it("un archivo de una sola columna es válido", () => {
    const result = ok("Nombre\nAcme\nBeta\n");
    expect(result.delimiter).toBe(",");
    expect(cellsOf(result.rows)).toEqual([["Acme"], ["Beta"]]);
  });
});

describe("parseCsv: delimitador", () => {
  it("detecta punto y coma (Excel en español)", () => {
    const result = ok("Nombre;Dirección;Teléfono\nAcme;Calle 1;6000-0001\n");
    expect(result.delimiter).toBe(";");
    expect(cellsOf(result.rows)).toEqual([["Acme", "Calle 1", "6000-0001"]]);
  });

  it("detecta tabulador", () => {
    const result = ok("Placa\tTipo\nAB-123\tCamión\n");
    expect(result.delimiter).toBe("\t");
    expect(cellsOf(result.rows)).toEqual([["AB-123", "Camión"]]);
  });

  it("decide por el encabezado: comas dentro de los datos no cambian el delimitador", () => {
    const result = ok('Nombre;Dirección\nAcme;"Calle 1, piso 2, local 3"\nBeta;Av. A, B, C, D\n');
    expect(result.delimiter).toBe(";");
    expect(result.rows[1].cells).toEqual(["Beta", "Av. A, B, C, D"]);
  });

  it("ignora los delimitadores que están entre comillas al decidir", () => {
    expect(detectDelimiter('"a,b,c,d";e\n1;2')).toBe(";");
    expect(detectDelimiter('"a;b;c";d,e\n1,2')).toBe(",");
  });

  it("usa la primera línea con contenido: ignora líneas en blanco y de solo delimitadores al inicio", () => {
    expect(detectDelimiter("\n\n;;;\n  \nA;B\n1;2")).toBe(";");
    expect(detectDelimiter(`${BOM}A\tB\n1\t2`)).toBe("\t");
  });

  it("en un empate gana la coma; sin delimitadores también", () => {
    expect(detectDelimiter("a,b;c\n1,2;3")).toBe(",");
    expect(detectDelimiter("solo\n1")).toBe(",");
    expect(detectDelimiter("")).toBe(",");
  });

  it("gana el delimitador más frecuente del encabezado", () => {
    expect(detectDelimiter("a;b;c,d\n1;2;3,4")).toBe(";");
    expect(detectDelimiter("a,b,c;d\n1,2,3;4")).toBe(",");
  });

  it("respeta la línea 'sep=;' que Excel y otras herramientas anteponen, y no la toma por encabezado", () => {
    const result = ok("sep=;\nPlaca;Tipo\nAB1;X\n");
    expect(result.delimiter).toBe(";");
    expect(result.headers).toEqual(["Placa", "Tipo"]);
    expect(result.rows).toEqual([{ line: 3, cells: ["AB1", "X"] }]);
    expect(ok("SEP=,\nPlaca,Tipo\nAB1,X").headers).toEqual(["Placa", "Tipo"]);
  });

  it("lo que declara 'sep=' MANDA sobre lo que se detectaría contando el encabezado", () => {
    // Sin la línea, `a,b;c` empata (una coma y un punto y coma) y ganaría la coma.
    expect(detectDelimiter("a,b;c\n1,2;3\n")).toBe(",");
    const semicolon = ok("sep=;\na,b;c\n1,2;3\n");
    expect(semicolon.delimiter).toBe(";");
    expect(semicolon.headers).toEqual(["a,b", "c"]);
    expect(cellsOf(semicolon.rows)).toEqual([["1,2", "3"]]);
    // Y al revés: aquí ganarían los puntos y coma (dos contra una coma).
    const comma = ok("sep=,\na;b;c,d\n1;2;3,4\n");
    expect(comma.delimiter).toBe(",");
    expect(comma.headers).toEqual(["a;b;c", "d"]);
    expect(detectDelimiter("sep=,\na;b;c,d\n")).toBe(",");
  });

  it("una línea 'sep=' con un símbolo desconocido se salta y el delimitador se detecta del encabezado", () => {
    const result = ok("sep=|\nPlaca;Tipo\nAB1;X");
    expect(result.delimiter).toBe(";");
    expect(result.headers).toEqual(["Placa", "Tipo"]);
    expect(result.rows[0].line).toBe(3);
  });

  it("'sep=' solo cuenta en la primera línea con contenido", () => {
    const result = ok("Placa,Tipo\nsep=;,x\n");
    expect(result.headers).toEqual(["Placa", "Tipo"]);
    expect(cellsOf(result.rows)).toEqual([["sep=;", "x"]]);
  });
});

describe("parseCsv: comillas (RFC 4180)", () => {
  it("las comillas protegen el delimitador y los saltos de línea", () => {
    const result = ok('Nombre,Dirección\n"Acme, S.A.","Calle 1\nPiso 2"\n"Beta",x\n');
    expect(cellsOf(result.rows)).toEqual([
      ["Acme, S.A.", "Calle 1\nPiso 2"],
      ["Beta", "x"],
    ]);
  });

  it("la fila siguiente a un texto de varias líneas conserva su número de línea física", () => {
    const result = ok('a,b\n"x\ny\nz",1\n2,3\n');
    expect(result.rows.map((row) => row.line)).toEqual([2, 5]);
  });

  it("una comilla escapada con comillas dobles es una comilla literal", () => {
    expect(cellsOf(ok('a\n"Dijo ""hola"" ayer"\n""""\n').rows)).toEqual([['Dijo "hola" ayer'], ['"']]);
  });

  it("un campo entrecomillado vacío es una celda vacía, no una fila vacía", () => {
    const result = ok('a,b\n"",x\n');
    expect(cellsOf(result.rows)).toEqual([["", "x"]]);
  });

  it("los saltos de línea dentro de comillas se normalizan a LF", () => {
    expect(cellsOf(ok('a\n"uno\r\ndos\rtres"\n').rows)).toEqual([["uno\ndos\ntres"]]);
  });

  it("tolera espacios antes de la comilla de apertura", () => {
    expect(cellsOf(ok('a, b\n1, "x, y"\n').rows)).toEqual([["1", "x, y"]]);
  });

  it("tolera texto después de la comilla de cierre y comillas sueltas en medio de un campo", () => {
    expect(cellsOf(ok('a,b\n"x"y,2\n').rows)).toEqual([["xy", "2"]]);
    expect(cellsOf(ok('a,b\n5" tubo,2\n').rows)).toEqual([['5" tubo', "2"]]);
  });

  it("una comilla que no cierra es un error con el número de línea donde se abrió", () => {
    expect(fail('a,b\n1,2\n"3,4\n5,6\n')).toBe("La comilla que se abre en la línea 3 nunca se cierra. Revise esa línea del archivo.");
  });

  it("la línea del error cuenta las líneas de textos anteriores de varias líneas y las líneas en blanco", () => {
    // línea 1 encabezado, 2-3 texto multilínea, 4 en blanco, 5 abre una comilla sin cerrar
    expect(fail('a,b\n"x\ny",1\n\n"sin cierre,2\n')).toContain("en la línea 5 ");
  });

  it("una comilla sin cerrar en el encabezado se reporta en la línea 1", () => {
    expect(fail('"Placa,Tipo\nAB,X\n')).toContain("en la línea 1 ");
  });

  it("después de una línea 'sep=' el número de línea de un error sigue siendo el real del archivo", () => {
    expect(fail('sep=;\nA;B\n"x;1\n')).toContain("en la línea 3 ");
  });
});

describe("parseCsv: finales de línea y filas vacías", () => {
  it("lee CRLF, LF y CR, incluso mezclados", () => {
    const result = ok("a,b\r\n1,2\n3,4\r5,6\r\n7,8");
    expect(cellsOf(result.rows)).toEqual([
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
      ["7", "8"],
    ]);
    expect(result.rows.map((row) => row.line)).toEqual([2, 3, 4, 5]);
  });

  it("CRLF cuenta como UN salto de línea (no dos)", () => {
    expect(ok("a\r\n1\r\n2\r\n").rows.map((row) => row.line)).toEqual([2, 3]);
  });

  it("ignora líneas vacías, solo espacios y filas de solo delimitadores (restos de una hoja de Excel)", () => {
    const result = ok("a;b\n\n1;2\n;;\n   \n3;4\n;;;\n");
    expect(cellsOf(result.rows)).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(result.rows.map((row) => row.line)).toEqual([3, 6]); // los números de línea siguen siendo los reales
  });

  it("no ignora una fila con un solo valor entre delimitadores vacíos", () => {
    expect(cellsOf(ok("a,b,c\n,x,\n").rows)).toEqual([["", "x", ""]]);
  });
});

describe("parseCsv: archivos vacíos o incompletos", () => {
  it.each([[""], ["   "], ["\n\n"], [BOM], [`${BOM}\r\n`], [";;;\n;;;"], ["\t\t\n"]])("%j → archivo vacío", (text) => {
    expect(fail(text)).toBe("El archivo está vacío.");
  });

  it("solo con encabezado pide al menos una fila de datos", () => {
    expect(fail("Placa,Tipo\n")).toBe("El archivo solo tiene el encabezado. Agregue al menos una fila de datos.");
    expect(fail("Placa,Tipo\n\n,\n  \n")).toContain("solo tiene el encabezado");
    expect(fail("Placa;Tipo\n;;\n;;\n")).toContain("solo tiene el encabezado");
  });

  it("nunca lanza ante entradas que no son texto", () => {
    expect(parseCsv(null as unknown as string)).toEqual({ ok: false, error: "No se pudo leer el archivo." });
    expect(parseCsv(undefined as unknown as string)).toEqual({ ok: false, error: "No se pudo leer el archivo." });
    expect(parseCsv(42 as unknown as string)).toEqual({ ok: false, error: "No se pudo leer el archivo." });
  });
});

describe("parseCsv: límites", () => {
  it("acepta exactamente maxBytes y rechaza un byte más", () => {
    const body = "a\n" + "x".repeat(48); // 2 + 48 = 50 bytes
    expect(new TextEncoder().encode(body).length).toBe(50);
    expect(parseCsv(body, { maxBytes: 50 }).ok).toBe(true);
    expect(fail(`${body}x`, { maxBytes: 50 })).toBe(
      "El archivo pesa 51 bytes y el máximo permitido es 50 bytes. Divídalo en varios archivos.",
    );
  });

  it("mide bytes UTF-8, no caracteres (la eñe ocupa 2 bytes, el emoji 4)", () => {
    expect(parseCsv("a\nññ", { maxBytes: 6 }).ok).toBe(true); // 2 + 4
    expect(fail("a\nñññ", { maxBytes: 6 })).toContain("pesa 8 bytes");
    expect(fail("a\n😀😀", { maxBytes: 9 })).toContain("pesa 10 bytes");
  });

  it("el límite por defecto es MAX_IMPORT_BYTES y el mensaje muestra tamaños legibles", () => {
    // 2 bytes del encabezado + 1 MiB: redondeado sería "1 MB" frente a "1 MB", así que se muestran bytes exactos.
    expect(fail("a\n" + "x".repeat(MAX_IMPORT_BYTES))).toBe(
      "El archivo pesa 1,048,578 bytes y el máximo permitido es 1,048,576 bytes. Divídalo en varios archivos.",
    );
    // Exactamente en el tope sí se acepta.
    expect(parseCsv("a\n" + "x".repeat(MAX_IMPORT_BYTES - 2)).ok).toBe(true);
  });

  it("muestra los tamaños legibles cuando están claramente por encima del tope", () => {
    expect(fail("a\n" + "x".repeat(3000), { maxBytes: 1024 })).toBe(
      "El archivo pesa 2.9 KB y el máximo permitido es 1 KB. Divídalo en varios archivos.",
    );
    expect(fail("a\n" + "x".repeat(3 * 1_048_576), { maxBytes: 2 * 1_048_576 })).toContain(
      "pesa 3 MB y el máximo permitido es 2 MB",
    );
  });

  it("acepta exactamente maxRows filas de datos y rechaza una más", () => {
    expect(parseCsv("a\n1\n2\n", { maxRows: 2 }).ok).toBe(true);
    expect(fail("a\n1\n2\n3\n", { maxRows: 2 })).toBe("El archivo tiene más de 2 filas de datos. Divídalo en archivos de hasta 2 filas.");
  });

  it("las filas vacías no cuentan contra el máximo", () => {
    expect(parseCsv("a\n1\n\n,\n2\n\n", { maxRows: 2 }).ok).toBe(true);
    expect(parseCsv("a;b\n1;1\n;\n\n;;\n2;2\n", { maxRows: 2 }).ok).toBe(true);
  });

  it("el máximo por defecto es MAX_IMPORT_ROWS (1000)", () => {
    const rows = (count: number) => "a\n" + Array.from({ length: count }, (_, i) => String(i + 1)).join("\n");
    const exact = parseCsv(rows(MAX_IMPORT_ROWS));
    expect(exact.ok && exact.rows.length).toBe(MAX_IMPORT_ROWS);
    expect(fail(rows(MAX_IMPORT_ROWS + 1))).toContain(`más de ${MAX_IMPORT_ROWS} filas`);
  });

  it("limita las columnas del encabezado: un encabezado enorme no multiplica la memoria de las filas", () => {
    const header = (count: number) => Array.from({ length: count }, (_, i) => `c${i}`).join(",");
    expect(MAX_IMPORT_COLUMNS).toBe(100);
    expect(parseCsv(`${header(MAX_IMPORT_COLUMNS)}\n1`).ok).toBe(true);
    expect(fail(`${header(MAX_IMPORT_COLUMNS + 1)}\n1`)).toBe(
      "El archivo tiene 101 columnas y el máximo es 100. Elimine las columnas que no necesita.",
    );
    expect(parseCsv(`${header(5)}\n1`, { maxColumns: 4 }).ok).toBe(false);
    // Caso hostil: 50 000 columnas y 1000 filas de una sola celda (se rechaza sin rellenar 50 millones de celdas).
    const started = Date.now();
    const hostile = `${header(50_000)}\n${Array.from({ length: 1000 }, () => "x").join("\n")}`;
    expect(fail(hostile)).toContain("50000 columnas");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("formatFileSize da tamaños legibles", () => {
    expect(formatFileSize(512)).toBe("512 bytes");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1_048_576)).toBe("1 MB");
    expect(formatFileSize(1_572_864)).toBe("1.5 MB");
  });
});

describe("parseCsv: medida exacta de bytes UTF-8 y tamaños legibles", () => {
  const encoded = (text: string) => new TextEncoder().encode(text).length;
  /** El archivo mide exactamente `bytes` según `TextEncoder`: acepta ese tope y rechaza uno menos. */
  function expectExactSize(text: string) {
    const bytes = encoded(text);
    expect(parseCsv(text, { maxBytes: bytes }).ok, `${bytes} bytes`).toBe(true);
    expect(parseCsv(text, { maxBytes: bytes - 1 }).ok, `${bytes - 1} bytes`).toBe(false);
  }

  it("cuenta 1, 2, 3 y 4 bytes en las fronteras de cada tramo de UTF-8", () => {
    const samples = [
      "a\n\u007f", // último de 1 byte
      "a\n\u0080", // primero de 2 bytes
      "a\n\u07ff", // último de 2 bytes
      "a\n\u0800", // primero de 3 bytes
      "a\n\u20ac", // euro: 3 bytes
      "a\n\ud7ff", // justo antes de los sustitutos
      "a\n\ue000", // justo después de los sustitutos
      "a\n\uffff", // último del plano básico
      "a\n\u{10000}", // primero de 4 bytes
      "a\n\u{1F600}x", // emoji seguido de otro carácter
    ];
    for (const sample of samples) expectExactSize(sample);
    expect(encoded("a\n\u20ac")).toBe(5); // 2 + 3: una fórmula equivocada de 3 bytes lo delataría
  });

  it("un sustituto solitario cuenta 3 bytes (TextEncoder lo reemplaza por U+FFFD)", () => {
    expectExactSize("a\n\ud83d"); // sustituto alto al final del texto
    expectExactSize("a\n\ud83dx"); // sustituto alto sin pareja
    expectExactSize("a\n\ude00"); // sustituto bajo suelto
  });

  it("formatFileSize cambia de unidad exactamente en 1024 y en 1 MiB", () => {
    expect(formatFileSize(1023)).toBe("1023 bytes");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1_048_575)).toBe("1024 KB");
    expect(formatFileSize(1_048_576)).toBe("1 MB");
    expect(formatFileSize(1_572_864)).toBe("1.5 MB");
  });
});

describe("parseCsv: la línea sep= y los saltos de línea dentro de comillas en el encabezado", () => {
  it("tolera espacios y CRLF alrededor de la línea sep=", () => {
    const result = ok("  sep=;  \r\nNombre;Dirección\r\nA;B\r\n");
    expect(result.delimiter).toBe(";");
    expect(result.headers).toEqual(["Nombre", "Dirección"]);
    expect(result.rows[0].line).toBe(3);
  });

  it("un encabezado entrecomillado con CRLF por dentro cuenta UNA línea lógica y las filas conservan su línea real", () => {
    const result = ok('"Nombre\r\ndel cliente";Código\r\nAcme;1\r\nBeta;2\r\n');
    expect(result.delimiter).toBe(";");
    expect(result.headers).toEqual(["Nombre\ndel cliente", "Código"]);
    expect(result.rows.map((row) => row.line)).toEqual([3, 4]);
  });

  it("después de sep= y de un encabezado con salto de línea interno, los números de línea siguen siendo los del archivo", () => {
    const result = ok('sep=;\n"Nombre\ndel cliente";Código\nAcme;1\n');
    expect(result.rows[0].line).toBe(4);
  });

  it("el CR suelto dentro de comillas también cuenta como un salto de línea", () => {
    const result = ok('"a\rb";c\n1;2\n');
    expect(result.headers).toEqual(["a\nb", "c"]);
    expect(result.rows[0].line).toBe(3);
  });

  it("sep= con un símbolo desconocido se salta pero NO fuerza nada: manda el encabezado, y la línea siguiente es el encabezado", () => {
    const result = ok("sep=|\nNombre;Dirección\nA;B\n");
    expect(result.delimiter).toBe(";");
    expect(result.headers).toEqual(["Nombre", "Dirección"]);
    expect(result.rows[0].line).toBe(3);
  });

  it("sep= sin nada más: el archivo no tiene contenido", () => {
    expect(fail("sep=;\n")).toMatch(/vacío|solo tiene el encabezado|encabezado/);
    expect(fail("sep=;")).toMatch(/vacío|solo tiene el encabezado|encabezado/);
  });

  it("un texto de solo líneas en blanco y un tabulador suelto está vacío", () => {
    expect(fail("\n\n  \n")).toBe("El archivo está vacío.");
    expect(fail(" \t \n")).toBe("El archivo está vacío.");
  });
});

describe("decodeCsvBytes: marcas de orden de bytes exactas", () => {
  it("un solo byte 0xFF o 0xFE NO es una marca UTF-16", () => {
    expect(decodeCsvBytes(new Uint8Array([0xff])).encoding).toBe("windows-1252");
    expect(decodeCsvBytes(new Uint8Array([0xfe])).encoding).toBe("windows-1252");
  });

  it("0xFF seguido de otro byte distinto de 0xFE (y 0xFE sin 0xFF) tampoco lo es", () => {
    expect(decodeCsvBytes(new Uint8Array([0xff, 0x41])).encoding).toBe("windows-1252");
    expect(decodeCsvBytes(new Uint8Array([0xfe, 0x41])).encoding).toBe("windows-1252");
    expect(decodeCsvBytes(new Uint8Array([0x41, 0xff, 0xfe])).encoding).toBe("windows-1252");
  });

  it("la marca de exactamente dos bytes (archivo vacío en UTF-16) se reconoce y devuelve texto vacío", () => {
    expect(decodeCsvBytes(new Uint8Array([0xff, 0xfe]))).toEqual({ text: "", encoding: "utf-16le" });
    expect(decodeCsvBytes(new Uint8Array([0xfe, 0xff]))).toEqual({ text: "", encoding: "utf-16be" });
  });
});

describe("parseCsv: filas con más o menos celdas que el encabezado", () => {
  it("rellena las celdas que faltan y avisa", () => {
    const [row] = ok("a,b,c\n1,2\n").rows;
    expect(row.cells).toEqual(["1", "2", ""]);
    expect(row.warning).toBe("La fila tiene 2 celdas y el encabezado 3; se completó con celdas vacías.");
    expect(row.extraCells).toBeUndefined();
  });

  it("recorta las celdas sobrantes CON datos, avisa e indica cuántas se perdieron", () => {
    const [row] = ok("a,b,c\n1,2,3,4,5\n").rows;
    expect(row.cells).toEqual(["1", "2", "3"]);
    expect(row.extraCells).toBe(2);
    expect(row.warning).toContain("tiene 5 celdas y el encabezado 3");
    expect(row.warning).toContain("entre comillas");
  });

  it("las celdas sobrantes vacías (delimitadores al final) se descartan, con aviso pero sin marcar la fila como desplazada", () => {
    const [row] = ok("a,b,c\n1,2,3,,\n").rows;
    expect(row.cells).toEqual(["1", "2", "3"]);
    expect(row.warning).toBe("La fila tiene 5 celdas y el encabezado 3; se ignoraron las celdas sobrantes, que estaban vacías.");
    // Sin `extraCells`: no se perdió ningún dato, así que el importador no debe rechazar la fila.
    expect(row.extraCells).toBeUndefined();
  });

  it("una fila con la cantidad exacta de celdas no lleva aviso ni marca", () => {
    const [row] = ok("a,b,c\n1,2,3\n").rows;
    expect(row.warning).toBeUndefined();
    expect(row.extraCells).toBeUndefined();
  });

  it("cada fila desajustada lleva su propio aviso y las demás no", () => {
    const { rows } = ok("a,b\n1,2\n3\n4,5,\n6,7\n8,9,10\n");
    expect(rows.map((row) => row.warning !== undefined)).toEqual([false, true, true, false, true]);
    expect(rows.map((row) => row.extraCells)).toEqual([undefined, undefined, undefined, undefined, 1]);
  });

  it("una coma sin comillas dentro de un texto se detecta como celda sobrante (no desplaza las columnas en silencio)", () => {
    const result = ok("Nombre,Dirección,Teléfono\nAcme,Calle 1, piso 2,6000-0001\n");
    expect(result.rows[0].cells).toEqual(["Acme", "Calle 1", "piso 2"]);
    expect(result.rows[0].extraCells).toBe(1);
  });

  it("todas las filas tienen exactamente tantas celdas como el encabezado", () => {
    const result = ok("a,b,c\n1\n1,2,3,4\n1,2,3\n");
    for (const row of result.rows) expect(row.cells).toHaveLength(3);
  });

  it("conserva los encabezados duplicados sin perder ninguna columna", () => {
    const result = ok("Placa,Placa,x\n1,2,3\n");
    expect(result.headers).toEqual(["Placa", "Placa", "x"]);
    expect(result.rows[0].cells).toEqual(["1", "2", "3"]);
  });
});

describe("parseCsv: codificación", () => {
  it("avisa cuando el archivo trae caracteres ilegibles (típico de un CSV de Excel no guardado como UTF-8)", () => {
    const result = ok(`a\nPanam${REPLACEMENT}`);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("CSV UTF-8");
  });
});

describe("decodeCsvBytes", () => {
  it("lee UTF-8 con y sin BOM y quita el BOM", () => {
    expect(decodeCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0xb1, 0x61]))).toEqual({ text: "ña", encoding: "utf-8" });
    expect(decodeCsvBytes(new TextEncoder().encode("Panamá"))).toEqual({ text: "Panamá", encoding: "utf-8" });
  });

  it("recurre a Windows-1252 cuando los bytes no son UTF-8 válido (Excel en español guarda así el 'CSV')", () => {
    // "Panamá;ñandú" en Windows-1252: á = 0xE1, ñ = 0xF1
    const bytes = new Uint8Array([0x50, 0x61, 0x6e, 0x61, 0x6d, 0xe1, 0x3b, 0xf1, 0x61, 0x6e, 0x64, 0xfa]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: "Panamá;ñandú", encoding: "windows-1252" });
  });

  it("reconoce UTF-16 con su marca (el 'Texto Unicode' de Excel)", () => {
    expect(decodeCsvBytes(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xf1, 0x00]))).toEqual({ text: "Añ", encoding: "utf-16le" });
    expect(decodeCsvBytes(new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0xf1]))).toEqual({ text: "Añ", encoding: "utf-16be" });
  });

  it("acepta un ArrayBuffer y un archivo vacío", () => {
    const buffer = new TextEncoder().encode("a,b").buffer;
    expect(decodeCsvBytes(buffer).text).toBe("a,b");
    expect(decodeCsvBytes(new Uint8Array([]))).toEqual({ text: "", encoding: "utf-8" });
  });

  it("un CSV de Excel en Windows-1252 se lee completo de punta a punta, con tildes y eñes intactas", () => {
    // "Nombre;Dirección\nPeña;Calle 5" en Windows-1252 (ñ = 0xF1, ó = 0xF3)
    const bytes = new Uint8Array([
      ...[..."Nombre;Direcci"].map((c) => c.charCodeAt(0)),
      0xf3,
      ...[..."n\nPe"].map((c) => c.charCodeAt(0)),
      0xf1,
      ...[..."a;Calle 5"].map((c) => c.charCodeAt(0)),
    ]);
    const decoded = decodeCsvBytes(bytes);
    expect(decoded.encoding).toBe("windows-1252");
    const result = ok(decoded.text);
    expect(result.headers).toEqual(["Nombre", "Dirección"]);
    expect(cellsOf(result.rows)).toEqual([["Peña", "Calle 5"]]);
    expect(result.warnings).toEqual([]); // leído con la codificación correcta: sin caracteres ilegibles
  });
});

describe("parseCsv: compatibilidad con el exportador del sistema", () => {
  it("lee lo que escribe toCsv (BOM, CRLF, comillas, comas y saltos de línea)", () => {
    const rows = [
      { name: 'Acme, "El Grande" S.A.', note: "Línea 1\nLínea 2" },
      { name: "Beta", note: "" },
    ];
    const text = toCsv(rows, [
      { header: "Nombre", value: (r) => r.name },
      { header: "Nota", value: (r) => r.note },
    ]);
    expect(text.startsWith(BOM)).toBe(true);
    const result = ok(text);
    expect(result.headers).toEqual(["Nombre", "Nota"]);
    expect(cellsOf(result.rows)).toEqual([
      ['Acme, "El Grande" S.A.', "Línea 1\nLínea 2"],
      ["Beta", ""],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Prueba de propiedad: escribir una tabla al azar y leerla de vuelta debe devolver lo mismo.
// ---------------------------------------------------------------------------

/** Generador pseudoaleatorio determinista (mulberry32): las fallas son reproducibles. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = ["a", "B", "7", " ", "  ", ",", ";", "\t", '"', '""', "\n", "\r\n", "\r", "ñ", "é", "😀", "x y", "-", "=", "'", "'-1"];

describe("parseCsv: ida y vuelta con tablas aleatorias", () => {
  const delimiters = [",", ";", "\t"] as const;
  const eols = ["\n", "\r\n", "\r"];

  function quote(cell: string): string {
    return /[,;\t"\r\n]/.test(cell) || cell !== cell.trim() ? `"${cell.replace(/"/g, '""')}"` : cell;
  }

  it.each(Array.from({ length: 150 }, (_, i) => [i + 1]))("semilla %i", (seed) => {
    const random = rng(seed * 7919);
    const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
    const delimiter = pick(delimiters);
    const eol = pick(eols);
    const columns = 1 + Math.floor(random() * 5);
    const rowCount = 1 + Math.floor(random() * 6);

    const makeCell = () => {
      const parts = Array.from({ length: Math.floor(random() * 5) }, () => pick(PIECES));
      return parts.join("");
    };
    const table: string[][] = [];
    for (let r = 0; r < rowCount + 1; r += 1) {
      let row = Array.from({ length: columns }, makeCell);
      // Una fila con todas las celdas vacías se ignora por diseño: se evita en el generador.
      if (row.every((cell) => cell.trim() === "")) row = row.map((_, i) => (i === 0 ? "k" : row[i]));
      table.push(row);
    }
    // El encabezado se escribe de forma que no confunda la detección de delimitador.
    const text = table.map((row) => row.map(quote).join(delimiter)).join(eol) + (random() < 0.5 ? eol : "");

    // Número de línea físico esperado de cada registro.
    const expectedLines: number[] = [];
    let line = 1;
    for (const row of table) {
      expectedLines.push(line);
      // Se cuenta por celda: un "\r" al final de una celda y un "\n" al inicio de la siguiente son DOS saltos.
      const embedded = row.reduce((total, cell) => total + (cell.match(/\r\n|\r|\n/g)?.length ?? 0), 0);
      line += embedded + 1;
    }

    const expected = table.map((row) => row.map((cell) => cell.replace(/\r\n|\r/g, "\n").trim()));
    const result = parseCsv(text, { maxRows: 100 });
    if (!result.ok) throw new Error(`semilla ${seed}: ${result.error}\n${JSON.stringify(text)}`);
    if (columns > 1) expect(result.delimiter).toBe(delimiter);
    expect(result.headers).toEqual(expected[0]);
    expect(cellsOf(result.rows)).toEqual(expected.slice(1));
    expect(result.rows.map((row) => row.line)).toEqual(expectedLines.slice(1));
  });
});

describe("parseCsv: archivos hostiles", () => {
  it("un campo enorme con cientos de miles de comillas sueltas se lee en tiempo lineal", () => {
    const evil = `a${'"a'.repeat(200_000)}`;
    const started = Date.now();
    const result = ok(`c\n${evil}\n`);
    expect(result.rows[0].cells[0]).toBe(evil);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("un campo de solo espacios seguido de muchas comillas tampoco es cuadrático", () => {
    const evil = `${" ".repeat(300_000)}"x""${'"'.repeat(1000)}`;
    const started = Date.now();
    parseCsv(`c\n"${evil}"\n`);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("un encabezado de doscientas mil comas se rechaza por columnas sin agotar la memoria", () => {
    const started = Date.now();
    const result = parseCsv(`${",".repeat(200_000)}x\n1`);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("columnas");
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("parseCsv: rendimiento razonable", () => {
  it("lee 1000 filas de 8 columnas con textos entrecomillados sin tardar", () => {
    const header = "Nombre,Código,RUC,Contacto,Correo,Teléfono,Dirección,Notas";
    const rows = Array.from(
      { length: 1000 },
      (_, i) => `"Cliente ${i}, S.A.",CLI-${i},0-${i},Ana,a${i}@x.co,6000-${i},"Calle ${i}, piso ""2""",nota`,
    );
    const text = [header, ...rows].join("\r\n");
    const started = Date.now();
    const result = ok(text);
    expect(result.rows).toHaveLength(1000);
    expect(result.rows[999].cells[6]).toBe('Calle 999, piso "2"');
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
