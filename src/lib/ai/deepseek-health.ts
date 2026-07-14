import { isDeepSeekConfigured, getDeepSeekConfig } from "./deepseek-config";
import { createAiProvider } from "./providers/provider-factory";

export interface DeepSeekHealthStatus {
  configured: boolean;
  model: string | null;
  baseUrl: string | null;
  provider: string;
  available: boolean;
  reasoningEffort: string | null;
  thinkingEnabled: boolean | null;
  timeoutMs: number | null;
  maxOutputTokens: number | null;
}

export function getDeepSeekHealthStatus(tenantAiEnabled = true): DeepSeekHealthStatus {
  const config = getDeepSeekConfig();
  const provider = createAiProvider(tenantAiEnabled);
  const status = provider.getStatus();

  return {
    configured: isDeepSeekConfigured(),
    model: config?.model ?? null,
    baseUrl: config ? config.baseUrl : null,
    provider: status.provider,
    available: status.available,
    reasoningEffort: config?.reasoningEffort ?? null,
    thinkingEnabled: config?.thinkingEnabled ?? null,
    timeoutMs: config?.timeoutMs ?? null,
    maxOutputTokens: config?.maxOutputTokens ?? null,
  };
}
