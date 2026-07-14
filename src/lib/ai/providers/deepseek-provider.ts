import OpenAI from "openai";
import type { IAiProvider, AiProviderStatus, AiCompletionRequest, AiCompletionResult } from "./provider-types";
import type { DeepSeekConfig } from "../deepseek-config";

const API_KEY_PATTERN = /sk-[a-zA-Z0-9]{20,}/g;

function sanitizeError(message: string): string {
  return message.replace(API_KEY_PATTERN, "[REDACTED]");
}

export class DeepSeekProvider implements IAiProvider {
  private client: OpenAI;
  private config: DeepSeekConfig;

  constructor(config: DeepSeekConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl.endsWith("/v1")
        ? config.baseUrl
        : `${config.baseUrl}/v1`,
      timeout: config.timeoutMs,
    });
  }

  getStatus(): AiProviderStatus {
    return {
      provider: "deepseek",
      available: true,
      model: this.config.model,
    };
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = performance.now();

    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.config.model,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
          max_tokens: request.maxTokens ?? this.config.maxOutputTokens,
          temperature: 0.3,
          response_format: { type: "json_object" },
        },
        { signal: request.signal },
      );

      const durationMs = Math.round(performance.now() - start);
      const choice = response.choices[0];

      if (!choice?.message?.content) {
        throw new Error("DeepSeek returned empty response");
      }

      const content = choice.message.content;

      return {
        provider: "deepseek",
        content,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
        durationMs,
        fallbackUsed: false,
        model: this.config.model,
      };
    } catch (error: unknown) {
      const durationMs = Math.round(performance.now() - start);
      const err = error as { status?: number; message?: string; code?: string };

      let errorCode = "UNKNOWN";
      let safeMessage = "Error al comunicarse con DeepSeek";

      if (err.status === 401) {
        errorCode = "AUTH_ERROR";
        safeMessage = "API key de DeepSeek invalida o expirada";
      } else if (err.status === 429) {
        errorCode = "RATE_LIMITED";
        safeMessage = "DeepSeek: limite de solicitudes alcanzado, reintente en unos minutos";
      } else if (err.status && err.status >= 500) {
        errorCode = "SERVER_ERROR";
        safeMessage = "DeepSeek: error del servidor, reintente mas tarde";
      } else if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        errorCode = "TIMEOUT";
        safeMessage = `DeepSeek: timeout despues de ${this.config.timeoutMs}ms`;
      } else if (err.code === "ECONNREFUSED" || err.message?.includes("fetch")) {
        errorCode = "NETWORK_ERROR";
        safeMessage = "No se pudo conectar con DeepSeek";
      }

      throw new DeepSeekError(
        errorCode,
        sanitizeError(safeMessage),
        durationMs,
      );
    }
  }
}

export class DeepSeekError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly safeMessage: string,
    public readonly durationMs: number,
  ) {
    super(safeMessage);
    this.name = "DeepSeekError";
  }
}
