import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PAST_GRACE_MS,
  PANAMA_TZ,
  isInPast,
  parseTenantLocal,
  tenantDayBounds,
  tenantLocalDate,
  tenantLocalTime,
  tenantLocalWeekday,
  toTenantLocalInput,
} from "./datetime";

// Estas pruebas deben pasar igual con `TZ=UTC`, `TZ=America/Panama` o cualquier otra zona del proceso:
//   TZ=UTC pnpm exec vitest run src/lib/datetime.test.ts
//   TZ=America/Panama pnpm exec vitest run src/lib/datetime.test.ts

const iso = (date: Date | null) => (date ? date.toISOString() : null);
const NY = "America/New_York";
const LONDON = "Europe/London";

/**
 * Recorre instantes y comprueba la ida y vuelta: leer la hora de pared escrita siempre devuelve la misma
 * hora de pared y el mismo instante, salvo en la hora que se repite al retroceder el reloj. `repeatedHour`
 * es esa segunda pasada [desde, hasta) en UTC: se escribe igual que la primera y se lee como ella, una hora
 * antes.
 */
function sweepRoundTrip(tz: string, repeatedHour: readonly [number, number], from: number, to: number, stepMs: number) {
  const failures: string[] = [];
  let checked = 0;
  let repeated = 0;
  for (let instant = from; instant < to; instant += stepMs) {
    const local = toTenantLocalInput(new Date(instant), tz);
    const back = parseTenantLocal(local, tz);
    checked += 1;
    if (!back) {
      failures.push(`${local}: null`);
      continue;
    }
    if (toTenantLocalInput(back, tz) !== local) failures.push(`${local}: no vuelve a la misma hora de pared`);
    const inRepeatedHour = instant >= repeatedHour[0] && instant < repeatedHour[1];
    if (inRepeatedHour) repeated += 1;
    const expected = inRepeatedHour ? instant - 60 * 60 * 1000 : instant;
    if (back.getTime() !== expected) {
      failures.push(`${local}: ${back.toISOString()} en vez de ${new Date(expected).toISOString()}`);
    }
  }
  return { failures, checked, repeated };
}

describe("parseTenantLocal: Panama (UTC-5, sin horario de verano)", () => {
  it("PANAMA_TZ es la zona por defecto", () => {
    expect(PANAMA_TZ).toBe("America/Panama");
    expect(iso(parseTenantLocal("2026-11-20T14:00", PANAMA_TZ))).toBe(
      iso(parseTenantLocal("2026-11-20T14:00")),
    );
  });

  it.each([
    ["2026-11-20T14:00", "2026-11-20T19:00:00.000Z"],
    ["2026-11-20T14:00:00", "2026-11-20T19:00:00.000Z"],
    ["2026-11-20T14:00:30", "2026-11-20T19:00:30.000Z"],
    // Medianoche y fin de dia: cruzan el dia en UTC.
    ["2026-11-20T00:00", "2026-11-20T05:00:00.000Z"],
    ["2026-11-20T19:00", "2026-11-21T00:00:00.000Z"],
    ["2026-11-20T23:59:59", "2026-11-21T04:59:59.000Z"],
    // Cambio de anio.
    ["2026-12-31T23:59", "2027-01-01T04:59:00.000Z"],
    ["2027-01-01T00:00", "2027-01-01T05:00:00.000Z"],
    // Sin horario de verano: el desfase es el mismo en enero y en julio.
    ["2026-01-15T12:00", "2026-01-15T17:00:00.000Z"],
    ["2026-07-15T12:00", "2026-07-15T17:00:00.000Z"],
    // Anio bisiesto.
    ["2028-02-29T12:00", "2028-02-29T17:00:00.000Z"],
    ["2000-02-29T12:00", "2000-02-29T17:00:00.000Z"],
    // Los limites del rango de anios.
    ["2999-12-31T23:59", "3000-01-01T04:59:00.000Z"],
  ])("%s -> %s", (input, expected) => {
    expect(iso(parseTenantLocal(input))).toBe(expected);
  });

  it("conserva los segundos y no redondea", () => {
    const date = parseTenantLocal("2026-11-20T14:00:59");
    expect(date?.getTime()).toBe(Date.parse("2026-11-20T19:00:59.000Z"));
  });
});

