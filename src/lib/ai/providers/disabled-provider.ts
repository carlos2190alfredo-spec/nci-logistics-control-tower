import type { IAiProvider, AiProviderStatus, AiCompletionRequest, AiCompletionResult } from "./provider-types";

export class DisabledAiProvider implements IAiProvider {
  getStatus(): AiProviderStatus {
    return {
      provider: "disabled",
      available: false,
      reason: "IA desactivada para este tenant",
    };
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    return {
      provider: "disabled",
      content: "La funcionalidad de IA esta desactivada. Active la IA en la configuracion del tenant para obtener analisis avanzados.",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs: 0,
      fallbackUsed: false,
      model: "disabled",
    };
  }
}
