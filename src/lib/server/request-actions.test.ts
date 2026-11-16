import { beforeEach, describe, expect, it, vi } from "vitest";

// Pruebas de confirmRequestAsTripAction (conversion de solicitud en viaje) con la base de datos y los
// servicios simulados. El refactor de ADR-038 (referencias por maximo bajo bloqueo del tenant, y
// `createTripFromRequest` compartido con "Nuevo viaje") debe dejar el comportamiento observable igual.

const tx = {
  serviceRequest: { updateMany: vi.fn() },
  trip: { create: vi.fn() },
  $queryRaw: vi.fn(),
};
const db = {
  serviceRequest: { findFirst: vi.fn() },
  $transaction: vi.fn(),
};
const auth = { requireTenantRole: vi.fn(), requireCustomerMembership: vi.fn() };

// Con `connection_limit=1` cualquier consulta fuera de `tx` mientras la transaccion esta abierta se
// quedaria esperando la unica conexion. Estas banderas lo convierten en un fallo visible.
let inTransaction = false;
const events: string[] = [];

vi.mock("@/lib/server/db", () => ({ getDb: () => db }));
vi.mock("@/lib/server/auth", () => ({
  requireTenantRole: (...a: unknown[]) => auth.requireTenantRole(...a),
  requireCustomerMembership: (...a: unknown[]) => auth.requireCustomerMembership(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/providers/notifications", () => ({ sendLocalNotification: vi.fn() }));

import { revalidatePath } from "next/cache";
import { sendLocalNotification } from "@/lib/providers/notifications";
import { requestStatusLabel } from "@/lib/ui/status";
import { audit } from "@/lib/server/audit";
import { confirmRequestAsTripAction, reviewRequestAction } from "./request-actions";

const TENANT = { id: "tenant-1", slug: "acme", branding: null as { supportMail: string } | null };
const USER = { id: "user-1", name: "Ana" };
const IDLE = { status: "idle" } as const;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function sampleRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "sr-1",
    tenantId: TENANT.id,
    customerAccountId: "cust-1",
    serviceTypeId: "svc-1",
    reference: "ACME-SR-0005",
    status: "REQUESTED",
    origin: "Manzanillo International Terminal",
    destination: "Puerto de Balboa",
    requestedDate: new Date("2026-12-01T15:00:00.000Z"),
    trip: null,
    customerAccount: { name: "Cliente Portuario" },
    serviceType: { id: "svc-1" },
    ...overrides,
  };
}

let lastTripNumber: number;

beforeEach(() => {
  vi.clearAllMocks();
  inTransaction = false;
  events.length = 0;
  lastTripNumber = 0;

  auth.requireTenantRole.mockResolvedValue({ user: USER, tenant: TENANT, membership: { role: "DISPATCHER" } });
  db.serviceRequest.findFirst.mockImplementation(async () => {
    if (inTransaction) throw new Error("db.serviceRequest.findFirst usado DENTRO de la transaccion");
    return sampleRequest();
  });
  db.$transaction.mockReset();
  db.$transaction.mockImplementation(async (callback: (t: typeof tx) => unknown) => {
    inTransaction = true;
    try {
      return await callback(tx);
    } finally {
      inTransaction = false;
    }
  });
  tx.serviceRequest.updateMany.mockReset();
  tx.serviceRequest.updateMany.mockImplementation(async () => {
    events.push("claim");
    return { count: 1 };
  });
  tx.$queryRaw.mockReset();
  tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes("FOR NO KEY UPDATE")) {
      events.push("lock");
      return [{ id: TENANT.id }];
    }
    if (sql.includes("FROM trips")) {
      events.push("max");
      return [{ last_number: lastTripNumber }];
    }
    throw new Error(`SQL inesperado: ${sql}`);
  });
  tx.trip.create.mockReset();
  tx.trip.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    events.push("create");
    return { id: "trip-1", ...data };
  });
  vi.mocked(audit).mockImplementation(async () => {
    if (inTransaction) throw new Error("audit() usado DENTRO de la transaccion");
  });
  vi.mocked(sendLocalNotification).mockImplementation(async () => {
    if (inTransaction) throw new Error("notificacion enviada DENTRO de la transaccion");
    return undefined as never;
  });
});

