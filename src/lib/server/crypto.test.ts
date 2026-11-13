import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hashToken,
  keyedHash,
  MIN_SESSION_METADATA_KEY_LENGTH,
} from "./crypto";

const KEY = "k".repeat(64);

afterEach(() => {
  vi.unstubAllEnvs();
});

function setEnv(
  appEnv: string | undefined,
  key: string | undefined,
  nodeEnv = "production",
) {
  vi.stubEnv("APP_ENV", appEnv);
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("SESSION_METADATA_KEY", key);
}

describe("keyedHash", () => {
  it("usa HMAC-SHA256 con la clave cuando existe", () => {
    setEnv("staging", KEY);
    const expected = createHmac("sha256", KEY)
      .update("session-ip:1.2.3.4")
      .digest("hex");
    expect(keyedHash("1.2.3.4", "session-ip")).toBe(expected);
  });

  it("separa los hashes por proposito", () => {
    setEnv("production", KEY);
    expect(keyedHash("1.2.3.4", "session-ip")).not.toBe(
      keyedHash("1.2.3.4", "reset-ip"),
    );
  });

  it("en local sin clave conserva el SHA-256 simple", () => {
    setEnv("local", undefined, "development");
    expect(keyedHash("1.2.3.4", "session-ip")).toBe(
      hashToken("session-ip:1.2.3.4"),
    );
  });

  it("en local con clave usa HMAC", () => {
    setEnv("local", KEY, "development");
    expect(keyedHash("1.2.3.4", "session-ip")).not.toBe(
      hashToken("session-ip:1.2.3.4"),
    );
  });

  it.each(["staging", "production"])(
    "lanza en %s sin clave en vez de caer al SHA-256 simple",
    (appEnv) => {
      setEnv(appEnv, undefined);
      expect(() => keyedHash("1.2.3.4", "session-ip")).toThrow(
        /SESSION_METADATA_KEY/,
      );
    },
  );

  it("lanza en staging con clave vacia o demasiado corta", () => {
    setEnv("staging", "");
    expect(() => keyedHash("a@b.com", "reset-email")).toThrow(
      /SESSION_METADATA_KEY/,
    );
    setEnv("staging", "k".repeat(MIN_SESSION_METADATA_KEY_LENGTH - 1));
    expect(() => keyedHash("a@b.com", "reset-email")).toThrow(
      /SESSION_METADATA_KEY/,
    );
  });

  it("sin APP_ENV bajo NODE_ENV=production tampoco cae al SHA-256 simple", () => {
    setEnv(undefined, undefined, "production");
    expect(() => keyedHash("1.2.3.4", "session-ip")).toThrow(
      /SESSION_METADATA_KEY/,
    );
  });

  it("no revela la clave en el mensaje de error", () => {
    setEnv("staging", "corta");
    try {
      keyedHash("1.2.3.4", "session-ip");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("corta");
    }
  });
});
