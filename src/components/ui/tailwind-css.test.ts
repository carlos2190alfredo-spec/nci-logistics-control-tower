import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guarda del CSS del producto. Tailwind (v4, detección automática) escanea TODOS
 * los archivos del repositorio, incluidos fixtures JSON, pruebas y documentos, en
 * busca de clases. Un texto que parezca una clase con valor arbitrario pero esté
 * mal formado, p. ej. una comilla escapada como entidad HTML dentro de un
 * `url()`, genera una regla inválida en el CSS compilado. Ni `tsc`, ni ESLint,
 * ni las pruebas de componentes lo ven, pero `next build` falla al intentar
 * resolver esa URL como un archivo (`Can't resolve './&'`).
 *
 * Esta prueba compila el `globals.css` real con el mismo plugin de PostCSS que
 * usa Next y exige que no haya ningún `url()` roto. Si falla, el mensaje incluye
 * la regla: busque en el repositorio el texto que la originó y no lo escriba
 * escapado (p. ej. guarde `'` y no su entidad HTML).
 */
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const requireFromHere = createRequire(import.meta.url);

type PostcssLike = { process: (css: string, options: { from: string }) => Promise<{ css: string }> };

async function compileProductCss(): Promise<string> {
  const tailwindEntry = requireFromHere.resolve("@tailwindcss/postcss");
  const tailwind = requireFromHere("@tailwindcss/postcss") as (options: { base: string }) => unknown;
  // `postcss` no es una dependencia directa del proyecto: se resuelve desde el plugin que lo trae.
  const postcss = createRequire(tailwindEntry)("postcss") as (plugins: unknown[]) => PostcssLike;
  const from = path.join(repoRoot, "src/app/globals.css");
  const result = await postcss([tailwind({ base: repoRoot })]).process(readFileSync(from, "utf8"), { from });
  return result.css;
}

/** Cada `url(...)` del CSS con su contexto, para un mensaje de fallo útil. */
function brokenUrls(css: string): string[] {
  const broken: string[] = [];
  for (const match of css.matchAll(/url\(([^)]*)\)/g)) {
    const argument = match[1].trim();
    const unquoted = !/^['"]/.test(argument);
    // Entidad HTML sin interpretar (`&#x27;`, `&quot;`, `&amp;`...) o `url(&...`.
    const hasEntity = /&(?:#x?[0-9a-f]+|quot|apos|amp|lt|gt);/i.test(argument) || argument.startsWith("&");
    if (hasEntity && (unquoted || argument.startsWith("&"))) broken.push(match[0].slice(0, 160));
  }
  return broken;
}

// Las entidades se arman en tiempo de ejecución: este archivo también lo escanea Tailwind y
// no debe contener, ni siquiera como ejemplo, el texto que la guarda busca.
const APOS_ENTITY = "&#" + "x27;";
const QUOT_ENTITY = "&" + "quot;";

describe("brokenUrls (el detector de la guarda)", () => {
  it("detecta un url() con la comilla escapada como entidad HTML", () => {
    expect(brokenUrls(`a { background-image: url(${APOS_ENTITY}data:image/svg+xml;utf8,x${APOS_ENTITY}); }`)).toHaveLength(1);
    expect(brokenUrls(`a { background-image: url(${QUOT_ENTITY}x${QUOT_ENTITY}); }`)).toHaveLength(1);
  });

  it("no marca url() válidos, con comillas reales o sin ellas", () => {
    expect(brokenUrls("a { background-image: url('data:image/svg+xml;utf8,%3Csvg%3E'); }")).toEqual([]);
    expect(brokenUrls('a { background-image: url("x.png"); }')).toEqual([]);
    expect(brokenUrls("a { background-image: url(x.png); }")).toEqual([]);
  });
});

describe("CSS compilado del producto", () => {
  it("compila y no contiene ningún url() roto (comillas escapadas como entidad HTML)", async () => {
    const css = await compileProductCss();
    // Sanidad: se compiló de verdad (tokens + utilidades), no una cadena vacía.
    expect(css.length).toBeGreaterThan(20_000);
    expect(css).toContain("--color-danger-strong");
    expect(brokenUrls(css)).toEqual([]);
  }, 180_000);
});
