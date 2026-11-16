import { describe, expect, it } from "vitest";
import {
  comparableKey,
  hasUnsupportedCodeChars,
  normalizeCode,
  normalizeCodeFull,
  normalizeEmail,
  normalizeMultiline,
  normalizePlate,
  normalizeText,
  nullableText,
  slugCode,
  stripBom,
  stripDiacritics,
  unifyDashes,
} from "./normalize";

// Los caracteres invisibles se construyen aquí a propósito: así el archivo de prueba no contiene
// caracteres que ningún editor muestra.
const BOM = String.fromCharCode(0xfeff);
const ZWSP = String.fromCharCode(0x200b);
const ZWJ = String.fromCharCode(0x200d);
const NBSP = String.fromCharCode(0x00a0);
const RLO = String.fromCharCode(0x202e);
const SOFT_HYPHEN = String.fromCharCode(0x00ad);
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);
const MINUS = String.fromCharCode(0x2212);
const LINE_SEP = String.fromCharCode(0x2028);
const NEL = String.fromCharCode(0x0085);
const COMBINING_ACUTE = String.fromCharCode(0x0301);
/** "С" y "Н" cirílicas: se ven idénticas a la "C" y la "H" latinas, pero son otras letras. */
const CYRILLIC_ES = String.fromCharCode(0x0421);
const CYRILLIC_EN = String.fromCharCode(0x041d);

describe("normalizeText", () => {
  it("recorta y colapsa cualquier secuencia de espacios, tabuladores y saltos de línea", () => {
    expect(normalizeText("  Ana \t\n  María \r\n Pérez  ")).toBe("Ana María Pérez");
  });

  it("trata el espacio de no separación, el separador de línea y NEL como espacios", () => {
    expect(normalizeText(`a${NBSP}${NBSP}b${LINE_SEP}c${NEL}d`)).toBe("a b c d");
  });

  it("compone en NFC: una letra con tilde descompuesta equivale a la compuesta", () => {
    const decomposed = `Mari${"a"}${COMBINING_ACUTE}`;
    expect(decomposed.length).toBe(6);
    expect(normalizeText(decomposed)).toBe("Mariá");
    expect(normalizeText(decomposed).length).toBe(5);
  });

  it("elimina caracteres invisibles que llegan al copiar y pegar (ancho cero, BOM, guion suave, controles)", () => {
    expect(normalizeText(`${BOM}Pa${ZWSP}na${SOFT_HYPHEN}má${String.fromCharCode(7)}`)).toBe("Panamá");
  });

  it("elimina las marcas bidireccionales que permiten suplantar un texto en pantalla", () => {
    expect(normalizeText(`Cliente${RLO} Seguro`)).toBe("Cliente Seguro");
  });

  it("no une dos palabras cuando un invisible queda entre espacios", () => {
    expect(normalizeText(`uno ${ZWSP} dos`)).toBe("uno dos");
  });

  it("conserva la unión de ancho cero de los emojis compuestos", () => {
    const family = `${String.fromCodePoint(0x1f468)}${ZWJ}${String.fromCodePoint(0x1f469)}`;
    expect(normalizeText(family)).toBe(family);
  });

  it("no cambia los signos de puntuación interiores", () => {
    expect(normalizeText("Transportes S.A. - Sucursal #2 (Colón)")).toBe("Transportes S.A. - Sucursal #2 (Colón)");
  });

  it("devuelve cadena vacía ante null, undefined o un valor que no es texto", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText(42 as unknown as string)).toBe("");
  });

  it("es idempotente", () => {
    const messy = `  ${ZWSP}Ñandú\t  del   Istmo ${NBSP}`;
    expect(normalizeText(normalizeText(messy))).toBe(normalizeText(messy));
  });
});

describe("nullableText", () => {
  it("devuelve null cuando solo hay espacios o invisibles", () => {
    expect(nullableText("   ")).toBeNull();
    expect(nullableText(`${ZWSP}${NBSP}`)).toBeNull();
    expect(nullableText("")).toBeNull();
    expect(nullableText(null)).toBeNull();
    expect(nullableText(undefined)).toBeNull();
  });

  it("devuelve el texto normalizado cuando hay contenido", () => {
    expect(nullableText("  RUC   155-1  ")).toBe("RUC 155-1");
  });

  it("conserva el cero y otros valores 'falsos' como texto", () => {
    expect(nullableText("0")).toBe("0");
  });
});