describe("parseTenantLocal: valores invalidos devuelven null (nunca se corrigen en silencio)", () => {
  it.each([
    // Formato.
    ["cadena vacia", ""],
    ["espacio al inicio", " 2026-11-20T14:00"],
    ["espacio al final", "2026-11-20T14:00 "],
    ["salto de linea final", "2026-11-20T14:00\n"],
    ["espacio en vez de T", "2026-11-20 14:00"],
    ["sin minutos", "2026-11-20T14"],
    ["solo la fecha", "2026-11-20"],
    ["sin separadores", "20261120T1400"],
    ["mes de un digito", "2026-1-20T14:00"],
    ["anio de dos digitos", "26-11-20T14:00"],
    ["fraccion de segundo", "2026-11-20T14:00:00.000"],
    ["digitos que no son ASCII", "２０２６-11-20T14:00"],
    ["texto cualquiera", "manana por la tarde"],
    // Zona explicita: el valor ya no seria hora de pared.
    ["con Z", "2026-11-20T14:00Z"],
    ["con segundos y Z", "2026-11-20T14:00:00Z"],
    ["con desfase negativo", "2026-11-20T14:00:00-05:00"],
    ["con desfase positivo", "2026-11-20T14:00:00+01:00"],
    ["con desfase sin dos puntos", "2026-11-20T14:00-0500"],
    ["con fraccion y Z", "2026-11-20T14:00:00.000Z"],
    // Calendario.
    ["31 de febrero", "2026-02-31T10:00"],
    ["29 de febrero en anio no bisiesto", "2026-02-29T10:00"],
    ["29 de febrero de 2100 (no bisiesto)", "2100-02-29T10:00"],
    ["31 de un mes de 30 dias", "2026-04-31T10:00"],
    ["31 de noviembre", "2026-11-31T10:00"],
    ["dia 00", "2026-11-00T10:00"],
    ["mes 00", "2026-00-10T10:00"],
    ["mes 13", "2026-13-10T10:00"],
    // Hora.
    ["hora 24", "2026-11-20T24:00"],
    ["hora 25", "2026-11-20T25:00"],
    ["minuto 60", "2026-11-20T10:60"],
    ["segundo 60", "2026-11-20T10:00:60"],
    // Rango de anios: el error tipico es teclear "26" en el campo de anio y obtener 0026.
    ["anio 0026", "0026-11-20T14:00"],
    ["anio 0000", "0000-01-01T00:00"],
    ["anio 1899", "1899-12-31T23:59"],
    ["anio 3000", "3000-01-01T00:00"],
    ["anio 9999", "9999-12-31T23:59"],
  ])("rechaza %s", (_caso, input) => {
    expect(parseTenantLocal(input)).toBeNull();
  });

  it("rechaza lo que no es una cadena (FormData puede traer un File o null)", () => {
    for (const value of [null, undefined, 20261120, new Date(), {}, []]) {
      expect(parseTenantLocal(value as unknown as string)).toBeNull();
    }
  });

  it("acepta los limites validos del rango", () => {
    expect(parseTenantLocal("1900-01-01T00:00")).not.toBeNull();
    expect(parseTenantLocal("2999-12-31T23:59")).not.toBeNull();
  });

  it("una zona invalida es un error de programacion: lanza RangeError", () => {
    expect(() => parseTenantLocal("2026-11-20T14:00", "Nunca/Jamas")).toThrow(RangeError);
    expect(() => toTenantLocalInput(new Date(), "Nunca/Jamas")).toThrow(RangeError);
  });
});

