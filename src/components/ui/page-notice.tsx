import { Alert } from "@/components/ui/alert";

export type PageNoticeTone = "success" | "info" | "warning" | "danger";

export type PageNoticeMessage = {
  tone: PageNoticeTone;
  message: string;
  title?: string;
};

/** Diccionario cerrado `código → aviso`. Los códigos son los que la acción pone en `?aviso=`. */
export type PageNoticeMessages = Readonly<Record<string, PageNoticeMessage>>;

/**
 * Busca el aviso de un código. Solo devuelve entradas PROPIAS del diccionario:
 * `?aviso=constructor`, `?aviso=__proto__` o `?aviso=toString` no encuentran nada
 * (con un `messages[code]` ingenuo heredarían del prototipo del objeto).
 * Si el parámetro viene repetido (`string[]`) se usa el primero.
 */
export function resolveNotice(code: string | string[] | undefined, messages: PageNoticeMessages): PageNoticeMessage | null {
  const key = Array.isArray(code) ? code[0] : code;
  if (typeof key !== "string" || key.length === 0) return null;
  if (!Object.prototype.hasOwnProperty.call(messages, key)) return null;
  const entry = messages[key];
  if (typeof entry !== "object" || entry === null || typeof entry.message !== "string") return null;
  return entry;
}

/**
 * Aviso de página a partir de un código en la URL (patrón de las acciones de
 * fila: `redirect("/t/<slug>/customers?aviso=cliente-desactivado")`).
 *
 * Seguridad: NUNCA se pinta texto del query string. El código solo elige una
 * entrada del diccionario que define la página; un código desconocido (o
 * ausente) no muestra nada.
 *
 *   <PageNotice code={(await searchParams).aviso} messages={{ "cliente-creado": { tone: "success", message: "Cliente registrado." } }} />
 */
export function PageNotice({
  code,
  messages,
  className,
}: {
  code?: string | string[];
  messages: PageNoticeMessages;
  className?: string;
}) {
  const notice = resolveNotice(code, messages);
  if (!notice) return null;
  return (
    <Alert className={className} title={notice.title} tone={notice.tone}>
      {notice.message}
    </Alert>
  );
}
