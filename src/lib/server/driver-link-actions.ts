"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { isUniqueViolation } from "@/lib/server/db-errors";

/**
 * Vincula (o desvincula) la ficha de un conductor con la cuenta de usuario que entra a la app del conductor.
 * Sin el vinculo, un usuario con rol Conductor no ve sus viajes. Solo se ofrecen usuarios del MISMO tenant con
 * rol DRIVER activo y que no esten vinculados a otra ficha (`Driver.userId` no es unico: se comprueba aqui).
 */
export async function linkDriverUserAction(tenantSlug: string, driverId: string, formData: FormData): Promise<void> {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER"]);
  const back = `/t/${tenantSlug}/admin/drivers/${driverId}/edit`;
  const raw = String(formData.get("userId") ?? "");
  const db = getDb();

  const driver = await db.driver.findFirst({ where: { id: driverId, tenantId: tenant.id }, select: { id: true } });
  if (!driver) redirect(`/t/${tenantSlug}/admin/drivers`);

  if (raw === "") {
    await db.driver.updateMany({ where: { id: driverId, tenantId: tenant.id }, data: { userId: null } });
    await audit({ tenantId: tenant.id, actorId: user.id, actorRole: membership.role, action: "driver.unlink_user", entity: "Driver", entityId: driverId });
    revalidatePath(`/t/${tenantSlug}`, "layout");
    redirect(`${back}?aviso=desvinculado`);
  }

  const driverMembership = await db.tenantMembership.findFirst({
    where: { tenantId: tenant.id, userId: raw, role: "DRIVER", active: true },
    select: { userId: true },
  });
  const alreadyLinked = driverMembership
    ? await db.driver.findFirst({ where: { tenantId: tenant.id, userId: driverMembership.userId, id: { not: driverId } }, select: { id: true } })
    : null;
  if (!driverMembership || alreadyLinked) redirect(`${back}?aviso=usuario-no-valido`);

  try {
    await db.driver.updateMany({ where: { id: driverId, tenantId: tenant.id }, data: { userId: driverMembership.userId } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  await audit({
    tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
    action: "driver.link_user", entity: "Driver", entityId: driverId, after: { userId: driverMembership.userId },
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  redirect(`${back}?aviso=vinculado`);
}
