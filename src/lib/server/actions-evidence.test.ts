import { beforeEach, describe, expect, it, vi } from "vitest";

// Pruebas de las reglas de evidencia/cierre/tipo de servicio de actions.ts con
// la base de datos y los servicios externos simulados (sin I/O real).

const tx = {
  trip: { updateMany: vi.fn() },
  tripEvent: { create: vi.fn() },
  tripAssignment: { updateMany: vi.fn() },
  proofOfDelivery: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  document: { updateMany: vi.fn(), create: vi.fn() },
  // Sin `count`: la referencia sale del maximo del sufijo bajo el bloqueo del tenant (ADR-038);
  // un `count()` accidental fallaria aqui con "is not a function".
  serviceRequest: { create: vi.fn() },
  $queryRaw: vi.fn(),
};
const db = {
  trip: { findFirst: vi.fn() },
  driver: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  proofOfDelivery: { upsert: vi.fn() },
  document: { create: vi.fn(), updateMany: vi.fn() },
  fileAttachment: { findMany: vi.fn() },
  serviceType: { findFirst: vi.fn() },
  serviceRequest: { findFirst: vi.fn() },
  $transaction: vi.fn(),
};

const auth = {
  requireTenantMembership: vi.fn(),
  requireTenantRole: vi.fn(),
  requireCustomerMembership: vi.fn(),
  signIn: vi.fn(),
  requiresMfaForRole: vi.fn(),
};
const mfa = { userHasMfaActive: vi.fn() };
const rateLimit = { enforceRateLimit: vi.fn() };

vi.mock("@/lib/server/db", () => ({ getDb: () => db }));
vi.mock("@/lib/server/auth", () => ({
  requireTenantMembership: (...a: unknown[]) =>
    auth.requireTenantMembership(...a),
  requireTenantRole: (...a: unknown[]) => auth.requireTenantRole(...a),
  requireCustomerMembership: (...a: unknown[]) =>
    auth.requireCustomerMembership(...a),
  requirePlatformRole: vi.fn(),
  requiresMfaForRole: (...a: unknown[]) => auth.requiresMfaForRole(...a),
  signIn: (...a: unknown[]) => auth.signIn(...a),
  signOut: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/server/mfa", () => ({
  userHasMfaActive: (...a: unknown[]) => mfa.userHasMfaActive(...a),
}));
vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: (...a: unknown[]) => rateLimit.enforceRateLimit(...a),
}));
vi.mock("@/lib/server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/providers/notifications", () => ({
  sendLocalNotification: vi.fn(),
}));
vi.mock("@/lib/server/pod-pdf", () => ({
  generateProofOfDeliveryPdf: vi.fn(async () => Buffer.from("pdf")),
}));
vi.mock("@/lib/server/file-pipeline", () => ({
  processUploadThroughPipeline: vi.fn(async () => ({
    verdict: "CLEAN",
    objectKey: "tenants/acme/evidence/a.png",
    fileAttachmentId: "fa-1",
  })),
}));
vi.mock("@/lib/server/storage", () => ({
  getStorageBucket: () => "bucket",
  isValidSignaturePng: () => true,
  uploadBuffer: vi.fn(),
  validateUploadedFile: vi.fn(async () => ({
    filename: "a.png",
    buffer: Buffer.from("png-bytes"),
    mimeType: "image/png",
  })),
  UploadRejectedError: class UploadRejectedError extends Error {},
}));

import { sendLocalNotification } from "@/lib/providers/notifications";
import { audit } from "@/lib/server/audit";
import { generateProofOfDeliveryPdf } from "@/lib/server/pod-pdf";
import {
  approveProofAction,
  createServiceRequestAction,
  loginAction,
  rejectProofAction,
  submitProofAction,
  transitionTripAction,
} from "./actions";

const TENANT = { id: "tenant-1", slug: "acme", branding: null };
const USER = { id: "user-1", name: "Ana" };
const TRIP_ID = "00000000-0000-4000-8000-000000000001";
const PROOF_ID = "proof-1";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function asRole(role: string) {
  auth.requireTenantMembership.mockResolvedValue({
    user: USER,
    tenant: TENANT,
    membership: { role },
  });
  auth.requireTenantRole.mockResolvedValue({
    user: USER,
    tenant: TENANT,
    membership: { role },
  });
}

