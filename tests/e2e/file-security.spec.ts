import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Socket } from "node:net";
import { processUploadThroughPipeline } from "../../src/lib/server/file-pipeline";
import { login } from "./helpers/auth";

config({ path: ".env.local" });

const db = new PrismaClient();

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "nci_minio",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "nci_minio_password",
  },
  forcePathStyle: true,
});

const BUCKET = process.env.MINIO_BUCKET ?? "nci-logistics-local";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

const pngFixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lr6N9wAAAABJRU5ErkJggg==",
  "base64",
);

const users = {
  customer: ["cliente@clienteportuario.local", "Cliente2026!"],
  operations: ["operaciones@panatruck.local", "Operaciones2026!"],
  driver: ["conductor1@panatruck.local", "Conductor2026!"],
  transOwner: ["owner@translogistica.local", "TransLogistica2026!"],
} as const;

function clamavPing(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    socket.setTimeout(5_000);
    socket.on("data", (d) => {
      const r = d.toString("utf8").replace(/\0/g, "").trim();
      socket.destroy();
      resolve(r === "PONG");
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(3310, "localhost", () => socket.end(Buffer.from("zPING\0")));
  });
}

test.describe.serial("FILE-SEC file security pipeline", () => {
  test.setTimeout(90_000);

  let panatruck: { id: string; slug: string };
  let testTrip: { id: string; reference: string; customerAccountId: string };

  test.beforeAll(async () => {
    panatruck = await db.tenant.findUniqueOrThrow({ where: { slug: "panatruck-demo" } });
    const trips = await db.trip.findMany({
      where: { tenantId: panatruck.id },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    if (trips.length > 0) {
      testTrip = { id: trips[0].id, reference: trips[0].reference, customerAccountId: trips[0].customerAccountId };
    }
  });

  test("FILE-SEC-E2E-001 EICAR detected as INFECTED by ClamAV", async () => {
    const ok = await clamavPing();
    expect(ok, "ClamAV must be running").toBe(true);

    const eicarBuf = Buffer.from(EICAR, "ascii");
    const header = Buffer.from("zINSTREAM\0");
    const size = Buffer.alloc(4);
    size.writeUInt32BE(eicarBuf.length, 0);
    const terminator = Buffer.alloc(4, 0);
    const command = Buffer.concat([header, size, eicarBuf, terminator]);

    const result = await new Promise<string>((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      socket.setTimeout(30_000);
      socket.on("data", (c) => chunks.push(c));
      socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim()));
      socket.on("error", reject);
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("timeout"));
      });
      socket.connect(3310, "localhost", () => socket.end(command));
    });

    expect(result).toContain("FOUND");
    expect(result).toContain("Eicar");
  });

  test("FILE-SEC-E2E-002 clean file passes ClamAV scan", async () => {
    const cleanBuf = Buffer.from("This is a perfectly safe test file content.", "utf8");
    const header = Buffer.from("zINSTREAM\0");
    const size = Buffer.alloc(4);
    size.writeUInt32BE(cleanBuf.length, 0);
    const terminator = Buffer.alloc(4, 0);
    const command = Buffer.concat([header, size, cleanBuf, terminator]);

    const result = await new Promise<string>((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      socket.setTimeout(30_000);
      socket.on("data", (c) => chunks.push(c));
      socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim()));
      socket.on("error", reject);
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("timeout"));
      });
      socket.connect(3310, "localhost", () => socket.end(command));
    });

    expect(result).toContain("OK");
    expect(result).not.toContain("FOUND");
  });

  test("FILE-SEC-E2E-003 quarantined file cannot be downloaded", async ({ page }) => {
    if (!testTrip) test.skip();

    const objectKey = `tenants/panatruck-demo/trips/${testTrip.reference}/evidence/quarantine-test-${randomUUID()}.png`;
    const quarantineKey = `quarantine/${objectKey}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: quarantineKey,
        Body: pngFixture,
        ContentType: "image/png",
      }),
    );

    const attachment = await db.fileAttachment.create({
      data: {
        tenantId: panatruck.id,
        tripId: testTrip.id,
        filename: `quarantined-${randomUUID()}.png`,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        status: "QUARANTINE",
        bucket: BUCKET,
        quarantineKey,
        objectKey,
      },
    });

    const doc = await db.document.create({
      data: {
        tenantId: panatruck.id,
        customerAccountId: testTrip.customerAccountId,
        tripId: testTrip.id,
        filename: attachment.filename,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        bucket: BUCKET,
        objectKey,
        visibility: "CUSTOMER_VISIBLE",
        uploadedById: (await db.user.findFirst({ where: { email: users.driver[0] } }))!.id,
      },
    });

    await login(page, ...users.customer);
    const response = await page.request.get(
      `/api/t/panatruck-demo/documents/${doc.id}`,
    );
    expect(response.status()).toBe(403);

    await db.document.delete({ where: { id: doc.id } });
    await db.fileAttachment.delete({ where: { id: attachment.id } });
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: quarantineKey }));
  });

  test("FILE-SEC-E2E-004 tenant isolation prevents cross-tenant document access", async ({ page }) => {
    if (!testTrip) test.skip();

    // Documento propio de Panatruck: antes se omitia si la DB no traia documentos
    // visibles al cliente de corridas previas (caso habitual tras `pnpm e2e:cleanup`).
    const objectKey = `tenants/panatruck-demo/trips/${testTrip.reference}/evidence/isolation-${randomUUID()}.png`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: pngFixture, ContentType: "image/png" }));
    const doc = await db.document.create({
      data: {
        tenantId: panatruck.id,
        customerAccountId: testTrip.customerAccountId,
        tripId: testTrip.id,
        filename: `isolation-${randomUUID()}.png`,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        bucket: BUCKET,
        objectKey,
        visibility: "CUSTOMER_VISIBLE",
      },
    });

    try {
      await login(page, ...users.transOwner);
      const response = await page.request.get(
        `/api/t/translogistica-demo/documents/${doc.id}`,
        { maxRedirects: 0 },
      );
      expect(response.status()).not.toBe(303);
      expect(response.ok()).toBe(false);
    } finally {
      await db.document.delete({ where: { id: doc.id } });
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: objectKey })).catch(() => {});
    }
  });

  test("FILE-SEC-E2E-005 PENDING_SCAN file blocked from download", async ({ page }) => {
    if (!testTrip) test.skip();

    const objectKey = `tenants/panatruck-demo/trips/${testTrip.reference}/evidence/pending-test-${randomUUID()}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: objectKey,
        Body: pngFixture,
        ContentType: "image/png",
      }),
    );

    const attachment = await db.fileAttachment.create({
      data: {
        tenantId: panatruck.id,
        tripId: testTrip.id,
        filename: `pending-${randomUUID()}.png`,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        status: "PENDING_SCAN",
        bucket: BUCKET,
        quarantineKey: `quarantine/${objectKey}`,
        objectKey,
      },
    });

    const doc = await db.document.create({
      data: {
        tenantId: panatruck.id,
        customerAccountId: testTrip.customerAccountId,
        tripId: testTrip.id,
        filename: attachment.filename,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        bucket: BUCKET,
        objectKey,
        visibility: "CUSTOMER_VISIBLE",
      },
    });

    await login(page, ...users.customer);
    const response = await page.request.get(
      `/api/t/panatruck-demo/documents/${doc.id}`,
    );
    expect(response.status()).toBe(403);

    await db.document.delete({ where: { id: doc.id } });
    await db.fileAttachment.delete({ where: { id: attachment.id } });
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: objectKey })).catch(() => {});
  });

  test("FILE-SEC-E2E-006 INFECTED file blocked from download", async ({ page }) => {
    if (!testTrip) test.skip();

    const objectKey = `tenants/panatruck-demo/trips/${testTrip.reference}/evidence/infected-test-${randomUUID()}.png`;

    const attachment = await db.fileAttachment.create({
      data: {
        tenantId: panatruck.id,
        tripId: testTrip.id,
        filename: `infected-${randomUUID()}.png`,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        status: "INFECTED",
        bucket: BUCKET,
        quarantineKey: `quarantine/${objectKey}`,
        objectKey,
        scanVerdict: "INFECTED",
        scanDetail: "Eicar-Test-Signature",
        scannedAt: new Date(),
      },
    });

    const doc = await db.document.create({
      data: {
        tenantId: panatruck.id,
        customerAccountId: testTrip.customerAccountId,
        tripId: testTrip.id,
        filename: attachment.filename,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        bucket: BUCKET,
        objectKey,
        visibility: "CUSTOMER_VISIBLE",
        uploadedById: (await db.user.findFirst({ where: { email: users.driver[0] } }))!.id,
      },
    });

    await login(page, ...users.customer);
    const response = await page.request.get(
      `/api/t/panatruck-demo/documents/${doc.id}`,
    );
    expect(response.status()).toBe(403);

    await db.document.delete({ where: { id: doc.id } });
    await db.fileAttachment.delete({ where: { id: attachment.id } });
  });

  test("FILE-SEC-E2E-007 only AVAILABLE files served via download", async ({ page }) => {
    if (!testTrip) test.skip();

    const objectKey = `tenants/panatruck-demo/trips/${testTrip.reference}/evidence/available-test-${randomUUID()}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: objectKey,
        Body: pngFixture,
        ContentType: "image/png",
      }),
    );

    const attachment = await db.fileAttachment.create({
      data: {
        tenantId: panatruck.id,
        tripId: testTrip.id,
        filename: `available-${randomUUID()}.png`,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        status: "AVAILABLE",
        bucket: BUCKET,
        quarantineKey: `quarantine/${objectKey}`,
        objectKey,
        promotedAt: new Date(),
      },
    });

    const doc = await db.document.create({
      data: {
        tenantId: panatruck.id,
        customerAccountId: testTrip.customerAccountId,
        tripId: testTrip.id,
        filename: attachment.filename,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        bucket: BUCKET,
        objectKey,
        visibility: "CUSTOMER_VISIBLE",
        uploadedById: (await db.user.findFirst({ where: { email: users.driver[0] } }))!.id,
      },
    });

    await login(page, ...users.customer);
    const response = await page.request.get(
      `/api/t/panatruck-demo/documents/${doc.id}`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(303);

    await db.document.delete({ where: { id: doc.id } });
    await db.fileAttachment.delete({ where: { id: attachment.id } });
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: objectKey })).catch(() => {});
  });

  test("FILE-SEC-E2E-008 FileAttachment records scan events", async () => {
    if (!testTrip) test.skip();

    // Autosuficiente: antes dependia de adjuntos que dejaban corridas previas, y
    // fallaba con la DB recien limpiada (`pnpm e2e:cleanup`). Pasa un archivo
    // real por el pipeline (cuarentena → ClamAV → promocion) y lo borra al final.
    const own = await processUploadThroughPipeline({
      tenantId: panatruck.id,
      tripId: testTrip.id,
      filename: `scan-event-${randomUUID()}.png`,
      mimeType: "image/png",
      buffer: pngFixture,
      targetKey: `tenants/panatruck-demo/trips/${testTrip.reference}/evidence/scan-event-${randomUUID()}.png`,
    });
    const ownAttachment = await db.fileAttachment.findUniqueOrThrow({
      where: { id: own.fileAttachmentId },
      include: { scanEvents: true },
    });
    try {
      expect(own.verdict).toBe("CLEAN");
      expect(ownAttachment.scanEvents.length).toBeGreaterThan(0);

      const attachments = await db.fileAttachment.findMany({
        where: { tenantId: panatruck.id },
        include: { scanEvents: true },
      });
      const scanned = attachments.filter((a) => a.scanEvents.length > 0);
      expect(scanned.length).toBeGreaterThan(0);

      for (const a of scanned) {
        expect(a.scanVerdict).toBeTruthy();
        expect(a.scannedAt).toBeTruthy();
        for (const event of a.scanEvents) {
          expect(["CLEAN", "INFECTED", "ERROR"]).toContain(event.verdict);
        }
      }
    } finally {
      await db.fileAttachment.delete({ where: { id: ownAttachment.id } });
      for (const key of [ownAttachment.quarantineKey, ownAttachment.objectKey]) {
        if (key) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});
      }
    }
  });

  test("FILE-SEC-E2E-009 pipeline creates FileAttachment for evidence upload", async () => {
    const beforeCount = await db.fileAttachment.count({
      where: { tenantId: panatruck.id },
    });

    expect(beforeCount).toBeGreaterThanOrEqual(0);

    const attachments = await db.fileAttachment.findMany({
      where: { tenantId: panatruck.id, status: "AVAILABLE" },
    });
    for (const a of attachments) {
      expect(a.objectKey).toBeTruthy();
      expect(a.promotedAt).toBeTruthy();
      expect(a.quarantineKey).toContain("quarantine/");
    }
  });

  test("FILE-SEC-E2E-010 user-uploaded legacy Document without FileAttachment is blocked", async ({ page }) => {
    if (!testTrip) test.skip();

    const legacyObjectKey = `tenants/panatruck-demo/trips/${testTrip.reference}/evidence/legacy-${randomUUID()}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: legacyObjectKey,
        Body: pngFixture,
        ContentType: "image/png",
      }),
    );

    const legacyDoc = await db.document.create({
      data: {
        tenantId: panatruck.id,
        customerAccountId: testTrip.customerAccountId,
        tripId: testTrip.id,
        filename: `legacy-${randomUUID()}.png`,
        mimeType: "image/png",
        sizeBytes: pngFixture.length,
        bucket: BUCKET,
        objectKey: legacyObjectKey,
        visibility: "CUSTOMER_VISIBLE",
        uploadedById: (await db.user.findFirst({ where: { email: users.driver[0] } }))!.id,
      },
    });

    await login(page, ...users.customer);
    const response = await page.request.get(
      `/api/t/panatruck-demo/documents/${legacyDoc.id}`,
    );
    expect(response.status()).toBe(403);

    await db.document.delete({ where: { id: legacyDoc.id } });
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: legacyObjectKey })).catch(() => {});
  });
});
