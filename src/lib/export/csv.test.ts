import { describe, expect, it } from "vitest";
import { toCsv, type CsvColumn } from "./csv";

type Row = { name: string; qty: number; note: string | null; when: Date };

const cols: CsvColumn<Row>[] = [
  { header: "Nombre", value: (r) => r.name },
  { header: "Cantidad", value: (r) => r.qty },
  { header: "Nota", value: (r) => r.note },
  { header: "Fecha", value: (r) => r.when },
];

const BOM = "﻿";

describe("csv serializer", () => {
  it("emite BOM, header y filas con CRLF", () => {
    const csv = toCsv(
      [{ name: "Pedro", qty: 3, note: "ok", when: new Date("2026-07-16T00:00:00.000Z") }],
      cols,
    );
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(BOM.length).split("\r\n");
    expect(lines[0]).toBe("Nombre,Cantidad,Nota,Fecha");
    expect(lines[1]).toBe("Pedro,3,ok,2026-07-16T00:00:00.000Z");
  });

  it("escapa comas y comillas envolviendo en comillas", () => {
    const csv = toCsv([{ name: 'Ruiz, "El Rapido"', qty: 1, note: null, when: new Date(0) }], cols);
    expect(csv).toContain('"Ruiz, ""El Rapido"""');
  });

  it("representa null como celda vacia", () => {
    const csv = toCsv([{ name: "X", qty: 0, note: null, when: new Date(0) }], cols);
    const line = csv.slice(BOM.length).split("\r\n")[1];
    expect(line).toBe("X,0,,1970-01-01T00:00:00.000Z");
  });

  it("neutraliza inyeccion de formulas prefijando con comilla", () => {
    const csv = toCsv([{ name: "=SUM(A1:A9)", qty: 1, note: "@cmd", when: new Date(0) }], cols);
    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).toContain("'@cmd");
  });

  it("maneja salto de linea dentro de un campo", () => {
    const csv = toCsv([{ name: "linea1\nlinea2", qty: 1, note: null, when: new Date(0) }], cols);
    expect(csv).toContain('"linea1\nlinea2"');
  });

  it("solo header cuando no hay filas", () => {
    const csv = toCsv<Row>([], cols);
    expect(csv).toBe(`${BOM}Nombre,Cantidad,Nota,Fecha\r\n`);
  });
});
