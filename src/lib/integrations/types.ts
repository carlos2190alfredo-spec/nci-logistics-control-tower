import type { IntegrationConnectorType, IntegrationStatus } from "@/generated/prisma";

export interface IntegrationProvider {
  readonly type: IntegrationConnectorType;
  readonly name: string;
  isEnabled(): boolean;
  testConnection(config: Record<string, unknown>): Promise<ConnectionTestResult>;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export interface ConnectorMetadata {
  type: IntegrationConnectorType;
  name: string;
  description: string;
  version: string;
  configSchema: ConnectorConfigField[];
  credentialKeys: string[];
}

export interface ConnectorConfigField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  required: boolean;
  options?: string[];
  defaultValue?: string | number | boolean;
}

export interface TenantIntegrationSummary {
  connectorType: IntegrationConnectorType;
  connectorName: string;
  enabled: boolean;
  status: IntegrationStatus;
  lastSyncAt: Date | null;
}
