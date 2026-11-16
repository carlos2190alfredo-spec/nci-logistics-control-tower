// @vitest-environment jsdom
import { el as h } from "@/components/ui/test-element";
import { afterEach, describe, expect, it } from "vitest";
import { DefinitionList } from "@/components/ui/definition-list";
import { FormSection } from "@/components/ui/form-section";
import { PageNotice } from "@/components/ui/page-notice";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import { UsageBar } from "@/components/ui/usage-bar";
import { mount, unmountAll } from "@/components/ui/dom-test-utils";

afterEach(unmountAll);

describe("SegmentedLinks", () => {
  const items = [
    { active: true, count: 12, href: "/t/acme/fleet?vista=vehiculos", label: "Vehículos" },
    { active: false, count: 0, href: "/t/acme/fleet?vista=equipos", label: "Equipos" },
  ];

  it("son enlaces dentro de una navegación con nombre, no un tablist", async () => {
    const { container } = await mount(h(SegmentedLinks, { items, label: "Vistas de flota" }));
    const nav = container.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("Vistas de flota");
    expect(container.querySelector('[role="tablist"], [role="tab"]')).toBeNull();
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/t/acme/fleet?vista=vehiculos", "/t/acme/fleet?vista=equipos"]);
  });

  it("solo la vista activa lleva aria-current=page", async () => {
    const { container } = await mount(h(SegmentedLinks, { items }));
    const [vehicles, equipment] = [...container.querySelectorAll("a")];
    expect(vehicles.getAttribute("aria-current")).toBe("page");
    expect(equipment.hasAttribute("aria-current")).toBe(false);
  });

  it("muestra la cantidad (también 0) y respeta el objetivo táctil de 40 px", async () => {
    const { container } = await mount(h(SegmentedLinks, { items }));
    const [vehicles, equipment] = [...container.querySelectorAll("a")];
    // Con un espacio real: el nombre accesible y el texto del DOM dicen "Vehículos 12", no "Vehículos12".
    expect(vehicles.textContent).toBe("Vehículos 12");
    expect(equipment.textContent).toBe("Equipos 0");
    expect(vehicles.className).toContain("min-h-10");
  });

  it("sin count no pinta la burbuja y el nombre por defecto no choca con otras navegaciones", async () => {
    const { container } = await mount(h(SegmentedLinks, { items: [{ active: false, href: "/a", label: "A" }] }));
    expect(container.querySelector("a")!.textContent).toBe("A");
    expect(container.querySelector("nav")!.getAttribute("aria-label")).toBe("Secciones");
  });
});

