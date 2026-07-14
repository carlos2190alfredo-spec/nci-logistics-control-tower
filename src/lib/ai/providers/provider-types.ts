export interface AiProviderStatus {
  provider: "disabled" | "rules" | "deepseek";
  available: boolean;
  reason?: string;
  model?: string;
}

export interface AiCompletionRequest {
  tenantId: string;
  userId: string;
  requestId: string;
  purpose: AiPurpose;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type AiPurpose =
  | "operations_summary"
  | "trip_risk"
  | "driver_recommendation_explanation"
  | "feedback_summary"
  | "incident_summary"
  | "alert_explanation"
  | "daily_digest";

export interface AiCompletionResult {
  provider: "disabled" | "rules" | "deepseek";
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  fallbackUsed: boolean;
  model: string;
}

export interface IAiProvider {
  getStatus(): AiProviderStatus;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
