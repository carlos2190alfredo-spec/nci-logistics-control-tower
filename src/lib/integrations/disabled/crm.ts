import type { ConnectionTestResult, IntegrationProvider } from "../types";

export class DisabledCrmProvider implements IntegrationProvider {
  readonly type = "CRM" as const;
  readonly name = "disabled-crm";

  isEnabled(): boolean {
    return false;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, message: "CRM provider is disabled" };
  }
}
