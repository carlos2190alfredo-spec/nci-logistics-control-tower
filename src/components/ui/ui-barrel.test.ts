import { describe, expect, it } from "vitest";
import * as ui from "@/components/ui";

/**
 * Contrato del barril `@/components/ui`: las pantallas de la Fase 1 importan el
 * kit desde aquí. Si alguien quita o renombra un export, las páginas que lo
 * usan fallan al compilar en otro lugar y con un mensaje confuso; esta prueba
 * lo señala en el sitio correcto.
 */
const PHASE1_COMPONENTS = [
  "ServerForm",
  "useFormContext",
  "CheckboxField",
  "FormSection",
  "UsageBar",
  "SegmentedLinks",
  "ConfirmSubmit",
  "PageNotice",
  "DefinitionList",
] as const;

/** Lo que ya existía y que la Fase 1 sigue necesitando sin cambios. */
const EXISTING_COMPONENTS = [
  "ActionForm",
  "Alert",
  "Badge",
  "Card",
  "CardHeader",
  "Collapsible",
  "DataTable",
  "EmptyState",
  "Field",
  "MetricCard",
  "PageHeader",
  "Pagination",
  "SearchToolbar",
  "SelectField",
  "StatusBadge",
  "SubmitButton",
  "TableBody",
  "TableCell",
  "TableHead",
  "TableHeaderCell",
  "TableRow",
  "TextArea",
  "buttonStyles",
] as const;

describe("barril @/components/ui", () => {
  it("exporta cada componente nuevo del kit de la Fase 1", () => {
    const missing = PHASE1_COMPONENTS.filter((name) => (ui as Record<string, unknown>)[name] === undefined);
    expect(missing).toEqual([]);
  });

  it("conserva los exports que ya existían (ningún uso actual se rompe)", () => {
    const missing = EXISTING_COMPONENTS.filter((name) => (ui as Record<string, unknown>)[name] === undefined);
    expect(missing).toEqual([]);
  });

  it("los componentes y hooks exportados son funciones (o componentes de React), no valores sueltos", () => {
    for (const name of PHASE1_COMPONENTS) {
      expect(["function", "object"], name).toContain(typeof (ui as Record<string, unknown>)[name]);
    }
  });
});