describe("toTenantLocalInput", () => {
  it("formatea el instante como hora de pared de Panama", () => {
    expect(toTenantLocalInput(new Date("2026-11-20T19:00:00Z"))).toBe("2026-11-20T14:00");
  });

  it.each([
    ["2026-11-20T05:00:00Z", "2026-11-20T00:00"], // medianoche: nunca "24:00"
    ["2026-11-20T04:59:59Z", "2026-11-19T23:59"],
    ["2026-11-21T04:59:00Z", "2026-11-20T23:59"],
    ["2027-01-01T04:59:00Z", "2026-12-31T23:59"], // cambio de anio
    ["2027-01-01T05:00:00Z", "2027-01-01T00:00"],
    ["2028-02-29T17:30:00Z", "2028-02-29T12:30"],
  ])("%s -> %s", (instant, expected) => {
    expect(toTenantLocalInput(new Date(instant))).toBe(expected);
  });

  it("trunca los segundos y milisegundos, no los redondea", () => {
    expect(toTenantLocalInput(new Date("2026-11-20T19:00:59.999Z"))).toBe("2026-11-20T14:00");
  });

  it("respeta la zona indicada", () => {
    const date = new Date("2026-11-20T19:00:00Z");
    expect(toTenantLocalInput(date, "UTC")).toBe("2026-11-20T19:00");
    expect(toTenantLocalInput(date, "Asia/Tokyo")).toBe("2026-11-21T04:00");
    expect(toTenantLocalInput(date, "Asia/Kolkata")).toBe("2026-11-21T00:30");
    expect(toTenantLocalInput(date, NY)).toBe("2026-11-20T14:00");
  });

  it("devuelve cadena vacia ante una fecha invalida o ante algo que no es una fecha", () => {
    expect(toTenantLocalInput(new Date(Number.NaN))).toBe("");
    expect(toTenantLocalInput("2026-11-20" as unknown as Date)).toBe("");
    expect(toTenantLocalInput(null as unknown as Date)).toBe("");
  });

  it("acepta una fecha creada en otro contexto de ejecucion (instanceof Date falla)", () => {
    const foreign = runInNewContext("new Date('2026-11-20T19:00:00Z')") as Date;
    expect(foreign instanceof Date).toBe(false);
    expect(toTenantLocalInput(foreign)).toBe("2026-11-20T14:00");
  });

  it("ida y vuelta: parse(toLocal(parse(x))) === x para Panama", () => {
    for (const value of ["2026-11-20T14:00", "2026-01-01T00:00", "2026-12-31T23:59", "2028-02-29T00:01"]) {
      const date = parseTenantLocal(value);
      expect(date).not.toBeNull();
      expect(toTenantLocalInput(date as Date)).toBe(value);
    }
  });
});

