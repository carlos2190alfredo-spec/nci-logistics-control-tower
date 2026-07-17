/**
 * Salud de conectores — evaluación DETERMINISTA del estado de una integración
 * por tenant. Puro: sin base de datos ni IA. No simula conexiones; refleja el
 * estado declarado + credenciales + eventos recientes.
 */

export type ConnectorHealth =
  | "DESACTIVADO"
  | "REQUIERE_CREDENCIALES"
  | "ACTIVO"
  | "DEGRADADO"
  | "ERROR";

export type ConnectorHealthInput = {
  enabled: boolean;
  /** Estado declarado en la BD: DISABLED/ENABLED/ERROR/CONFIGURING. */
  status: string;
  requiredCredentials: number;
  presentCredentials: number;
  lastSyncAt: Date | null;
  recentProcessed: number;
  recentFailed: number;
  now: Date;
};

export type ConnectorHealthResult = {
  health: ConnectorHealth;
  credentialsComplete: boolean;
  /** Días desde la última sincronización (null si nunca). */
  daysSinceSync: number | null;
  recommendedAction: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function evaluateConnectorHealth(input: ConnectorHealthInput): ConnectorHealthResult {
  const credentialsComplete =
    input.requiredCredentials === 0 || input.presentCredentials >= input.requiredCredentials;

  const daysSinceSync =
    input.lastSyncAt == null
      ? null
      : Math.max(0, Math.floor((input.now.getTime() - input.lastSyncAt.getTime()) / MS_PER_DAY));

  let health: ConnectorHealth;
  let recommendedAction: string;

  if (!input.enabled || input.status === "DISABLED") {
    health = "DESACTIVADO";
    recommendedAction = credentialsComplete
      ? "Active la integración cuando desee usarla."
      : `Configure credenciales (${input.presentCredentials}/${input.requiredCredentials}) y actívela.`;
  } else if (!credentialsComplete) {
    health = "REQUIERE_CREDENCIALES";
    recommendedAction = `Faltan credenciales: ${input.presentCredentials} de ${input.requiredCredentials}.`;
  } else if (input.status === "ERROR" || (input.recentFailed > 0 && input.recentFailed >= input.recentProcessed)) {
    health = "ERROR";
    recommendedAction = "Revise el último error y las credenciales del conector.";
  } else if (input.recentFailed > 0) {
    health = "DEGRADADO";
    recommendedAction = "Hay eventos fallidos recientes; revise el detalle.";
  } else {
    health = "ACTIVO";
    recommendedAction =
      daysSinceSync != null && daysSinceSync > 3
        ? "Sin sincronizar hace días; verifique el origen de datos."
        : "Operando con normalidad.";
  }

  return { health, credentialsComplete, daysSinceSync, recommendedAction };
}
