import type { AcceptFailure } from "@/lib/server/invitation-accept";

/** Textos (usted, con ortografía completa) de cada motivo por el que una invitación no se puede aceptar. */
export const INVITATION_FAILURE_MESSAGE: Record<Exclude<AcceptFailure, "INVALID_INPUT">, string> = {
  INVALID: "Este enlace no es válido. Pida a un administrador de la empresa que le envíe una invitación nueva.",
  EXPIRED: "La invitación venció. Pida a un administrador de la empresa que se la envíe de nuevo.",
  USED: "Esta invitación ya fue utilizada. Si es su cuenta, inicie sesión desde la pantalla de acceso.",
  NEEDS_LOGIN: "Ya existe una cuenta con este correo. Inicie sesión con ella y abra este enlace de nuevo para aceptar.",
  WRONG_ACCOUNT: "Tiene abierta la sesión de otra cuenta. Inicie sesión con la cuenta invitada y abra este enlace de nuevo.",
  UNAVAILABLE: "No se puede aceptar esta invitación. Comuníquese con quien se la envió.",
  ALREADY_MEMBER: "Esta cuenta ya pertenece a la empresa. Si no puede entrar, pida a un administrador que revise su acceso.",
};

export function invitationFailureMessage(reason: AcceptFailure, fallback?: string): string {
  if (reason === "INVALID_INPUT") return fallback ?? "Revise los datos e intente de nuevo.";
  return INVITATION_FAILURE_MESSAGE[reason];
}