describe("zonas con horario de verano (America/New_York)", () => {
  it.each([
    // Invierno (EST, -5) y verano (EDT, -4).
    ["2026-01-15T12:00", "2026-01-15T17:00:00.000Z"],
    ["2026-07-15T12:00", "2026-07-15T16:00:00.000Z"],
    // Alrededor del cambio de primavera (2026-03-08 02:00 -> 03:00).
    ["2026-03-08T01:59", "2026-03-08T06:59:00.000Z"], // EST
    ["2026-03-08T03:00", "2026-03-08T07:00:00.000Z"], // EDT
    // Alrededor del cambio de otono (2026-11-01 02:00 EDT -> 01:00 EST).
    ["2026-11-01T00:59", "2026-11-01T04:59:00.000Z"], // EDT
    ["2026-11-01T02:00", "2026-11-01T07:00:00.000Z"], // EST
  ])("%s -> %s", (input, expected) => {
    expect(iso(parseTenantLocal(input, NY))).toBe(expected);
  });

  it("hora INEXISTENTE (02:30 del 2026-03-08): se corre hacia adelante, como Date/Temporal 'compatible'", () => {
    const date = parseTenantLocal("2026-03-08T02:30", NY);
    expect(iso(date)).toBe("2026-03-08T07:30:00.000Z"); // 03:30 EDT
    expect(toTenantLocalInput(date as Date, NY)).toBe("2026-03-08T03:30");
    // No hay ida y vuelta exacta (la hora no existe), pero es estable: normalizar dos veces no la mueve mas.
    const again = parseTenantLocal(toTenantLocalInput(date as Date, NY), NY);
    expect(iso(again)).toBe(iso(date));
  });

  it("hora AMBIGUA (01:30 del 2026-11-01): se toma la primera ocurrencia (EDT) y la ida y vuelta es exacta", () => {
    const date = parseTenantLocal("2026-11-01T01:30", NY);
    expect(iso(date)).toBe("2026-11-01T05:30:00.000Z"); // 01:30 EDT, antes del retroceso
    expect(toTenantLocalInput(date as Date, NY)).toBe("2026-11-01T01:30");
    // La segunda ocurrencia (01:30 EST = 06:30Z) se escribe igual: al releerla vuelve a la primera.
    expect(toTenantLocalInput(new Date("2026-11-01T06:30:00Z"), NY)).toBe("2026-11-01T01:30");
  });

  // 01:00-02:00 EST de 2026-11-01: la segunda pasada de la hora repetida (06:00Z-07:00Z).
  const NY_REPEATED_HOUR = [Date.UTC(2026, 10, 1, 6, 0, 0), Date.UTC(2026, 10, 1, 7, 0, 0)] as const;
  const sweep = (from: number, to: number, stepMs: number) => sweepRoundTrip(NY, NY_REPEATED_HOUR, from, to, stepMs);

  // Los barridos hacen decenas de miles de llamadas a Intl: con la maquina saturada (CI compartido) los 5 s
  // por defecto de Vitest no alcanzan. El timeout es solo margen; el trabajo normal tarda menos de 1 s.
  it("barrido de todo 2026 cada 2 horas: la ida y vuelta es exacta", () => {
    const result = sweep(Date.UTC(2026, 0, 1, 5, 0, 0), Date.UTC(2027, 0, 1, 5, 0, 0), 2 * 60 * 60 * 1000);
    expect(result.failures).toEqual([]);
    expect(result.checked).toBe(365 * 12);
  }, 60_000);

  it("barrido cada 15 minutos alrededor de los dos cambios de horario: exacto salvo la hora repetida", () => {
    const spring = sweep(Date.UTC(2026, 2, 7, 0, 0, 0), Date.UTC(2026, 2, 10, 0, 0, 0), 15 * 60 * 1000);
    expect(spring.failures).toEqual([]);
    expect(spring.repeated).toBe(0);
    const autumn = sweep(Date.UTC(2026, 9, 31, 0, 0, 0), Date.UTC(2026, 10, 3, 0, 0, 0), 15 * 60 * 1000);
    expect(autumn.failures).toEqual([]);
    expect(autumn.repeated).toBe(4); // 01:00, 01:15, 01:30 y 01:45 EST se leen como EDT
  }, 60_000);

  it("zonas con desfases de media hora o tres cuartos", () => {
    expect(iso(parseTenantLocal("2026-11-20T14:00", "Asia/Kolkata"))).toBe("2026-11-20T08:30:00.000Z");
    expect(iso(parseTenantLocal("2026-11-20T14:00", "Pacific/Chatham"))).toBe("2026-11-20T00:15:00.000Z");
    expect(iso(parseTenantLocal("2026-11-20T14:00", "Australia/Lord_Howe"))).toBe("2026-11-20T03:00:00.000Z");
    for (const tz of ["Asia/Kolkata", "Pacific/Chatham", "Australia/Lord_Howe", "Europe/London", "Asia/Tokyo", "UTC"]) {
      const date = parseTenantLocal("2026-07-04T09:45", tz);
      expect(toTenantLocalInput(date as Date, tz), tz).toBe("2026-07-04T09:45");
    }
  });
});

