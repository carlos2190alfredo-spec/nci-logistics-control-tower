import type { ConnectionTestResult, IntegrationProvider } from "../types";

export class DisabledGpsProvider implements IntegrationProvider {
  readonly type = "GPS" as const;
  readonly name = "disabled-gps";

  isEnabled(): boolean {
    return false;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, message: "GPS provider is disabled" };
  }
}