function trip(overrides: Record<string, unknown> = {}) {
  return {
    id: TRIP_ID,
    reference: "ACME-TR-1",
    tenantId: TENANT.id,
    customerAccountId: "account-1",
    driverId: "driver-1",
    status: "EVIDENCE_PENDING",
    proofReady: false,
    proof: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(
    async (callback: (t: typeof tx) => unknown) => callback(tx),
  );
  db.driver.findFirst.mockResolvedValue({ id: "driver-1" });
  tx.trip.updateMany.mockResolvedValue({ count: 1 });
  tx.proofOfDelivery.updateMany.mockResolvedValue({ count: 1 });
  tx.proofOfDelivery.findUniqueOrThrow.mockResolvedValue({ id: PROOF_ID });
  tx.document.updateMany.mockResolvedValue({ count: 1 });
});

describe("transitionTripAction (AT-06)", () => {
  it.each(["EVIDENCE_SUBMITTED", "EVIDENCE_APPROVED"])(
    "rechaza %s como cambio de estado generico para cualquier rol, sin escribir",
    async (nextStatus) => {
      for (const [role, status] of [
        ["DRIVER", "EVIDENCE_PENDING"],
        [
          "OPERATIONS_MANAGER",
          nextStatus === "EVIDENCE_SUBMITTED"
            ? "EVIDENCE_PENDING"
            : "EVIDENCE_SUBMITTED",
        ],
        [
          "TENANT_OWNER",
          nextStatus === "EVIDENCE_SUBMITTED"
            ? "EVIDENCE_PENDING"
            : "EVIDENCE_SUBMITTED",
        ],
      ] as const) {
        asRole(role);
        db.trip.findFirst.mockResolvedValue(trip({ status }));
        const result = await transitionTripAction(
          "acme",
          { status: "idle" },
          form({ tripId: TRIP_ID, nextStatus }),
        );
        expect(result.status, `${role} ${status} -> ${nextStatus}`).toBe(
          "error",
        );
        expect(db.$transaction).not.toHaveBeenCalled();
      }
    },
  );

  it("no cierra un viaje sin evidencia aprobada ni proofReady", async () => {
    asRole("OPERATIONS_MANAGER");
    for (const overrides of [
      { proof: null, proofReady: false },
      { proof: null, proofReady: true },
      { proof: { id: PROOF_ID, status: "SUBMITTED" }, proofReady: true },
      { proof: { id: PROOF_ID, status: "APPROVED" }, proofReady: false },
    ]) {
      db.trip.findFirst.mockResolvedValue(
        trip({ status: "EVIDENCE_APPROVED", ...overrides }),
      );
      const result = await transitionTripAction(
        "acme",
        { status: "idle" },
        form({ tripId: TRIP_ID, nextStatus: "CLOSED" }),
      );
      expect(result.status).toBe("error");
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("cierra con evidencia aprobada y no vuelve a fijar proofReady", async () => {
    asRole("OPERATIONS_MANAGER");
    db.trip.findFirst.mockResolvedValue(
      trip({
        status: "EVIDENCE_APPROVED",
        proofReady: true,
        proof: { id: PROOF_ID, status: "APPROVED" },
      }),
    );
    const result = await transitionTripAction(
      "acme",
      { status: "idle" },
      form({ tripId: TRIP_ID, nextStatus: "CLOSED" }),
    );
    expect(result.status).toBe("success");
    const data = tx.trip.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe("CLOSED");
    expect(data).not.toHaveProperty("proofReady", true);
  });

  it("sigue permitiendo el flujo normal (DELIVERED -> EVIDENCE_PENDING)", async () => {
    asRole("DRIVER");
    db.trip.findFirst.mockResolvedValue(trip({ status: "DELIVERED" }));
    const result = await transitionTripAction(
      "acme",
      { status: "idle" },
      form({ tripId: TRIP_ID, nextStatus: "EVIDENCE_PENDING" }),
    );
    expect(result.status).toBe("success");
  });
});

describe("evidence visibility (AT-05)", () => {
  it("el conductor sube la evidencia como INTERNAL (y las fotos offline ligadas tambien)", async () => {
    asRole("DRIVER");
    db.trip.findFirst.mockResolvedValue(trip({ status: "EVIDENCE_PENDING" }));
    db.proofOfDelivery.upsert.mockResolvedValue({ id: PROOF_ID });
    db.fileAttachment.findMany.mockResolvedValue([
      { objectKey: "tenants/acme/evidence/offline.jpg" },
    ]);
    const result = await submitProofAction(
      "acme",
      { status: "idle" },
      form({
        tripId: TRIP_ID,
        receiverName: "Receptor",
        signatureData: "data:image/png;base64,xxx",
        availablePhotoIds: "fa-offline",
        evidenceFile: new File(["png-bytes"], "a.png", {
          type: "image/png",
        }) as unknown as string,
      }),
    );
    expect(result.status).toBe("success");
    expect(db.document.create.mock.calls[0][0].data).toMatchObject({
      proofId: PROOF_ID,
      visibility: "INTERNAL",
    });
    expect(db.document.updateMany.mock.calls[0][0].data).toEqual({
      proofId: PROOF_ID,
      visibility: "INTERNAL",
    });
  });

  const evidence = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    proofId: PROOF_ID,
    mimeType: "image/jpeg",
    // El POD se distingue por la clave (/pod/), no por el MIME.
    objectKey: `tenants/acme/trips/TR-1/evidence/${id}.jpg`,
    visibility: "INTERNAL",
    ...overrides,
  });

  it("aprobar publica solo la evidencia INTERNAL de la prueba, dentro de la transaccion, y el POD la lista", async () => {
    asRole("OPERATIONS_MANAGER");
    db.trip.findFirst.mockResolvedValue({
      ...trip({
        status: "EVIDENCE_SUBMITTED",
        proof: { id: PROOF_ID, status: "SUBMITTED" },
      }),
      tenant: TENANT,
      customerAccount: { name: "Cliente" },
      documents: [
        evidence("photo"),
        evidence("other", { proofId: "proof-2" }),
        evidence("pod", {
          mimeType: "application/pdf",
          objectKey: "tenants/acme/trips/TR-1/pod/TR-1-pod.pdf",
        }),
        // Un PDF subido por el conductor SI es evidencia y se publica al aprobar.
        evidence("evidence-pdf", {
          mimeType: "application/pdf",
          objectKey: "tenants/acme/trips/TR-1/evidence/acta.pdf",
        }),
      ],
      fileAttachments: [],
      events: [],
    });
    const result = await approveProofAction(
      "acme",
      { status: "idle" },
      form({ tripId: TRIP_ID }),
    );
    expect(result.status).toBe("success");

    const publish = tx.document.updateMany.mock.calls[0][0];
    expect(publish.where).toMatchObject({
      id: { in: ["photo", "evidence-pdf"] },
      tenantId: "tenant-1",
      proofId: PROOF_ID,
      visibility: "INTERNAL",
    });
    expect(publish.data).toEqual({ visibility: "CUSTOMER_VISIBLE" });
    expect(tx.document.create.mock.calls[0][0].data).toMatchObject({
      mimeType: "application/pdf",
      visibility: "CUSTOMER_VISIBLE",
    });

    const podTrip = vi.mocked(generateProofOfDeliveryPdf).mock.calls[0][0];
    const byId = Object.fromEntries(
      podTrip.documents.map((d) => [d.id, d.visibility]),
    );
    expect(byId).toEqual({
      photo: "CUSTOMER_VISIBLE",
      other: "INTERNAL",
      pod: "INTERNAL",
      "evidence-pdf": "CUSTOMER_VISIBLE",
    });
  });

  it("rechazar devuelve la evidencia a INTERNAL y la desliga de la prueba", async () => {
    asRole("OPERATIONS_MANAGER");
    db.trip.findFirst.mockResolvedValue(
      trip({
        status: "EVIDENCE_SUBMITTED",
        proof: { id: PROOF_ID, status: "SUBMITTED" },
      }),
    );
    const result = await rejectProofAction(
      "acme",
      { status: "idle" },
      form({ tripId: TRIP_ID, reason: "Foto borrosa, repetir" }),
    );
    expect(result.status).toBe("success");
    const revoke = tx.document.updateMany.mock.calls[0][0];
    expect(revoke.where).toMatchObject({
      tenantId: "tenant-1",
      tripId: TRIP_ID,
      proofId: PROOF_ID,
      NOT: { objectKey: { contains: "/pod/" } },
    });
    expect(revoke.data).toEqual({ visibility: "INTERNAL", proofId: null });
  });
});

describe("createServiceRequestAction (AT-07)", () => {
  const fields = {
    serviceTypeId: "00000000-0000-4000-8000-0000000000aa",
    origin: "Manzanillo",
    destination: "Balboa",
    requestedDate: "2026-12-01T10:00",
    contactName: "Ana",
    contactPhone: "5551234",
    containerNumber: "NCIU1234567",
    containerSize: "40",
    containerType: "HC",
    shippingLine: "Maersk",
    terminal: "MIT",
    sealNumber: "SEAL1",
    loadStatus: "LOADED",
    emptyReturnRequired: "NO",
    bookingReference: "BK-1",
  };

  // Orden de las operaciones de la transaccion y ultimo numero que "existe" en la base simulada.
  let txOrder: string[];
  let lastReferenceNumber: number;

  beforeEach(() => {
    auth.requireCustomerMembership.mockResolvedValue({
      user: USER,
      tenant: TENANT,
      customerAccount: { id: "account-1", name: "Cliente" },
    });
    db.serviceRequest.findFirst.mockResolvedValue(null);
    db.serviceType.findFirst.mockResolvedValue({ id: fields.serviceTypeId });
    txOrder = [];
    lastReferenceNumber = 0;
    // `$queryRaw` se invoca como plantilla etiquetada: (strings, ...values). Se distingue por el SQL.
    tx.$queryRaw.mockReset();
    tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("FOR NO KEY UPDATE")) {
        txOrder.push("lock");
        return [{ id: TENANT.id }];
      }
      if (sql.includes("FROM service_requests")) {
        txOrder.push("max");
        return [{ last_number: lastReferenceNumber }];
      }
      throw new Error(`SQL inesperado en la transaccion: ${sql}`);
    });
    tx.serviceRequest.create.mockReset();
    tx.serviceRequest.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        txOrder.push("create");
        return { id: "sr-1", ...data };
      },
    );
  });

  /** Falla el INSERT como lo haria Prisma ante una restriccion unica (P2002). */
  function uniqueViolation(columns: string[]) {
    return Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: columns },
    });
  }

  it("rechaza un serviceTypeId que no es un tipo activo de este tenant, sin crear nada", async () => {
    db.serviceType.findFirst.mockResolvedValue(null);
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("Tipo de servicio invalido");
    expect(db.serviceType.findFirst).toHaveBeenCalledWith({
      where: { id: fields.serviceTypeId, tenantId: "tenant-1", active: true },
      select: { id: true },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.serviceRequest.create).not.toHaveBeenCalled();
  });

  it("crea la solicitud con el tipo de servicio validado del tenant", async () => {
    db.serviceType.findFirst.mockResolvedValue({ id: fields.serviceTypeId });
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    expect(tx.serviceRequest.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant-1",
      serviceTypeId: fields.serviceTypeId,
    });
  });

  it("toma el tenant y el cliente de la sesion, nunca de campos del formulario", async () => {
    await expect(
      createServiceRequestAction(
        "acme",
        form({ ...fields, tenantId: "tenant-ajeno", customerAccountId: "cuenta-ajena" }),
      ),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    expect(auth.requireCustomerMembership).toHaveBeenCalledWith("acme", [
      "CUSTOMER_ADMIN",
    ]);
    expect(tx.serviceRequest.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant-1",
      customerAccountId: "account-1",
      createdById: "user-1",
    });
  });

  it("bloquea el tenant, lee el maximo de referencias y solo despues crea, todo con tx", async () => {
    lastReferenceNumber = 41; // hay huecos y borrados: no importa cuantas filas haya, sino el mayor numero
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");

    expect(txOrder).toEqual(["lock", "max", "create"]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.serviceRequest.create.mock.calls[0][0].data.reference).toBe(
      "ACME-SR-0042",
    );
    // El bloqueo y la lectura reciben el tenant de la sesion como parametro (nunca interpolado).
    const [lockStrings, ...lockValues] = tx.$queryRaw.mock.calls[0];
    expect(lockStrings.join("?")).toContain("FOR NO KEY UPDATE");
    expect(lockValues).toEqual(["tenant-1"]);
    const [, ...maxValues] = tx.$queryRaw.mock.calls[1];
    expect(maxValues).toEqual(expect.arrayContaining(["tenant-1", "ACME-SR-"]));
  });

  it("la transaccion lleva margen de tiempo: el bloqueo del tenant puede esperar a otra alta en curso", async () => {
    tx.serviceRequest.create.mockImplementationOnce(async () => {
      throw uniqueViolation(["tenant_id", "reference"]); // fuerza un segundo intento
    });
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    // Prisma cancela por defecto a los 5 s: cada intento debe llevar su propio margen, no solo el primero.
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    for (const [, options] of db.$transaction.mock.calls) {
      expect(options).toEqual({ timeout: 10_000, maxWait: 5_000 });
    }
  });

  it("la numeracion sigue despues del 9999 sin truncar", async () => {
    lastReferenceNumber = 9999;
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    expect(tx.serviceRequest.create.mock.calls[0][0].data.reference).toBe(
      "ACME-SR-10000",
    );
  });

  it("interpreta la fecha requerida como hora de Panama (UTC-5), no como la zona del servidor", async () => {
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    const { requestedDate } = tx.serviceRequest.create.mock.calls[0][0].data;
    expect(requestedDate).toBeInstanceOf(Date);
    expect(requestedDate.toISOString()).toBe("2026-12-01T15:00:00.000Z");
  });

  it("acepta solo la fecha (YYYY-MM-DD) como medianoche de Panama", async () => {
    await expect(
      createServiceRequestAction(
        "acme",
        form({ ...fields, requestedDate: "2026-12-01" }),
      ),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    expect(
      tx.serviceRequest.create.mock.calls[0][0].data.requestedDate.toISOString(),
    ).toBe("2026-12-01T05:00:00.000Z");
  });

  it.each([
    ["un dia que no existe", "2026-02-31T10:00"],
    ["una hora fuera de rango", "2026-12-01T25:00"],
    ["una fecha con zona (Z)", "2026-12-01T10:00:00Z"],
    ["una fecha con desfase", "2026-12-01T10:00:00-05:00"],
    ["un anio de dos digitos mal tecleado", "0026-12-01T10:00"],
    ["texto que no es una fecha", "no-es-una-fecha"],
  ])("rechaza %s sin llegar a la base de datos", async (_caso, requestedDate) => {
    await expect(
      createServiceRequestAction("acme", form({ ...fields, requestedDate })),
    ).rejects.toThrow("La fecha requerida no es válida.");
    expect(db.serviceType.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.serviceRequest.create).not.toHaveBeenCalled();
  });

  it("reintenta toda la transaccion con una referencia nueva si otra alta ocupo la misma (P2002)", async () => {
    tx.serviceRequest.create.mockImplementationOnce(async () => {
      txOrder.push("create");
      lastReferenceNumber = 1; // la otra alta ya confirmo la 0001
      throw uniqueViolation(["tenant_id", "reference"]);
    });
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");

    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(txOrder).toEqual(["lock", "max", "create", "lock", "max", "create"]);
    expect(
      tx.serviceRequest.create.mock.calls.map(
        (call) => (call[0] as { data: { reference: string } }).data.reference,
      ),
    ).toEqual(["ACME-SR-0001", "ACME-SR-0002"]);
  });

  it("se rinde tras 3 intentos con la referencia ocupada y propaga el error, sin auditar ni notificar", async () => {
    tx.serviceRequest.create.mockImplementation(async () => {
      throw uniqueViolation(["tenant_id", "reference"]);
    });
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(db.$transaction).toHaveBeenCalledTimes(3);
    expect(audit).not.toHaveBeenCalled();
    expect(sendLocalNotification).not.toHaveBeenCalled();
  });

  it("un P2002 sin destino identificable tambien se reintenta (solo hay dos restricciones unicas)", async () => {
    tx.serviceRequest.create.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
      });
    });
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it("un doble envio simultaneo (P2002 de clientRequestKey) vuelve al portal sin reintentar ni duplicar", async () => {
    tx.serviceRequest.create.mockImplementation(async () => {
      throw uniqueViolation(["tenant_id", "client_request_key"]);
    });
    // El pre-chequeo no la vio (el otro envio aun no habia confirmado); tras el P2002 ya existe.
    db.serviceRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "sr-del-otro-envio" });
    await expect(
      createServiceRequestAction(
        "acme",
        form({ ...fields, idempotencyKey: "clave-de-envio-0001" }),
      ),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.serviceRequest.findFirst).toHaveBeenLastCalledWith({
      where: {
        tenantId: "tenant-1",
        customerAccountId: "account-1",
        clientRequestKey: "clave-de-envio-0001",
      },
      select: { id: true },
    });
    expect(audit).not.toHaveBeenCalled();
    expect(sendLocalNotification).not.toHaveBeenCalled();
  });

  // El motor no siempre dice cual restriccion fallo (`meta.target`): lo que decide es si la solicitud de ESTE
  // envio ya existe. Con la logica anterior (reintentar todo P2002 que no se identificara como clave) un doble
  // envio de este tipo abria 3 transacciones y terminaba en error 500.
  it.each([
    ["sin destino identificable", undefined],
    ["de la referencia", ["tenant_id", "reference"]],
  ])(
    "un doble envio simultaneo cuyo P2002 es %s tambien vuelve al portal sin reintentar",
    async (_caso, columns) => {
      tx.serviceRequest.create.mockImplementation(async () => {
        throw columns
          ? uniqueViolation(columns)
          : Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      });
      db.serviceRequest.findFirst
        .mockResolvedValueOnce(null) // pre-chequeo: aun no existia
        .mockResolvedValueOnce({ id: "sr-del-otro-envio" }); // tras el P2002 ya existe
      await expect(
        createServiceRequestAction(
          "acme",
          form({ ...fields, idempotencyKey: "clave-de-envio-0001" }),
        ),
      ).rejects.toThrow("REDIRECT:/t/acme/portal");
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(audit).not.toHaveBeenCalled();
      expect(sendLocalNotification).not.toHaveBeenCalled();
    },
  );

  it("si la clave de idempotencia ya la uso OTRO cliente no finge exito: propaga el error", async () => {
    tx.serviceRequest.create.mockImplementation(async () => {
      throw uniqueViolation(["tenant_id", "client_request_key"]);
    });
    // Ni el pre-chequeo ni el de despues del P2002 encuentran una solicitud de ESTE cliente.
    db.serviceRequest.findFirst.mockResolvedValue(null);
    await expect(
      createServiceRequestAction(
        "acme",
        form({ ...fields, idempotencyKey: "clave-de-otro-cliente" }),
      ),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
    expect(sendLocalNotification).not.toHaveBeenCalled();
  });

  it("si la clave de idempotencia ya existe vuelve al portal sin abrir la transaccion", async () => {
    db.serviceRequest.findFirst.mockResolvedValue({ id: "sr-previa" });
    await expect(
      createServiceRequestAction(
        "acme",
        form({ ...fields, idempotencyKey: "clave-de-envio-0001" }),
      ),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    expect(db.serviceRequest.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        customerAccountId: "account-1",
        clientRequestKey: "clave-de-envio-0001",
      },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("un error que no es de unicidad se propaga sin reintentar", async () => {
    tx.serviceRequest.create.mockImplementation(async () => {
      throw new Error("conexion perdida");
    });
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("conexion perdida");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("audita y notifica una sola vez, con la referencia creada", async () => {
    lastReferenceNumber = 6;
    await expect(
      createServiceRequestAction("acme", form(fields)),
    ).rejects.toThrow("REDIRECT:/t/acme/portal");
    expect(audit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0][0]).toMatchObject({
      tenantId: "tenant-1",
      actorId: "user-1",
      actorRole: "CUSTOMER_ADMIN",
      action: "service_request.create",
      entity: "ServiceRequest",
      entityId: "sr-1",
    });
    expect(sendLocalNotification).toHaveBeenCalledTimes(3);
    expect(vi.mocked(sendLocalNotification).mock.calls[0][0]).toMatchObject({
      subject: "Nueva solicitud ACME-SR-0007",
    });
  });
});

describe("loginAction (AT-03)", () => {
  async function loginAs(role: string) {
    rateLimit.enforceRateLimit.mockResolvedValue({ allowed: true });
    auth.signIn.mockResolvedValue({ ok: true, mfaRequired: false });
    auth.requiresMfaForRole.mockResolvedValue(false);
    mfa.userHasMfaActive.mockResolvedValue(false);
    db.user.findUnique.mockResolvedValue({
      id: USER.id,
      platformRole: null,
      tenantMemberships: [{ role, tenant: { slug: "acme" } }],
      customerMemberships: [],
    });
    return loginAction(
      null,
      form({ email: "ana@example.com", password: "Password2026!" }),
    );
  }

  it("lleva al conductor a su app y a los demas roles al centro de control", async () => {
    await expect(loginAs("DRIVER")).rejects.toThrow("REDIRECT:/t/acme/driver");
    for (const role of [
      "TENANT_OWNER",
      "TENANT_ADMIN",
      "OPERATIONS_MANAGER",
      "DISPATCHER",
      "SAFETY_MANAGER",
    ]) {
      await expect(loginAs(role), role).rejects.toThrow(/^REDIRECT:\/t\/acme$/);
    }
  });
});