describe("zonas AL ESTE de UTC con horario de verano", () => {
  // Reino Unido 2026: la hora de verano (BST) empieza el domingo 29 de marzo a las 01:00 UTC (01:00 GMT pasa
  // a 02:00 BST) y termina el domingo 25 de octubre a las 01:00 UTC (02:00 BST pasa a 01:00 GMT). Los vectores
  // salen de esas reglas, no de este codigo. Al este de UTC la hora de pared va ADELANTE del instante: es el
  // caso donde el desfase vigente en la propia hora escrita ya es el posterior al cambio, y donde un calculo
  // ingenuo elige la segunda ocurrencia de una hora repetida.
  it.each([
    ["2026-01-15T12:00", "2026-01-15T12:00:00.000Z"], // GMT
    ["2026-07-15T12:00", "2026-07-15T11:00:00.000Z"], // BST
    ["2026-03-29T00:59", "2026-03-29T00:59:00.000Z"], // GMT, justo antes del salto
    ["2026-03-29T02:00", "2026-03-29T01:00:00.000Z"], // BST, justo despues
    ["2026-10-25T00:59", "2026-10-24T23:59:00.000Z"], // BST
    ["2026-10-25T02:00", "2026-10-25T02:00:00.000Z"], // GMT
  ])("Londres: %s -> %s", (input, expected) => {
    expect(iso(parseTenantLocal(input, LONDON))).toBe(expected);
  });

  it("Londres, hora INEXISTENTE (01:30 del 2026-03-29): se corre hacia adelante a 02:30 BST", () => {
    const date = parseTenantLocal("2026-03-29T01:30", LONDON);
    expect(iso(date)).toBe("2026-03-29T01:30:00.000Z");
    expect(toTenantLocalInput(date as Date, LONDON)).toBe("2026-03-29T02:30");
  });

  it("Londres, hora AMBIGUA (01:30 del 2026-10-25): primera ocurrencia (BST, 00:30Z), no la segunda (GMT, 01:30Z)", () => {
    const date = parseTenantLocal("2026-10-25T01:30", LONDON);
    expect(iso(date)).toBe("2026-10-25T00:30:00.000Z");
    expect(toTenantLocalInput(date as Date, LONDON)).toBe("2026-10-25T01:30");
    // La segunda ocurrencia se escribe igual.
    expect(toTenantLocalInput(new Date("2026-10-25T01:30:00Z"), LONDON)).toBe("2026-10-25T01:30");
  });

  it("Londres: barrido cada 15 minutos alrededor de los dos cambios, exacto salvo la hora repetida", () => {
    const repeatedHour = [Date.UTC(2026, 9, 25, 1, 0, 0), Date.UTC(2026, 9, 25, 2, 0, 0)] as const; // 01:00-02:00 GMT
    const step = 15 * 60 * 1000;
    const spring = sweepRoundTrip(LONDON, repeatedHour, Date.UTC(2026, 2, 28), Date.UTC(2026, 2, 31), step);
    expect(spring.failures).toEqual([]);
    expect(spring.repeated).toBe(0);
    const autumn = sweepRoundTrip(LONDON, repeatedHour, Date.UTC(2026, 9, 24), Date.UTC(2026, 9, 27), step);
    expect(autumn.failures).toEqual([]);
    expect(autumn.repeated).toBe(4);
  }, 60_000);

  // Lord Howe (Australia): UTC+10:30 en invierno y UTC+11 en verano; el cambio es de 30 minutos, no de una hora.
  // 2026: empieza el domingo 4 de octubre (02:00 pasa a 02:30) y termina el domingo 5 de abril (02:00 pasa a 01:30).
  it("Lord Howe, cambio de MEDIA hora: la hora inexistente y la repetida", () => {
    const LORD_HOWE = "Australia/Lord_Howe";
    const missing = parseTenantLocal("2026-10-04T02:15", LORD_HOWE); // no existe: 02:00 salta a 02:30
    expect(iso(missing)).toBe("2026-10-03T15:45:00.000Z"); // desfase de antes (+10:30)
    expect(toTenantLocalInput(missing as Date, LORD_HOWE)).toBe("2026-10-04T02:45");
    const repeated = parseTenantLocal("2026-04-05T01:45", LORD_HOWE); // 01:30-02:00 ocurre dos veces
    expect(iso(repeated)).toBe("2026-04-04T14:45:00.000Z"); // primera: aun con horario de verano (+11)
    expect(toTenantLocalInput(repeated as Date, LORD_HOWE)).toBe("2026-04-05T01:45");
    expect(iso(parseTenantLocal("2026-04-05T02:00", LORD_HOWE))).toBe("2026-04-04T15:30:00.000Z"); // ya +10:30
  });
});

