import { describe, expect, it } from "vitest";
import {
  evaluateDbGuard,
  evaluateHostConfirmation,
  formatDbTarget,
  isLocalDbHost,
  parseDbTarget,
  type DbGuardInput,
} from "./db-target";

const LOCAL_URL =
  "postgresql://nci:nci_local_password@localhost:5433/nci_logistics?schema=public";
const SUPABASE_POOLER =
  "postgresql://nci_app.khedaunvwzjduxmlufun:S3cr3t-Pa55@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require";
const SUPABASE_SESSION =
  "postgresql://nci_app.khedaunvwzjduxmlufun:S3cr3t-Pa55@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require";

function guard(overrides: Partial<DbGuardInput>) {
  return evaluateDbGuard({
    databaseUrl: LOCAL_URL,
    appEnv: "local",
    allowRemote: false,
    mode: "seed",
    ...overrides,
  });
}

describe("parseDbTarget", () => {
  it("extrae host, puerto y base sin credenciales", () => {
    const target = parseDbTarget(SUPABASE_POOLER);
    expect(target).toMatchObject({
      host: "aws-1-us-east-1.pooler.supabase.com",
      port: "6543",
      database: "postgres",
      socket: false,
      pgbouncer: true,
    });
    expect(JSON.stringify(target)).not.toContain("S3cr3t");
    expect(JSON.stringify(target)).not.toContain("nci_app");
  });

  it("usa el puerto 5432 por defecto y normaliza el host a minusculas", () => {
    expect(parseDbTarget("postgres://u:p@DB.Example.COM/app")).toMatchObject({
      host: "db.example.com",
      port: "5432",
    });
  });

  it("reconoce IPv6 y socket Unix", () => {
    expect(parseDbTarget("postgresql://u:p@[::1]:5433/db")?.host).toBe("[::1]");
    expect(
      parseDbTarget("postgresql:///db?host=/var/run/postgresql"),
    ).toMatchObject({
      host: "/var/run/postgresql",
      socket: true,
    });
  });

  it("devuelve null para valores no validos", () => {
    expect(parseDbTarget(undefined)).toBeNull();
    expect(parseDbTarget("")).toBeNull();
    expect(parseDbTarget("no es una url")).toBeNull();
    expect(parseDbTarget("mysql://u:p@localhost/db")).toBeNull();
  });
});

describe("isLocalDbHost", () => {
  it.each([
    "postgresql://u:p@localhost:5433/db",
    "postgresql://u:p@127.0.0.1:5433/db",
    "postgresql://u:p@[::1]:5433/db",
    "postgresql://u:p@postgres:5432/db",
    "postgresql://u:p@nci-lct-postgres:5432/db",
    "postgresql:///db?host=/tmp",
  ])("%s es local", (url) => {
    expect(isLocalDbHost(parseDbTarget(url)!)).toBe(true);
  });

  it.each([
    SUPABASE_POOLER,
    "postgresql://u:p@10.0.0.5:5432/db",
    "postgresql://u:p@localhost.evil.com:5432/db",
  ])("%s no es local", (url) => {
    expect(isLocalDbHost(parseDbTarget(url)!)).toBe(false);
  });
});

describe("formatDbTarget", () => {
  it("nunca incluye usuario ni contrasena", () => {
    const text = formatDbTarget(parseDbTarget(SUPABASE_SESSION));
    expect(text).toBe("aws-1-us-east-1.pooler.supabase.com:5432/postgres");
    expect(text).not.toMatch(/S3cr3t|nci_app/);
  });

  it("describe un destino desconocido", () => {
    expect(formatDbTarget(null)).toBe("desconocido");
  });
});