describe("FormSection", () => {
  it("agrupa con fieldset + legend y enlaza la descripción", async () => {
    const { container } = await mount(h(FormSection, { description: "Los datos que verá el cliente.", title: "Datos de contacto" }, h("input", { name: "a" })));
    const fieldset = container.querySelector("fieldset")!;
    expect(fieldset.querySelector("legend")!.textContent).toBe("Datos de contacto");
    const descriptionId = fieldset.getAttribute("aria-describedby")!;
    expect(container.querySelector(`[id="${descriptionId}"]`)!.textContent).toBe("Los datos que verá el cliente.");
    // min-w-0: sin él el fieldset desborda en 375 px.
    expect(fieldset.className).toContain("min-w-0");
  });

  it("sin descripción no escribe aria-describedby", async () => {
    const { container } = await mount(h(FormSection, { title: "Datos" }, h("input", { name: "a" })));
    expect(container.querySelector("fieldset")!.hasAttribute("aria-describedby")).toBe(false);
  });

  it("rejilla de 2 columnas desde sm por defecto y de 1 con columns={1}", async () => {
    const two = await mount(h(FormSection, { title: "Dos" }, h("input", { name: "a" })));
    expect(two.container.querySelector("fieldset > div")!.className).toContain("sm:grid-cols-2");
    const one = await mount(h(FormSection, { columns: 1, title: "Una" }, h("input", { name: "a" })));
    expect(one.container.querySelector("fieldset > div")!.className).not.toContain("sm:grid-cols-2");
  });

  it("disabled deshabilita todos los controles hijos", async () => {
    const { container } = await mount(h("form", null, h(FormSection, { disabled: true, title: "Bloqueada" }, h("input", { name: "a" }))));
    expect(container.querySelector("fieldset")!.disabled).toBe(true);
    expect(container.querySelector("input")!.matches(":disabled")).toBe(true);
  });

  it("el icono es decorativo", async () => {
    const { container } = await mount(h(FormSection, { icon: h("svg", { "data-testid": "icono" }), title: "Con icono" }, h("input", { name: "a" })));
    expect(container.querySelector("legend span")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("DefinitionList", () => {
  it("renderiza dl con dt/dd por elemento", async () => {
    const { container } = await mount(
      h(DefinitionList, {
        items: [
          { description: "Acme S.A.", term: "Razón social" },
          { description: "2-123-456", mono: true, term: "RUC" },
        ],
      }),
    );
    expect(container.querySelector("dl")).not.toBeNull();
    expect([...container.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["Razón social", "RUC"]);
    expect([...container.querySelectorAll("dd")].map((dd) => dd.textContent)).toEqual(["Acme S.A.", "2-123-456"]);
    expect(container.querySelectorAll("dd")[1].className).toContain("font-mono");
  });

  it("los valores vacíos se muestran como raya con 'Sin dato' para lectores de pantalla, pero el 0 es un valor", async () => {
    const { container } = await mount(
      h(DefinitionList, {
        items: [
          { description: null, term: "Teléfono" },
          { description: undefined, term: "Correo" },
          { description: "", term: "Dirección" },
          { description: false, term: "Notas" },
          { description: 0, term: "Viajes" },
        ],
      }),
    );
    const values = [...container.querySelectorAll("dd")];
    for (const dd of values.slice(0, 4)) {
      expect(dd.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
      expect(dd.querySelector(".sr-only")?.textContent).toBe("Sin dato");
    }
    expect(values[4].textContent).toBe("0");
    expect(values[4].querySelector(".sr-only")).toBeNull();
  });

  it("layout grid apila término y valor en dos columnas; rows usa término y valor en columnas", async () => {
    const grid = await mount(h(DefinitionList, { items: [{ description: "x", term: "t" }], layout: "grid" }));
    expect(grid.container.querySelector("dl")!.className).toContain("sm:grid-cols-2");
    const rows = await mount(h(DefinitionList, { items: [{ description: "x", term: "t" }] }));
    expect(rows.container.querySelector("dl > div")!.className).toContain("sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]");
  });
});

describe("UsageBar", () => {
  it("conserva la apariencia (etiqueta, used/max y barra) y añade el texto de estado solo cuando corresponde", async () => {
    const ok = await mount(h(UsageBar, { label: "Clientes", max: 6, used: 2 }));
    expect(ok.container.textContent).toContain("Clientes");
    expect(ok.container.textContent).toContain("2/6");
    expect(ok.container.textContent).not.toMatch(/límite/i);
    expect(ok.container.querySelector<HTMLElement>("[aria-hidden=true] > div")!.style.width).toBe("33%");
  });

  it("anuncia a lectores de pantalla 'N de M' y oculta la barra decorativa", async () => {
    const { container } = await mount(h(UsageBar, { label: "Vehículos", max: 5, used: 4 }));
    expect(container.querySelector(".sr-only")!.textContent).toBe("4 de 5");
    expect(container.querySelector('[aria-hidden="true"].h-2')).not.toBeNull();
  });

  it("al 90 % avisa 'Cerca del límite' y al 100 % 'Límite alcanzado' con la barra del color de ese nivel", async () => {
    const warning = await mount(h(UsageBar, { label: "Vehículos", max: 10, used: 9 }));
    expect(warning.container.textContent).toContain("Cerca del límite");
    expect(warning.container.querySelector(".bg-warning")).not.toBeNull();
    expect(warning.container.querySelector(".text-warning-strong")).not.toBeNull();

    const danger = await mount(h(UsageBar, { label: "Clientes", max: 3, used: 3 }));
    expect(danger.container.textContent).toContain("Límite alcanzado");
    expect(danger.container.querySelector(".bg-danger")).not.toBeNull();
    expect(danger.container.querySelector(".text-danger-strong")).not.toBeNull();
  });
});

describe("PageNotice", () => {
  const messages = {
    "cliente-creado": { message: "Cliente registrado.", tone: "success" as const },
    "cliente-desactivado": { message: "Cliente desactivado.", title: "Listo", tone: "warning" as const },
  };

  it("pinta una Alert con el tono y el texto del diccionario", async () => {
    const { container } = await mount(h(PageNotice, { code: "cliente-creado", messages }));
    const alert = container.querySelector('[role="status"]')!;
    expect(alert.textContent).toContain("Cliente registrado.");
  });

  it("un tono de advertencia se anuncia como alerta y lleva título", async () => {
    const { container } = await mount(h(PageNotice, { code: "cliente-desactivado", messages }));
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Listo");
    expect(alert.textContent).toContain("Cliente desactivado.");
  });

  it("no renderiza NADA con un código desconocido o malicioso (sin reflejar el texto)", async () => {
    for (const code of [undefined, "", "otro", "<script>alert(1)</script>", "constructor", "__proto__"]) {
      const { container } = await mount(h(PageNotice, { code, messages }));
      expect(container.innerHTML).toBe("");
    }
  });
});
