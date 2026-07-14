export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  thinkingEnabled: boolean;
  timeoutMs: number;
  maxOutputTokens: number;
}

export function getDeepSeekConfig(): DeepSeekConfig | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
    reasoningEffort: validateEffort(process.env.DEEPSEEK_REASONING_EFFORT),
    thinkingEnabled: process.env.DEEPSEEK_THINKING_ENABLED !== "false",
    timeoutMs: parseInt(process.env.DEEPSEEK_TIMEOUT_MS ?? "25000", 10),
    maxOutputTokens: parseInt(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS ?? "1500", 10),
  };
}

function validateEffort(value?: string): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "high";
}

export function isDeepSeekConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}
