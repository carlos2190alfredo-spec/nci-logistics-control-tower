import { getDb } from "@/lib/server/db";

type AuditInput = {
  tenantId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  supportSessionId?: string | null;
};

export async function audit(input: AuditInput) {
  const db = getDb();

  await db.auditLog.create({
    data: {
      tenantId: input.tenantId ?? null,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: input.before === undefined ? undefined : JSON.parse(JSON.stringify(input.before)),
      after: input.after === undefined ? undefined : JSON.parse(JSON.stringify(input.after)),
      supportSessionId: input.supportSessionId ?? null,
    },
  });
}
