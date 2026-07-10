import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/server/antivirus.ts", "utf8");

describe("antivirus provider (compilation surface)", () => {
  it("exports AntivirusProvider interface with scan and ping", () => {
    expect(source).toContain("scan(buffer: Buffer): Promise<ScanResult>");
    expect(source).toContain("ping(): Promise<boolean>");
  });

  it("ClamAVProvider implements fail-closed on scan error", () => {
    expect(source).toContain('verdict: "ERROR"');
    expect(source).toContain("clamav scan failed");
  });

  it("uses INSTREAM protocol for scanning", () => {
    expect(source).toContain("zINSTREAM");
  });

  it("uses PING command for health check", () => {
    expect(source).toContain("zPING");
    expect(source).toContain("PONG");
  });

  it("respects timeout configuration", () => {
    expect(source).toContain("CLAMAV_TIMEOUT_MS");
    expect(source).toContain("socket.setTimeout");
  });

  it("allows provider injection for testing", () => {
    expect(source).toContain("setAntivirusProvider");
    expect(source).toContain("getAntivirusProvider");
  });
});
