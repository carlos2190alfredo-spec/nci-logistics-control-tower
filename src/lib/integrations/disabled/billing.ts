import type { ConnectionTestResult, IntegrationProvider } from "../types";

export class DisabledBillingProvider implements IntegrationProvider {
  readonly type = "BILLING" as const;
  readonly name = "disabled-billing";

  isEnabled(): boolean {
    return false;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, message: "Billing provider is disabled" };
  }
}