describe("independencia de la zona del proceso (process.env.TZ)", () => {
  const original = process.env.TZ;

  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  // [zona del proceso, cómo la interpretaria `new Date("2026-11-20T14:00")`]: demuestra que el cambio de
  // zona surtio efecto, de modo que la prueba no pase "en vacio".
  it.each([
    ["UTC", "2026-11-20T14:00:00.000Z"],
    ["America/Panama", "2026-11-20T19:00:00.000Z"],
    ["Asia/Tokyo", "2026-11-20T05:00:00.000Z"],
    ["America/New_York", "2026-11-20T19:00:00.000Z"],
    ["Pacific/Auckland", "2026-11-20T01:00:00.000Z"],
  ])("con TZ=%s produce los mismos instantes", (zone, nativeDateInterpretation) => {
    process.env.TZ = zone;
    expect(new Date("2026-11-20T14:00").toISOString()).toBe(nativeDateInterpretation);

    expect(iso(parseTenantLocal("2026-11-20T14:00"))).toBe("2026-11-20T19:00:00.000Z");
    expect(iso(parseTenantLocal("2026-11-20T14:00:00"))).toBe("2026-11-20T19:00:00.000Z");
    expect(iso(parseTenantLocal("2026-02-31T10:00"))).toBeNull();
    expect(iso(parseTenantLocal("2026-11-20T14:00:00-05:00"))).toBeNull();
    expect(toTenantLocalInput(new Date("2026-11-20T19:00:00Z"))).toBe("2026-11-20T14:00");
    expect(toTenantLocalInput(new Date("2026-11-21T04:59:00Z"))).toBe("2026-11-20T23:59");
    expect(iso(parseTenantLocal("2026-03-08T02:30", NY))).toBe("2026-03-08T07:30:00.000Z");
    expect(iso(parseTenantLocal("2026-11-01T01:30", NY))).toBe("2026-11-01T05:30:00.000Z");
  });

  it("el codigo no usa getters locales de Date ni lee la zona del proceso", () => {
    const source = readFileSync("src/lib/datetime.ts", "utf8")
      // Los comentarios mencionan getters locales a modo de advertencia: se evaluan solo las lineas de codigo.
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
      .join("\n");
    expect(source).not.toMatch(/\.(getFullYear|getMonth|getDate|getDay|getHours|getMinutes|getSeconds|getTimezoneOffset)\(/);
    expect(source).not.toMatch(/\.set(FullYear|Month|Date|Hours|Minutes|Seconds)\(/);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/new Date\(\s*(value|input)\s*\)/);
  });
});

describe("isInPast", () => {
  const now = new Date("2026-11-20T12:00:00.000Z");

  it("tolera 5 minutos por defecto", () => {
    expect(DEFAULT_PAST_GRACE_MS).toBe(5 * 60 * 1000);
    expect(isInPast(new Date("2026-11-20T11:54:59.999Z"), now)).toBe(true);
    expect(isInPast(new Date("2026-11-20T11:55:00.000Z"), now)).toBe(false); // justo en el borde no es pasado
    expect(isInPast(new Date("2026-11-20T11:57:00.000Z"), now)).toBe(false);
    expect(isInPast(now, now)).toBe(false);
    expect(isInPast(new Date("2026-11-20T12:00:00.001Z"), now)).toBe(false);
    expect(isInPast(new Date("2026-12-01T00:00:00.000Z"), now)).toBe(false);
  });

  it("acepta una tolerancia propia, incluida cero y negativa", () => {
    expect(isInPast(new Date(now.getTime() - 1), now, 0)).toBe(true);
    expect(isInPast(now, now, 0)).toBe(false);
    expect(isInPast(new Date("2026-11-20T11:10:00.000Z"), now, 60 * 60 * 1000)).toBe(false);
    expect(isInPast(new Date("2026-11-20T10:59:59.999Z"), now, 60 * 60 * 1000)).toBe(true);
    // Tolerancia negativa: exige anticipacion minima.
    expect(isInPast(new Date("2026-11-20T12:05:00.000Z"), now, -10 * 60 * 1000)).toBe(true);
  });

  it("usa el reloj del sistema si no se inyecta `now`", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-20T12:00:00.000Z"));
      expect(isInPast(new Date("2026-11-20T11:00:00.000Z"))).toBe(true);
      expect(isInPast(new Date("2026-11-20T11:58:00.000Z"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("una fecha invalida no es 'pasada': hay que validarla antes con parseTenantLocal", () => {
    expect(isInPast(new Date(Number.NaN), now)).toBe(false);
  });
});

describe("día local del tenant (zona explícita, sin depender del servidor)", () => {
  // 2026-07-14T00:30:00Z = lunes 13 de julio, 19:30 en Panamá (UTC-5, sin horario de verano).
  const mondayEvening = new Date("2026-07-14T00:30:00.000Z");

  it("tenantLocalDate / tenantLocalTime / tenantLocalWeekday leen la hora de pared de Panamá", () => {
    expect(tenantLocalDate(mondayEvening)).toBe("2026-07-13");
    expect(tenantLocalTime(mondayEvening)).toBe("19:30");
    expect(tenantLocalWeekday(mondayEvening)).toBe(1); // lunes; en UTC ya sería martes
  });

  it("con otra zona cambia el día (el valor sale de la zona indicada, no del servidor)", () => {
    expect(tenantLocalDate(mondayEvening, "UTC")).toBe("2026-07-14");
    expect(tenantLocalWeekday(mondayEvening, "UTC")).toBe(2);
    expect(tenantLocalDate(mondayEvening, "Asia/Tokyo")).toBe("2026-07-14");
    expect(tenantLocalTime(mondayEvening, "Asia/Tokyo")).toBe("09:30");
  });

  it("medianoche y fin de día de Panamá", () => {
    expect(tenantLocalTime(new Date("2026-07-13T05:00:00.000Z"))).toBe("00:00");
    expect(tenantLocalDate(new Date("2026-07-13T05:00:00.000Z"))).toBe("2026-07-13");
    expect(tenantLocalTime(new Date("2026-07-14T04:59:59.000Z"))).toBe("23:59");
    expect(tenantLocalDate(new Date("2026-07-14T04:59:59.000Z"))).toBe("2026-07-13");
  });

  it("tenantDayBounds: del primer al último instante del día de Panamá (fin exclusivo)", () => {
    const bounds = tenantDayBounds(mondayEvening);
    expect(bounds?.start.toISOString()).toBe("2026-07-13T05:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-07-14T05:00:00.000Z");
    // El instante de inicio pertenece al día; el de fin, al siguiente.
    expect(tenantLocalDate(bounds!.start)).toBe("2026-07-13");
    expect(tenantLocalDate(bounds!.end)).toBe("2026-07-14");
  });

  it("tenantDayBounds en una zona con horario de verano: el día del cambio dura 23 horas", () => {
    const springForward = new Date("2026-03-08T15:00:00.000Z"); // 11:00 en Nueva York (ya con horario de verano)
    const bounds = tenantDayBounds(springForward, "America/New_York");
    expect(bounds?.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("una fecha inválida no produce valores", () => {
    const invalid = new Date("no es una fecha");
    expect(tenantLocalDate(invalid)).toBe("");
    expect(tenantLocalTime(invalid)).toBe("");
    expect(tenantLocalWeekday(invalid)).toBeNull();
    expect(tenantDayBounds(invalid)).toBeNull();
  });
});