describe("normalizeMultiline", () => {
  it("conserva los saltos de línea y unifica CRLF y CR en LF", () => {
    expect(normalizeMultiline("uno\r\ndos\rtres\ncuatro")).toBe("uno\ndos\ntres\ncuatro");
  });

  it("colapsa espacios dentro de cada línea y recorta cada línea", () => {
    expect(normalizeMultiline("  a   b  \n   c\t\td   ")).toBe("a b\nc d");
  });

  it("reduce las líneas en blanco consecutivas a una sola", () => {
    expect(normalizeMultiline("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("no pierde el contenido de una nota de varias líneas (lo que haría normalizeText)", () => {
    const note = "Llamar antes de llegar.\nPortón azul.";
    expect(normalizeMultiline(note)).toBe(note);
    expect(normalizeText(note)).toBe("Llamar antes de llegar. Portón azul.");
  });

  it("elimina invisibles y devuelve vacío ante valores que no son texto", () => {
    expect(normalizeMultiline(`a${ZWSP}b`)).toBe("ab");
    expect(normalizeMultiline(null)).toBe("");
    expect(normalizeMultiline(undefined)).toBe("");
  });
});

describe("normalizePlate", () => {
  it("pasa a mayúsculas y quita todos los espacios, conservando el guion", () => {
    expect(normalizePlate(" pan-101 ")).toBe("PAN-101");
    expect(normalizePlate("ab 12 34")).toBe("AB1234");
    expect(normalizePlate(`ab${NBSP}123`)).toBe("AB123");
  });

  it("convierte los guiones tipográficos de Word/Excel en un guion simple", () => {
    expect(normalizePlate(`PAN${EN_DASH}101`)).toBe("PAN-101");
    expect(normalizePlate(`PAN${EM_DASH}101`)).toBe("PAN-101");
    expect(normalizePlate(`PAN${MINUS}101`)).toBe("PAN-101");
  });

  it("quita las tildes (una placa nunca las lleva)", () => {
    expect(normalizePlate("Áb-12")).toBe("AB-12");
  });

  it("NO elimina otros símbolos: es el esquema quien los rechaza con un mensaje claro", () => {
    expect(normalizePlate("a.b#1")).toBe("A.B#1");
  });

  it("devuelve vacío ante valores que no son texto", () => {
    expect(normalizePlate(null)).toBe("");
    expect(normalizePlate(undefined)).toBe("");
  });
});

describe("normalizeCode", () => {
  it("pasa a mayúsculas y convierte espacios en guiones", () => {
    expect(normalizeCode("vh 12")).toBe("VH-12");
    expect(normalizeCode("  eq   5 ")).toBe("EQ-5");
  });

  it("quita tildes y la eñe en lugar de borrar la letra", () => {
    expect(normalizeCode("código ñandú")).toBe("CODIGO-NANDU");
  });

  it("deja solo [A-Z0-9._-]", () => {
    expect(normalizeCode("a/b#c$d(e)'f")).toBe("ABCDEF");
    expect(normalizeCode("v_h.1-2")).toBe("V_H.1-2");
  });

  it("colapsa guiones repetidos y quita los de los extremos", () => {
    expect(normalizeCode("a - - b")).toBe("A-B");
    expect(normalizeCode("--ab--")).toBe("AB");
    expect(normalizeCode(`ab${EN_DASH}${EN_DASH}cd`)).toBe("AB-CD");
  });

  it("limita a 32 caracteres sin dejar un guion colgando al final", () => {
    const long = normalizeCode(`${"a".repeat(31)} bb`);
    expect(long).toBe("A".repeat(31));
    expect(normalizeCode("x".repeat(60))).toHaveLength(32);
  });

  it("devuelve vacío cuando no queda ningún carácter válido", () => {
    expect(normalizeCode("***")).toBe("");
    expect(normalizeCode(null)).toBe("");
  });

  it("es idempotente para entradas de todo tipo", () => {
    const samples = [
      "vh 12",
      "  --código ñandú--  ",
      "a".repeat(40),
      `${"a".repeat(31)} bb`,
      "a - - b",
      "x_y.z-1",
      "!!!",
      "Ñ Ñ Ñ",
    ];
    for (const sample of samples) {
      const once = normalizeCode(sample);
      expect(normalizeCode(once)).toBe(once);
      expect(once.length).toBeLessThanOrEqual(32);
      expect(once).toMatch(/^[A-Z0-9._-]*$/);
      expect(once).not.toMatch(/^-|-$|--/);
    }
  });
});

describe("normalizeCodeFull", () => {
  it("no trunca: permite que el esquema rechace un código demasiado largo en lugar de recortarlo en silencio", () => {
    expect(normalizeCodeFull("a".repeat(40))).toHaveLength(40);
    expect(normalizeCode("a".repeat(40))).toHaveLength(32);
  });

  it("quita los guiones del principio Y del final, y colapsa los repetidos (sin depender de normalizeCode)", () => {
    expect(normalizeCodeFull("--ab--")).toBe("AB");
    expect(normalizeCodeFull("ab-")).toBe("AB");
    expect(normalizeCodeFull("-ab")).toBe("AB");
    expect(normalizeCodeFull("a  -  b")).toBe("A-B");
    expect(normalizeCodeFull(" - ")).toBe("");
  });
});

describe("normalizadores de una sola línea: un salto de línea interno es un espacio", () => {
  // Una celda de CSV entrecomillada puede traer saltos de línea reales; ninguno debe sobrevivir en una
  // placa, un código o un correo (ni "pegar" dos palabras que estaban en líneas distintas).
  it("la placa no conserva saltos de línea ni retornos de carro", () => {
    expect(normalizePlate("AB\n123")).toBe("AB123");
    expect(normalizePlate("AB\r\n-123")).toBe("AB-123");
    expect(normalizePlate("A\rB\t1")).toBe("AB1");
  });

  it("el código convierte el salto de línea en guion, igual que un espacio", () => {
    expect(normalizeCodeFull("ch\n40\t01")).toBe("CH-40-01");
    expect(normalizeCode("ch\r\n40")).toBe("CH-40");
  });

  it("el correo reemplaza el salto de línea por un espacio (no lo 'arregla': la validación lo rechazará)", () => {
    expect(normalizeEmail("ana\n@x.co")).toBe("ana @x.co");
    expect(normalizeEmail("ana@x.co\r\n")).toBe("ana@x.co");
  });

  it("el código derivado de un nombre trata el salto de línea como separador", () => {
    expect(slugCode("Carga\nrefrigerada")).toBe("CARGA_REFRIGERADA");
  });
});

describe("hasUnsupportedCodeChars", () => {
  it("es falso para lo que normalizeCodeFull convierte sin cambiar de qué código se trata", () => {
    const harmless = [
      "EQ-1",
      " eq 5 ",
      "Código ñandú",
      `ab${EN_DASH}12`,
      `a${ZWSP}b`,
      `ch${NBSP}40`,
      "v_h.1-2",
      "a  -  b",
      "--",
      "",
      "   ",
    ];
    for (const sample of harmless) expect(hasUnsupportedCodeChars(sample), JSON.stringify(sample)).toBe(false);
  });

  it("es verdadero cuando se borraría un símbolo (CH/40/01 no puede pasar a CH4001)", () => {
    for (const sample of ["CH/40/01", "EQ#5", "A&B", "a(1)", "x'y", "1+1", "50%", "x@y", "a,b", "a;b", "C:1", "a\\b", "a|b", "Nº5"]) {
      expect(hasUnsupportedCodeChars(sample), sample).toBe(true);
    }
  });

  it("es verdadero con letras de otro alfabeto que se ven como latinas (no se pierden en silencio)", () => {
    // Sin esta guarda, "СН-40" (С y Н cirílicas) se guardaría como "40".
    expect(hasUnsupportedCodeChars(`${CYRILLIC_ES}${CYRILLIC_EN}-40`)).toBe(true);
    expect(normalizeCodeFull(`${CYRILLIC_ES}${CYRILLIC_EN}-40`)).toBe("40");
    expect(hasUnsupportedCodeChars("Ω1")).toBe(true);
    expect(hasUnsupportedCodeChars("\u{1F600}")).toBe(true);
    expect(hasUnsupportedCodeChars("ＡＢ１")).toBe(true);
  });

  it("no acusa a lo que no es texto (null, undefined, números)", () => {
    expect(hasUnsupportedCodeChars(null)).toBe(false);
    expect(hasUnsupportedCodeChars(undefined)).toBe(false);
    expect(hasUnsupportedCodeChars(42 as unknown as string)).toBe(false);
  });

  it("si es falso, normalizeCodeFull conserva todas las letras y dígitos (nada con significado se pierde)", () => {
    const samples = ["eq 5", "Ñandú-12", `ab${EN_DASH}12`, "x_y.z-1", "TRL 1234", "ch  40   01"];
    for (const sample of samples) {
      expect(hasUnsupportedCodeChars(sample)).toBe(false);
      const expected = stripDiacritics(sample).toUpperCase().replace(/[^A-Z0-9]/g, "");
      expect(normalizeCodeFull(sample).replace(/[^A-Z0-9]/g, ""), sample).toBe(expected);
    }
  });
});

describe("slugCode", () => {
  it("convierte un nombre en un código estable", () => {
    expect(slugCode("Carga refrigerada")).toBe("CARGA_REFRIGERADA");
  });

  it("quita tildes y signos, y agrupa los separadores", () => {
    expect(slugCode("¡Camión rígido (40') !")).toBe("CAMION_RIGIDO_40");
    expect(slugCode("Ñandú/ \t Pérez")).toBe("NANDU_PEREZ");
  });

  it("conserva los dígitos", () => {
    expect(slugCode("Ruta 2")).toBe("RUTA_2");
  });

  it("no deja guiones bajos en los extremos", () => {
    expect(slugCode("  --Carga--  ")).toBe("CARGA");
  });

  it("limita a 40 caracteres y no termina en guion bajo aunque el corte caiga en un separador", () => {
    const name = `${"a".repeat(39)} b`;
    expect(slugCode(name)).toBe("A".repeat(39));
    expect(slugCode("z".repeat(80))).toHaveLength(40);
  });

  it("devuelve vacío si el nombre no tiene letras ni dígitos", () => {
    expect(slugCode("¿¡?!")).toBe("");
    expect(slugCode(null)).toBe("");
    expect(slugCode(undefined)).toBe("");
  });

  it("es idempotente", () => {
    const once = slugCode("Carga refrigerada (frío) 2");
    expect(slugCode(once)).toBe(once);
  });
});

describe("normalizeEmail", () => {
  it("recorta y pasa a minúsculas (User.email distingue mayúsculas)", () => {
    expect(normalizeEmail("  Ana@Ejemplo.COM ")).toBe("ana@ejemplo.com");
    expect(normalizeEmail(`${NBSP}ANA@X.CO${NBSP}`)).toBe("ana@x.co");
  });

  it("no valida ni 'arregla' un correo con espacios interiores", () => {
    expect(normalizeEmail("ana @x.com")).toBe("ana @x.com");
  });

  it("devuelve vacío ante valores que no son texto", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });
});

describe("stripBom", () => {
  it("quita la marca BOM inicial, incluso si hay varias", () => {
    expect(stripBom(`${BOM}a,b`)).toBe("a,b");
    expect(stripBom(`${BOM}${BOM}a`)).toBe("a");
  });

  it("no toca un BOM que no esté al inicio ni un texto sin BOM", () => {
    expect(stripBom(`a${BOM}b`)).toBe(`a${BOM}b`);
    expect(stripBom("a,b")).toBe("a,b");
    expect(stripBom("")).toBe("");
  });
});

describe("stripDiacritics, unifyDashes y comparableKey", () => {
  it("stripDiacritics quita las marcas pero no cambia las letras base", () => {
    expect(stripDiacritics("Camión Ñandú Über")).toBe("Camion Nandu Uber");
  });

  it("unifyDashes unifica rayas y signo menos", () => {
    expect(unifyDashes(`a${EN_DASH}b${EM_DASH}c${MINUS}d-e`)).toBe("a-b-c-d-e");
  });

  it("comparableKey ignora mayúsculas, tildes y espacios repetidos", () => {
    expect(comparableKey("  Puerto   de BALBOA ")).toBe(comparableKey("puerto de balboa"));
    expect(comparableKey("Colón")).toBe(comparableKey("COLON"));
    expect(comparableKey("Colón")).not.toBe(comparableKey("Colonia"));
  });
});
