import type { IAiProvider, AiProviderStatus, AiCompletionRequest, AiCompletionResult } from "./provider-types";

export class RulesBasedAiProvider implements IAiProvider {
  getStatus(): AiProviderStatus {
    return {
      provider: "rules",
      available: true,
      reason: "Motor de reglas determinista (sin LLM externo)",
      model: "rules-engine-v1",
    };
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = performance.now();
    const content = this.generateRulesResponse(request.purpose, request.userPrompt);
    const durationMs = Math.round(performance.now() - start);

    return {
      provider: "rules",
      content,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs,
      fallbackUsed: false,
      model: "rules-engine-v1",
    };
  }

  private generateRulesResponse(purpose: string, context: string): string {
    switch (purpose) {
      case "operations_summary":
        return "Resumen generado por motor de reglas. Para obtener analisis avanzados con razonamiento, configure DeepSeek en las variables de entorno (DEEPSEEK_API_KEY).";
      case "trip_risk":
        return "Analisis de riesgo basado en reglas deterministas. Los factores evaluados incluyen: conflictos de horario, carga del conductor, incidencias recientes y compatibilidad de vehiculo.";
      case "driver_recommendation_explanation":
        return "La recomendacion se basa en el motor de reglas: horario laboral (+30), ausencia de conflictos (+20), vehiculo compatible (+15), baja incidencia (+10), carga del dia (+10), sincronizacion PWA (+5). Los conductores descalificados tienen conflictos activos, estan inactivos o tienen excepciones de disponibilidad.";
      case "feedback_summary":
        return "Resumen de feedback generado por reglas. Para analisis de sentimiento y categorizacion avanzada, configure DeepSeek.";
      case "incident_summary":
        return "Resumen de incidencias generado por reglas. Se identifican patrones por frecuencia, conductor y tipo de incidencia.";
      case "alert_explanation":
        return "Las alertas operativas se explican segun su tipo, frecuencia y prioridad definida por el sistema de monitoreo.";
      case "daily_digest":
        return "Resumen diario generado por motor de reglas. Incluye viajes activos, pendientes, conductores disponibles e incidencias del dia.";
      default:
        return "Funcionalidad de IA disponible con motor de reglas. Configure DeepSeek para razonamiento avanzado.";
    }
  }
}
