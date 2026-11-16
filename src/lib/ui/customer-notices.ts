import type { PageNoticeMessages } from "@/components/ui/page-notice";

/** Avisos de las acciones de fila de clientes (se leen del query string `?aviso=`; solo códigos conocidos). */
export const customerNotices: PageNoticeMessages = {
  "cliente-actualizado": { tone: "success", message: "Cambios guardados." },
  "cliente-desactivado": {
    tone: "success",
    message: "Cliente desactivado. Ya no puede recibir viajes y se desactivó el acceso de sus usuarios al portal.",
  },
  "cliente-reactivado": {
    tone: "success",
    message: "Cliente reactivado. Los accesos al portal se reactivan uno por uno desde esta ficha.",
  },
  "cliente-no-existe": { tone: "danger", message: "El cliente no existe en su empresa." },
  "limite-plan": {
    tone: "warning",
    message: "No se pudo reactivar: su plan ya alcanzó el máximo de clientes activos. Solicite ampliar el plan a NCI Automation.",
  },
};
