import type { FinancialCategory, FinancialEntryKind } from "@/generated/prisma";

export const financialKindLabel: Record<FinancialEntryKind, string> = {
  INGRESO: "Ingreso",
  COSTO: "Costo",
};

export const financialCategoryLabel: Record<FinancialCategory, string> = {
  TARIFA_BASE: "Tarifa base",
  RECARGO: "Recargo",
  ESPERA_FACTURABLE: "Espera facturable",
  DEMURRAGE_FACTURABLE: "Demurrage facturable",
  DETENTION_FACTURABLE: "Detention facturable",
  REEMBOLSABLE: "Reembolsable",
  SERVICIO_ADICIONAL: "Servicio adicional",
  AJUSTE: "Ajuste",
  IMPUESTO: "Impuesto",
  COMBUSTIBLE: "Combustible",
  PEAJE: "Peaje",
  VIATICOS: "Viáticos",
  CONDUCTOR: "Conductor",
  SUBCONTRATISTA: "Subcontratista",
  MANTENIMIENTO: "Mantenimiento",
  GASTOS_PORTUARIOS: "Gastos portuarios",
  ALMACENAJE: "Almacenaje",
  RETENCION: "Retención",
  ESPERA_COSTO: "Espera (costo)",
  DEMURRAGE_COSTO: "Demurrage (costo)",
  DETENTION_COSTO: "Detention (costo)",
  REENTREGA: "Reentrega",
  CARGOS_TERMINAL: "Cargos de terminal",
  REPARACION: "Reparación",
  SEGURO: "Seguro",
  ADMINISTRATIVO: "Administrativo",
  OTRO: "Otro",
};

/** Categorías agrupadas por tipo para los selects de los formularios. */
export const REVENUE_CATEGORIES: FinancialCategory[] = [
  "TARIFA_BASE", "RECARGO", "ESPERA_FACTURABLE", "DEMURRAGE_FACTURABLE",
  "DETENTION_FACTURABLE", "REEMBOLSABLE", "SERVICIO_ADICIONAL", "AJUSTE", "IMPUESTO",
];

export const COST_CATEGORIES: FinancialCategory[] = [
  "COMBUSTIBLE", "PEAJE", "VIATICOS", "CONDUCTOR", "SUBCONTRATISTA", "MANTENIMIENTO",
  "GASTOS_PORTUARIOS", "ALMACENAJE", "RETENCION", "ESPERA_COSTO", "DEMURRAGE_COSTO",
  "DETENTION_COSTO", "REENTREGA", "CARGOS_TERMINAL", "REPARACION", "SEGURO",
  "ADMINISTRATIVO", "OTRO",
];
