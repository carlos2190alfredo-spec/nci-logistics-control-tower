import type { ConnectionTestResult, IntegrationProvider } from "../types";

export class DisabledAiProvider implements IntegrationProvider {
  readonly type = "AI" as const;
  readonly name = "disabled-ai";

  isEnabled(): boolean {
    return false;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, message: "AI provider is disabled" };
  }
}
