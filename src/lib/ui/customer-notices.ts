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
  "acceso-desactivado": { tone: "success", message: "Acceso desactivado. La persona ya no puede entrar al portal." },
  "acceso-reactivado": { tone: "success", message: "Acceso reactivado." },
  "acceso-reenviado": { tone: "success", message: "Enlace reenviado. Es de un solo uso y vale 48 horas." },
  "acceso-no-valido": { tone: "danger", message: "El acceso no existe en su empresa." },
  "acceso-cliente-inactivo": { tone: "warning", message: "Reactive primero el cliente para poder reactivar el acceso de sus usuarios." },
  "acceso-otro-cliente": { tone: "warning", message: "Esa persona ya tiene acceso activo al portal de otro cliente de su empresa." },
  "reenvio-no-aplica": { tone: "info", message: "Esa persona ya activó su cuenta: si olvidó su contraseña, puede recuperarla desde la pantalla de acceso." },
  "reenvio-limite": { tone: "warning", message: "Se alcanzó el máximo de correos por hora. Intente de nuevo más tarde." },
  "reenvio-fallo": { tone: "warning", message: "No se pudo enviar el correo. Intente de nuevo más tarde." },
  "limite-plan": {
    tone: "warning",
    message: "No se pudo reactivar: su plan ya alcanzó el máximo de clientes activos. Solicite ampliar el plan a NCI Automation.",
  },
};
