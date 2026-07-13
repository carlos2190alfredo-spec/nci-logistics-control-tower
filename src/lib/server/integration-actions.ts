"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { IntegrationConnectorType } from "@/generated/prisma";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { encryptCredential } from "@/lib/integrations/credential-crypto";
import { CONNECTOR_CATALOG } from "@/lib/integrations/registry";

export async function saveIntegrationConfigAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN",
  ]);

  const connectorType = formData.get("connectorType") as string;
  const catalogEntry = CONNECTOR_CATALOG.find((c) => c.type === connectorType);
  if (!catalogEntry) throw new Error("Conector no encontrado");

  const db = getDb();

  let connector = await db.integrationConnector.findFirst({
    where: { type: connectorType as IntegrationConnectorType },
  });
  if (!connector) {
    connector = await db.integrationConnector.create({
      data: {
        type: connectorType as IntegrationConnectorType,
        name: catalogEntry.name,
        description: catalogEntry.description,
        version: catalogEntry.version,
      },
    });
  }

  let integration = await db.tenantIntegration.findFirst({
    where: { tenantId: tenant.id, connectorId: connector.id },
  });
  if (!integration) {
    integration = await db.tenantIntegration.create({
      data: {
        tenantId: tenant.id,
        connectorId: connector.id,
        status: "CONFIGURING",
      },
    });
  }

  const configValues: Record<string, string> = {};
  for (const field of catalogEntry.configSchema) {
    const val = formData.get(`config_${field.key}`)?.toString()?.trim() ?? "";
    if (val) configValues[field.key] = val;
  }

  await db.tenantIntegration.update({
    where: { id: integration.id },
    data: { config: configValues, status: "CONFIGURING" },
  });

  for (const credKey of catalogEntry.credentialKeys) {
    const credValue = formData.get(`cred_${credKey}`)?.toString()?.trim() ?? "";
    if (!credValue) continue;

    const encrypted = encryptCredential(credValue);
    await db.integrationCredential.upsert({
      where: {
        tenantIntegrationId_key: {
          tenantIntegrationId: integration.id,
          key: credKey,
        },
      },
      update: {
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      create: {
        tenantIntegrationId: integration.id,
        key: credKey,
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
    });
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "integration.configure",
    entity: "TenantIntegration",
    entityId: integration.id,
    after: { connectorType, configKeys: Object.keys(configValues) },
  });

  revalidatePath(`/t/${tenantSlug}/admin/integrations`);
  redirect(`/t/${tenantSlug}/admin/integrations`);
}

export async function toggleIntegrationAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const integrationId = String(formData.get("integrationId") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN",
  ]);

  const db = getDb();
  const integration = await db.tenantIntegration.findFirstOrThrow({
    where: { id: integrationId, tenantId: tenant.id },
    include: { connector: true },
  });

  const newEnabled = !integration.enabled;
  const newStatus = newEnabled ? "ENABLED" : "DISABLED";

  await db.tenantIntegration.update({
    where: { id: integrationId },
    data: { enabled: newEnabled, status: newStatus },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: newEnabled ? "integration.enable" : "integration.disable",
    entity: "TenantIntegration",
    entityId: integrationId,
    before: { enabled: integration.enabled },
    after: { enabled: newEnabled },
  });

  revalidatePath(`/t/${tenantSlug}/admin/integrations`);
}

export async function testIntegrationAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const integrationId = String(formData.get("integrationId") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN",
  ]);

  const db = getDb();
  const integration = await db.tenantIntegration.findFirstOrThrow({
    where: { id: integrationId, tenantId: tenant.id },
    include: { connector: true },
  });

  await db.integrationEvent.create({
    data: {
      tenantIntegrationId: integration.id,
      eventType: "connection_test",
      direction: "OUTBOUND",
      payload: { type: "test", connectorType: integration.connector.type },
      status: "SIMULATED",
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "integration.test",
    entity: "TenantIntegration",
    entityId: integrationId,
    after: { result: "simulated_ok", connectorType: integration.connector.type },
  });

  revalidatePath(`/t/${tenantSlug}/admin/integrations`);
}
