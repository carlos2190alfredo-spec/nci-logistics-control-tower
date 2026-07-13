import type { ConnectionTestResult, IntegrationProvider } from "../types";

export class DisabledWhatsAppProvider implements IntegrationProvider {
  readonly type = "WHATSAPP" as const;
  readonly name = "disabled-whatsapp";

  isEnabled(): boolean {
    return false;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, message: "WhatsApp provider is disabled" };
  }
}
