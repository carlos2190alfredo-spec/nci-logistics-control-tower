import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Reglas de diseño del kit (R3 §1.5, ADR-006) verificadas sobre el código fuente
 * de los componentes que añadió o extendió la Fase 1:
 * - cero colores hex en JSX (todo sale de los tokens del tema);
 * - cero tokens "fantasma": una clase como `bg-surface-hover` o
 *   `text-warning-foreground` no da error en ninguna parte, simplemente no genera
 *   CSS y el elemento queda sin estilo. Es el defecto que más pasa inadvertido;
 * - cada utilidad de color semántica (`bg-`, `text-`, `border-`...) apunta a un
 *   `--color-*` que existe en `globals.css`.
 */
const KIT_FILES = [
  "button.tsx",
  "checkbox.tsx",
  "confirm-submit.tsx",
  "definition-list.tsx",
  "field-controls.tsx",
  "field.tsx",
  "form-context.tsx",
  "form-section.tsx",
  "page-notice.tsx",
  "segmented-links.tsx",
  "server-form.tsx",
  "usage-bar.tsx",
] as const;

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const definedColors = new Set([...read("../../app/globals.css").matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((match) => match[1]));

/** Familias de color del tema: solo las clases cuyo nombre empieza por una de ellas se validan contra `globals.css`. */
const COLOR_FAMILIES = new Set(["primary", "secondary", "accent", "success", "warning", "danger", "info", "surface", "background", "muted", "foreground", "border", "faint", "nav", "brand"]);
const COLOR_UTILITIES = /^(bg|text|border|ring|outline|divide|accent|fill|stroke|from|via|to|placeholder|decoration|caret)-(.+)$/;

/** Cadenas literales del archivo (donde viven las clases de Tailwind). */
function stringLiterals(source: string): string[] {
  return [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((match) => match[1] ?? match[2] ?? match[3] ?? "");
}

/** Clases de color semánticas (`text-danger-strong`, `border-danger/30`...) usadas en los literales de un archivo. */
function colorClassesIn(source: string): string[] {
  const found = new Set<string>();
  for (const literal of stringLiterals(source)) {
    for (const raw of literal.split(/\s+/)) {
      // Se quita la variante (`hover:`, `sm:`, `[&>svg]:`), el `!` de importancia y la opacidad (`/30`).
      const utility = raw.split(":").pop()?.replace(/^!/, "").replace(/\/\d+$/, "") ?? "";
      const match = COLOR_UTILITIES.exec(utility);
      if (!match) continue;
      const name = match[2];
      if (name.startsWith("[")) continue;
      if (COLOR_FAMILIES.has(name.split("-")[0])) found.add(`${match[1]}-${name}`);
    }
  }
  return [...found].sort();
}

describe("colorClassesIn (el detector de la guarda)", () => {
  it("extrae utilidades de color del tema, con variantes y opacidad", () => {
    const source = `const a = cn("rounded-lg border border-danger/30 bg-danger-soft/60 hover:bg-muted text-sm", cond && "text-danger-strong");`;
    expect(colorClassesIn(source)).toEqual(["bg-danger-soft", "bg-muted", "border-danger", "text-danger-strong"]);
  });

  it("ignora tamaños, anchos y valores arbitrarios", () => {
    const source = `"text-sm border-b border-2 shadow-xs bg-[url('data:image/svg+xml;utf8,x')] size-4 min-h-10 sm:grid-cols-[minmax(0,1fr)_340px]"`;
    expect(colorClassesIn(source)).toEqual([]);
  });

  it("detecta un token que no existe (el caso de `surface-hover`)", () => {
    const used = colorClassesIn(`"hover:bg-surface-hover text-warning-foreground"`);
    const unknown = used.filter((name) => !definedColors.has(name.replace(/^[a-z]+-/, "")));
    expect(unknown).toEqual(["bg-surface-hover", "text-warning-foreground"]);
  });
});

describe("código fuente del kit de la Fase 1", () => {
  it("el tema define los tokens que el kit necesita (sanidad del lector de globals.css)", () => {
    for (const token of ["danger-strong", "warning-strong", "primary-soft", "surface-sunken", "muted-foreground"]) {
      expect(definedColors.has(token), token).toBe(true);
    }
  });

  for (const file of KIT_FILES) {
    describe(file, () => {
      const source = read(`./${file}`);

      it("no usa colores hex (todo sale de los tokens del tema)", () => {
        expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
      });

      it("no usa los tokens inexistentes `surface-hover` ni `warning-foreground`", () => {
        expect(source).not.toMatch(/surface-hover|warning-foreground/);
      });

      it("cada utilidad de color del tema existe en globals.css", () => {
        const unknown = colorClassesIn(source).filter((name) => !definedColors.has(name.replace(/^[a-z]+-/, "")));
        expect(unknown).toEqual([]);
      });

      it("no inyecta HTML crudo ni deja console.log", () => {
        expect(source).not.toMatch(/dangerously\w*InnerHTML|console\.log\(/);
      });
    });
  }
});
