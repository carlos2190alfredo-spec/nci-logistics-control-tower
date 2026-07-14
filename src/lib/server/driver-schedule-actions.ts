"use server";

import { revalidatePath } from "next/cache";
import type { DayOfWeek, AvailabilityExceptionType } from "@/generated/prisma";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

const VALID_DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const VALID_EXCEPTION_TYPES: AvailabilityExceptionType[] = ["DAY_OFF", "VACATION", "SICK_LEAVE", "EXTRA_SHIFT", "CUSTOM_UNAVAILABLE"];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveDriverScheduleAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const driverId = String(formData.get("driverId") ?? "");
  const schedulesJson = String(formData.get("schedules") ?? "[]");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);

  const db = getDb();

  const driver = await db.driver.findFirstOrThrow({
    where: { id: driverId, tenantId: tenant.id },
  });

  let schedules: Array<{
    dayOfWeek: DayOfWeek;
    startTimeLocal: string;
    endTimeLocal: string;
    breakStartLocal?: string;
    breakEndLocal?: string;
    isActive: boolean;
  }>;

  try {
    schedules = JSON.parse(schedulesJson);
  } catch {
    return;
  }

  if (!Array.isArray(schedules)) {
    return;
  }

  for (const s of schedules) {
    if (!VALID_DAYS.includes(s.dayOfWeek)) return;
    if (!TIME_REGEX.test(s.startTimeLocal)) return;
    if (!TIME_REGEX.test(s.endTimeLocal)) return;
    if (s.breakStartLocal && !TIME_REGEX.test(s.breakStartLocal)) return;
    if (s.breakEndLocal && !TIME_REGEX.test(s.breakEndLocal)) return;
  }

  await db.driverWorkSchedule.deleteMany({
    where: { tenantId: tenant.id, driverId: driver.id },
  });

  if (schedules.length > 0) {
    await db.driverWorkSchedule.createMany({
      data: schedules.map((s) => ({
        tenantId: tenant.id,
        driverId: driver.id,
        dayOfWeek: s.dayOfWeek,
        startTimeLocal: s.startTimeLocal,
        endTimeLocal: s.endTimeLocal,
        breakStartLocal: s.breakStartLocal ?? null,
        breakEndLocal: s.breakEndLocal ?? null,
        isActive: s.isActive,
      })),
    });
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "driver.schedule.saved",
    entity: "Driver",
    entityId: driver.id,
    after: { scheduleCount: schedules.length },
  });

  revalidatePath(`/t/${tenantSlug}/admin/drivers/${driverId}/schedule`);
  return;
}

export async function addAvailabilityExceptionAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const driverId = String(formData.get("driverId") ?? "");
  const dateStr = String(formData.get("date") ?? "");
  const type = String(formData.get("type") ?? "") as AvailabilityExceptionType;
  const reason = formData.get("reason") ? String(formData.get("reason")) : null;
  const startTimeLocal = formData.get("startTimeLocal") ? String(formData.get("startTimeLocal")) : null;
  const endTimeLocal = formData.get("endTimeLocal") ? String(formData.get("endTimeLocal")) : null;

  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);

  if (!VALID_EXCEPTION_TYPES.includes(type)) {
    return;
  }

  if (!dateStr) {
    return;
  }

  const db = getDb();

  const driver = await db.driver.findFirstOrThrow({
    where: { id: driverId, tenantId: tenant.id },
  });

  const exception = await db.driverAvailabilityException.create({
    data: {
      tenantId: tenant.id,
      driverId: driver.id,
      date: new Date(dateStr),
      type,
      reason,
      startTimeLocal,
      endTimeLocal,
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "driver.availability_exception.created",
    entity: "DriverAvailabilityException",
    entityId: exception.id,
    after: { type, date: dateStr },
  });

  revalidatePath(`/t/${tenantSlug}/admin/drivers/${driverId}/schedule`);
  return;
}

export async function deleteAvailabilityExceptionAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const exceptionId = String(formData.get("exceptionId") ?? "");

  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);

  const db = getDb();

  const exception = await db.driverAvailabilityException.findFirstOrThrow({
    where: { id: exceptionId, tenantId: tenant.id },
  });

  await db.driverAvailabilityException.delete({ where: { id: exception.id } });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "driver.availability_exception.deleted",
    entity: "DriverAvailabilityException",
    entityId: exception.id,
  });

  revalidatePath(`/t/${tenantSlug}/admin/drivers`);
  return;
}