describe("evaluateDbGuard", () => {
  it("permite el perfil local contra Docker local", () => {
    expect(guard({}).ok).toBe(true);
  });

  it("bloquea el perfil local contra un host remoto (F4)", () => {
    const result = guard({ databaseUrl: SUPABASE_SESSION });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("aws-1-us-east-1.pooler.supabase.com");
    expect(result.reason).toContain("ALLOW_REMOTE_SEED");
    expect(result.reason).not.toMatch(/S3cr3t/);
  });

  it("ALLOW_REMOTE_SEED=true lo permite con un aviso", () => {
    const result = guard({ databaseUrl: SUPABASE_SESSION, allowRemote: true });
    expect(result.ok).toBe(true);
    expect(result.warning).toMatch(/credenciales demo/);
  });

  it("mantiene el flujo de staging: APP_ENV=staging contra Supabase", () => {
    const result = guard({ databaseUrl: SUPABASE_SESSION, appEnv: "staging" });
    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("deja el seed en produccion a la guarda propia del seed (ALLOW_PROD_SEED)", () => {
    expect(
      guard({ databaseUrl: SUPABASE_SESSION, appEnv: "production" }).ok,
    ).toBe(true);
  });

  it("rechaza una URL ausente o ilegible", () => {
    expect(guard({ databaseUrl: undefined }).ok).toBe(false);
    expect(guard({ databaseUrl: "basura" }).ok).toBe(false);
  });

  describe("demo", () => {
    it("bloquea local contra remoto y produccion", () => {
      expect(guard({ mode: "demo", databaseUrl: SUPABASE_SESSION }).ok).toBe(
        false,
      );
      expect(
        guard({
          mode: "demo",
          appEnv: "production",
          databaseUrl: SUPABASE_SESSION,
        }).ok,
      ).toBe(false);
    });

    it("permite staging y local en Docker", () => {
      expect(
        guard({
          mode: "demo",
          appEnv: "staging",
          databaseUrl: SUPABASE_SESSION,
        }).ok,
      ).toBe(true);
      expect(guard({ mode: "demo" }).ok).toBe(true);
    });
  });

  describe("reset (borra la base)", () => {
    it("bloquea cualquier host remoto, tambien en staging", () => {
      expect(
        guard({
          mode: "reset",
          appEnv: "staging",
          databaseUrl: SUPABASE_SESSION,
        }).ok,
      ).toBe(false);
      expect(
        guard({ mode: "reset", appEnv: "local", databaseUrl: SUPABASE_SESSION })
          .ok,
      ).toBe(false);
    });

    it("nunca corre en produccion, ni con ALLOW_REMOTE_SEED", () => {
      expect(
        guard({ mode: "reset", appEnv: "production", allowRemote: true }).ok,
      ).toBe(false);
      expect(
        guard({
          mode: "reset",
          appEnv: "production",
          databaseUrl: SUPABASE_SESSION,
          allowRemote: true,
        }).ok,
      ).toBe(false);
    });

    it("ALLOW_REMOTE_SEED no levanta el bloqueo de un reset remoto", () => {
      for (const appEnv of ["local", "staging"] as const) {
        expect(
          guard({
            mode: "reset",
            appEnv,
            databaseUrl: SUPABASE_SESSION,
            allowRemote: true,
          }).ok,
        ).toBe(false);
      }
    });

    it("permite Docker local", () => {
      expect(guard({ mode: "reset" }).ok).toBe(true);
    });
  });
});

describe("evaluateHostConfirmation", () => {
  const target = parseDbTarget(SUPABASE_SESSION);

  it("no pide confirmacion en un host local", () => {
    expect(
      evaluateHostConfirmation(parseDbTarget(LOCAL_URL), undefined).ok,
    ).toBe(true);
  });

  it("rechaza un host remoto sin CONFIRM_DB_HOST", () => {
    const result = evaluateHostConfirmation(target, undefined);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(
      "CONFIRM_DB_HOST=aws-1-us-east-1.pooler.supabase.com",
    );
  });

  it("rechaza un CONFIRM_DB_HOST distinto del host", () => {
    expect(evaluateHostConfirmation(target, "otro-host.example.com").ok).toBe(
      false,
    );
    expect(
      evaluateHostConfirmation(
        target,
        "aws-1-us-east-1.pooler.supabase.com:5432",
      ).ok,
    ).toBe(false);
  });

  it("acepta el host exacto, sin distinguir mayusculas", () => {
    expect(
      evaluateHostConfirmation(target, "aws-1-us-east-1.pooler.supabase.com")
        .ok,
    ).toBe(true);
    expect(
      evaluateHostConfirmation(target, " AWS-1-US-EAST-1.POOLER.SUPABASE.COM ")
        .ok,
    ).toBe(true);
  });

  it("rechaza si no hay destino", () => {
    expect(evaluateHostConfirmation(null, "x").ok).toBe(false);
  });
});
