import type { PageNoticeMessages } from "@/components/ui/page-notice";

/** Avisos de lugares y tipos de servicio (`?aviso=`; solo codigos conocidos). */
export const catalogNotices: PageNoticeMessages = {
  "lugar-actualizado": { tone: "success", message: "Cambios guardados." },
  "lugar-inactivado": { tone: "success", message: "Lugar inactivado: ya no se sugiere al crear viajes." },
  "lugar-reactivado": { tone: "success", message: "Lugar reactivado." },
  "servicio-actualizado": { tone: "success", message: "Cambios guardados." },
  "servicio-inactivado": { tone: "success", message: "Servicio inactivado: ya no se puede elegir en viajes nuevos. Los viajes existentes no cambian." },
  "servicio-reactivado": { tone: "success", message: "Servicio reactivado." },
  "servicio-ultimo-activo": {
    tone: "warning",
    message: "Es su último tipo de servicio activo: sin ninguno no podrá crear viajes. Agregue otro antes de inactivarlo.",
  },
  "registro-no-existe": { tone: "danger", message: "El registro no existe en su empresa." },
  "tipos-agregados": { tone: "success", message: "Tipos de servicio sugeridos agregados." },
  "tipos-ya-existen": { tone: "info", message: "Ya tiene todos los tipos de servicio sugeridos." },
};
