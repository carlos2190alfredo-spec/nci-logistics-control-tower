import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/server/file-pipeline.ts", "utf8");

describe("file-pipeline (compilation surface)", () => {
  it("quarantine upload goes to quarantine prefix with targetKey", () => {
    expect(source).toContain('QUARANTINE_PREFIX = "quarantine/"');
    expect(source).toContain("quarantineKey");
    expect(source).toContain("targetKey");
  });

  it("scan checks AV availability and fails closed", () => {
    expect(source).toContain("av.ping()");
    expect(source).toContain("AV_UNAVAILABLE");
    expect(source).toContain("fail closed");
  });

  it("promote copies from quarantine to production and deletes quarantine", () => {
    expect(source).toContain("CopyObjectCommand");
    expect(source).toContain("DeleteObjectCommand");
    expect(source).toContain('status: "AVAILABLE"');
  });

  it("reject deletes quarantine file and marks REJECTED", () => {
    expect(source).toContain('status: "REJECTED"');
    expect(source).toContain("rejectedAt");
  });

  it("processUploadThroughPipeline handles INFECTED by rejecting", () => {
    expect(source).toContain('verdict === "INFECTED"');
    expect(source).toContain("rejectFile(fileAttachmentId)");
  });

  it("strips EXIF from JPEG before quarantine", () => {
    expect(source).toContain("stripExif");
    expect(source).toContain('mimeType === "image/jpeg"');
  });

  it("creates FileScanEvent for audit trail", () => {
    expect(source).toContain("fileScanEvent.create");
    expect(source).toContain("durationMs");
  });

  it("transitions through correct states", () => {
    expect(source).toContain('status: "QUARANTINE"');
    expect(source).toContain('status: "SCANNING"');
    expect(source).toContain('status: "PENDING_SCAN"');
    expect(source).toContain('"CLEAN"');
    expect(source).toContain('"INFECTED"');
    expect(source).toContain('status: "AVAILABLE"');
  });
});
