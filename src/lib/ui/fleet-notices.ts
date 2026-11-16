import type { PageNoticeMessages } from "@/components/ui/page-notice";

/** Avisos de las acciones de fila de flota (`?aviso=`; solo codigos conocidos). */
export const fleetNotices: PageNoticeMessages = {
  "activo-inactivado": { tone: "success", message: "Quedó inactivo: ya no aparece al asignar viajes. Puede reactivarlo cuando quiera." },
  "activo-reactivado": { tone: "success", message: "Reactivado: vuelve a estar disponible para asignar viajes." },
  "inactivar-bloqueado": {
    tone: "warning",
    message: "No se puede inactivar: tiene viajes activos asignados. Reasígnelos o ciérrelos primero.",
  },
  "limite-plan": {
    tone: "warning",
    message: "No se pudo reactivar: su plan ya alcanzó el máximo de vehículos. Solicite ampliar el plan a NCI Automation.",
  },
  "activo-no-existe": { tone: "danger", message: "El registro no existe en su empresa." },
};