describe("confirmRequestAsTripAction", () => {
  it("solo OPERATIONS_MANAGER, DISPATCHER y TENANT_OWNER convierten (TENANT_ADMIN queda fuera como hoy)", async () => {
    await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));
    expect(auth.requireTenantRole).toHaveBeenCalledWith("acme", ["OPERATIONS_MANAGER", "DISPATCHER", "TENANT_OWNER"]);
  });

  it("lee la solicitud acotada al tenant de la sesion, nunca a uno que venga del formulario", async () => {
    await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1", tenantId: "tenant-ajeno" }));
    expect(db.serviceRequest.findFirst).toHaveBeenCalledWith({
      where: { id: "sr-1", tenantId: "tenant-1" },
      include: { trip: true, customerAccount: true, serviceType: true },
    });
    expect(tx.serviceRequest.updateMany.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-1" });
    expect(tx.trip.create.mock.calls[0][0].data.tenantId).toBe("tenant-1");
  });

  it("reclama la solicitud, bloquea el tenant, lee el maximo y crea el viaje, en ese orden y con tx", async () => {
    lastTripNumber = 12;
    const result = await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));

    expect(result).toEqual({ status: "success", message: "Solicitud convertida en el viaje ACME-TR-0013." });
    expect(events).toEqual(["claim", "lock", "max", "create"]);
    expect(tx.serviceRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "sr-1", tenantId: "tenant-1", status: { in: ["REQUESTED", "UNDER_REVIEW", "CONFIRMED"] } },
      data: { status: "CONVERTED", statusReason: null },
    });
  });

  it("la transaccion lleva margen de tiempo para esperar el bloqueo del tenant", async () => {
    await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));
    expect(db.$transaction.mock.calls[0][1]).toEqual({ timeout: 10_000, maxWait: 5_000 });
  });

  it("el viaje nace exactamente como siempre: CONFIRMED, ETA +4 h, ruta demo y evento visible", async () => {
    lastTripNumber = 41;
    await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));
    const requestedDate = new Date("2026-12-01T15:00:00.000Z");
    expect(tx.trip.create.mock.calls[0][0]).toStrictEqual({
      data: {
        tenantId: "tenant-1",
        customerAccountId: "cust-1",
        serviceRequestId: "sr-1",
        serviceTypeId: "svc-1",
        reference: "ACME-TR-0042",
        status: "CONFIRMED",
        origin: "Manzanillo International Terminal",
        destination: "Puerto de Balboa",
        scheduledAt: requestedDate,
        eta: new Date(requestedDate.getTime() + 4 * 60 * 60 * 1000),
        routePoints: [
          { label: "Manzanillo International Terminal", lat: 9.36, lng: -79.88 },
          { label: "Las Cumbres", lat: 9.09, lng: -79.54 },
          { label: "Puerto de Balboa", lat: 8.95, lng: -79.56 },
        ],
        customerVisibleStatus: "Servicio confirmado",
        events: {
          create: {
            tenantId: "tenant-1",
            actorId: "user-1",
            toStatus: "CONFIRMED",
            note: "Solicitud confirmada y convertida en viaje.",
            visibleToCustomer: true,
          },
        },
      },
    });
  });

  it("la referencia sale del maximo, no del conteo de viajes (sobrevive a borrados)", async () => {
    lastTripNumber = 13; // p. ej. se borraron tres referencias E2E: contar filas daria 10
    await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));
    expect(tx.trip.create.mock.calls[0][0].data.reference).toBe("ACME-TR-0014");
  });

  it("audita y notifica DESPUES de la transaccion, con los mismos textos de siempre", async () => {
    lastTripNumber = 12;
    await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));

    expect(audit).toHaveBeenCalledTimes(1);
    const auditInput = vi.mocked(audit).mock.calls[0][0];
    expect(auditInput).toMatchObject({
      tenantId: "tenant-1",
      actorId: "user-1",
      actorRole: "DISPATCHER",
      action: "service_request.convert_to_trip",
      entity: "Trip",
      entityId: "trip-1",
    });
    expect(auditInput.after).toMatchObject({ id: "trip-1", reference: "ACME-TR-0013", status: "CONFIRMED" });

    expect(sendLocalNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendLocalNotification).mock.calls[0][0]).toEqual({
      tenantId: "tenant-1",
      customerAccountId: "cust-1",
      channel: "EMAIL",
      recipient: "operaciones@nci.local",
      subject: "Viaje ACME-TR-0013 creado",
      body: "La solicitud ACME-SR-0005 fue confirmada y convertida en viaje.",
    });
    expect(vi.mocked(sendLocalNotification).mock.calls[1][0]).toEqual({
      tenantId: "tenant-1",
      customerAccountId: "cust-1",
      channel: "PORTAL",
      recipient: "Cliente Portuario",
      subject: "Servicio confirmado ACME-TR-0013",
      body: "Tu servicio fue confirmado para Manzanillo International Terminal -> Puerto de Balboa.",
    });
    // La auditoria va antes que cualquier notificacion.
    expect(vi.mocked(audit).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sendLocalNotification).mock.invocationCallOrder[0],
    );
  });

  it("el correo de aviso va al buzon de soporte de la empresa si lo tiene", async () => {
    auth.requireTenantRole.mockResolvedValue({
      user: USER,
      tenant: { ...TENANT, branding: { supportMail: "operaciones@acme.test" } },
      membership: { role: "TENANT_OWNER" },
    });
    await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));
    expect(vi.mocked(sendLocalNotification).mock.calls[0][0]).toMatchObject({
      channel: "EMAIL",
      recipient: "operaciones@acme.test",
    });
  });

  it("refresca las vistas del tenant, las solicitudes y el portal", async () => {
    await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ["/t/acme", "layout"],
      ["/t/acme/requests"],
      ["/t/acme/portal"],
    ]);
  });

  describe("conflictos", () => {
    it("si otro usuario cambio la solicitud (reclamo con 0 filas) informa su estado actual y no crea nada", async () => {
      tx.serviceRequest.updateMany.mockResolvedValue({ count: 0 });
      db.serviceRequest.findFirst
        .mockImplementationOnce(async () => sampleRequest())
        .mockImplementationOnce(async () => ({ status: "CANCELLED" }));

      const result = await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));

      expect(result).toEqual({
        status: "error",
        message: `La solicitud cambio a "${requestStatusLabel.CANCELLED}" mientras trabajaba. Revise su estado actual.`,
      });
      expect(tx.$queryRaw).not.toHaveBeenCalled(); // ni siquiera pidio el bloqueo
      expect(tx.trip.create).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
      expect(sendLocalNotification).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("si la solicitud desaparecio entre tanto, pide recargar la pagina", async () => {
      tx.serviceRequest.updateMany.mockResolvedValue({ count: 0 });
      db.serviceRequest.findFirst
        .mockImplementationOnce(async () => sampleRequest())
        .mockImplementationOnce(async () => null);
      const result = await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));
      expect(result).toEqual({ status: "error", message: "La solicitud cambio mientras trabajaba. Recargue la pagina." });
    });

    it("una colision de unicidad (P2002) pide reintentar, sin auditar ni notificar", async () => {
      tx.trip.create.mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: ["tenant_id", "reference"] } }),
      );
      const result = await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));
      expect(result).toEqual({
        status: "error",
        message: "Otro usuario registro un viaje al mismo tiempo. Intente de nuevo.",
      });
      expect(audit).not.toHaveBeenCalled();
      expect(sendLocalNotification).not.toHaveBeenCalled();
    });

    it("un error inesperado no se traga: se relanza y no se audita", async () => {
      tx.trip.create.mockRejectedValue(new Error("conexion perdida"));
      await expect(confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }))).rejects.toThrow("conexion perdida");
      expect(audit).not.toHaveBeenCalled();
    });
  });

  describe("guardas previas (sin abrir la transaccion)", () => {
    it.each([
      ["la solicitud no existe", async () => null, "La solicitud no existe o no pertenece a esta empresa."],
      [
        "ya tiene un viaje",
        async () => sampleRequest({ trip: { reference: "ACME-TR-0003" } }),
        "La solicitud ya fue convertida en el viaje ACME-TR-0003.",
      ],
      [
        "esta rechazada",
        async () => sampleRequest({ status: "REJECTED" }),
        `No se puede convertir una solicitud en estado "${requestStatusLabel.REJECTED}".`,
      ],
      [
        "es un borrador",
        async () => sampleRequest({ status: "DRAFT" }),
        `No se puede convertir una solicitud en estado "${requestStatusLabel.DRAFT}".`,
      ],
    ])("%s", async (_caso, lookup, message) => {
      db.serviceRequest.findFirst.mockImplementation(lookup);
      const result = await confirmRequestAsTripAction("acme", IDLE, form({ requestId: "sr-1" }));
      expect(result).toEqual({ status: "error", message });
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    });
  });
});

describe("reviewRequestAction (mensajes y roles sin cambios)", () => {
  it("usa los mismos roles de operacion que la conversion", async () => {
    await reviewRequestAction("acme", IDLE, form({ decision: "reject", reason: "x" }));
    expect(auth.requireTenantRole).toHaveBeenCalledWith("acme", ["OPERATIONS_MANAGER", "DISPATCHER", "TENANT_OWNER"]);
  });

  it.each([
    [{ decision: "otra" }, "Seleccione una accion valida."],
    [{ decision: "reject", reason: "no" }, "Escriba el motivo del rechazo (el cliente lo vera)."],
    [{ decision: "request_info", reason: "no" }, "Escriba que informacion necesita del cliente."],
  ])("%j => %s", async (fields, message) => {
    const result = await reviewRequestAction("acme", IDLE, form({ requestId: "sr-1", ...fields }));
    expect(result).toEqual({ status: "error", message });
    expect(db.serviceRequest.findFirst).not.toHaveBeenCalled();
  });
});
