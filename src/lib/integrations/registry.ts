import type { IntegrationConnectorType } from "@/generated/prisma";
import type { ConnectorMetadata, IntegrationProvider } from "./types";
import { DisabledGpsProvider } from "./disabled/gps";
import { DisabledWhatsAppProvider } from "./disabled/whatsapp";
import { DisabledCrmProvider } from "./disabled/crm";
import { DisabledBillingProvider } from "./disabled/billing";
import { DisabledAiProvider } from "./disabled/ai";

const providers = new Map<IntegrationConnectorType, IntegrationProvider>([
  ["GPS", new DisabledGpsProvider()],
  ["WHATSAPP", new DisabledWhatsAppProvider()],
  ["CRM", new DisabledCrmProvider()],
  ["BILLING", new DisabledBillingProvider()],
  ["AI", new DisabledAiProvider()],
]);

export function getProvider(type: IntegrationConnectorType): IntegrationProvider {
  const provider = providers.get(type);
  if (!provider) throw new Error(`Unknown integration type: ${type}`);
  return provider;
}

export function listProviders(): IntegrationProvider[] {
  return Array.from(providers.values());
}

export const CONNECTOR_CATALOG: ConnectorMetadata[] = [
  {
    type: "GPS",
    name: "GPS Telematico",
    description: "Seguimiento GPS de vehiculos en tiempo real",
    version: "1.0.0",
    configSchema: [
      { key: "pollIntervalSeconds", label: "Intervalo de consulta (s)", type: "number", required: false, defaultValue: 30 },
    ],
    credentialKeys: ["apiKey", "apiSecret"],
  },
  {
    type: "WHATSAPP",
    name: "WhatsApp Cloud",
    description: "Notificaciones via WhatsApp Business Cloud API",
    version: "1.0.0",
    configSchema: [
      { key: "phoneNumberId", label: "ID del numero de telefono", type: "string", required: true },
    ],
    credentialKeys: ["accessToken"],
  },
  {
    type: "CRM",
    name: "CRM Externo",
    description: "Sincronizacion con CRM externo",
    version: "1.0.0",
    configSchema: [
      { key: "baseUrl", label: "URL base del CRM", type: "string", required: true },
    ],
    credentialKeys: ["apiKey"],
  },
  {
    type: "BILLING",
    name: "Facturacion Electronica",
    description: "Emision de facturas electronicas",
    version: "1.0.0",
    configSchema: [
      { key: "fiscalId", label: "RUC / NIT", type: "string", required: true },
    ],
    credentialKeys: ["apiKey", "certificatePassword"],
  },
  {
    type: "EMAIL",
    name: "Email SMTP",
    description: "Envio de correos via SMTP externo",
    version: "1.0.0",
    configSchema: [
      { key: "host", label: "Servidor SMTP", type: "string", required: true },
      { key: "port", label: "Puerto", type: "number", required: true, defaultValue: 587 },
      { key: "fromAddress", label: "Correo remitente", type: "string", required: true },
    ],
    credentialKeys: ["username", "password"],
  },
  {
    type: "AI",
    name: "Motor IA",
    description: "Recomendaciones basadas en reglas deterministas",
    version: "1.0.0",
    configSchema: [],
    credentialKeys: [],
  },
  {
    type: "WEBHOOKS",
    name: "Webhooks",
    description: "Notificaciones a endpoints externos via webhook",
    version: "1.0.0",
    configSchema: [],
    credentialKeys: [],
  },
];
