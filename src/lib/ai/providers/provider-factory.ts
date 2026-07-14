import type { IAiProvider } from "./provider-types";
import { DisabledAiProvider } from "./disabled-provider";
import { RulesBasedAiProvider } from "./rules-provider";
import { DeepSeekProvider } from "./deepseek-provider";
import { getDeepSeekConfig } from "../deepseek-config";

export type AiProviderMode = "auto" | "disabled" | "rules" | "deepseek";

function getAiProviderMode(): AiProviderMode {
  const mode = process.env.AI_PROVIDER ?? "auto";
  if (mode === "disabled" || mode === "rules" || mode === "deepseek") return mode;
  return "auto";
}

export function createAiProvider(tenantAiEnabled = true): IAiProvider {
  if (process.env.NODE_ENV === "test") {
    return new RulesBasedAiProvider();
  }

  const mode = getAiProviderMode();

  if (mode === "disabled" || !tenantAiEnabled) {
    return new DisabledAiProvider();
  }

  if (mode === "rules") {
    return new RulesBasedAiProvider();
  }

  if (mode === "deepseek") {
    const config = getDeepSeekConfig();
    if (!config) return new RulesBasedAiProvider();
    return new DeepSeekProvider(config);
  }

  const config = getDeepSeekConfig();
  if (config) {
    return new DeepSeekProvider(config);
  }

  return new RulesBasedAiProvider();
}

export function getProviderStatus(tenantAiEnabled = true) {
  const provider = createAiProvider(tenantAiEnabled);
  return provider.getStatus();
}
