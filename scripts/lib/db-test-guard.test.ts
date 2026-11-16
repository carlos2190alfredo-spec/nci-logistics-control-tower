import { describe, expect, it } from "vitest";
import { evaluateTestDbGuard } from "./db-test-guard";

const LOCAL = "postgresql://user:secret@localhost:5433/nci_logistics?schema=public";

describe("evaluateTestDbGuard", () => {
  it("acepta la base local de Docker con APP_ENV=local", () => {
    const result = evaluateTestDbGuard({ databaseUrl: LOCAL, appEnv: "local" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.target).toMatchObject({ host: "localhost", port: "5433", database: "nci_logistics" });
  });

  it.each(["127.0.0.1", "[::1]", "nci-lct-postgres", "postgres"])("acepta el host local %s", (host) => {
    expect(evaluateTestDbGuard({ databaseUrl: `postgresql://u:p@${host}:5433/nci_logistics`, appEnv: "local" }).ok).toBe(true);
  });

  it("bloquea una URL ausente o ilegible", () => {
    expect(evaluateTestDbGuard({ databaseUrl: undefined, appEnv: "local" }).ok).toBe(false);
    expect(evaluateTestDbGuard({ databaseUrl: "no es una url", appEnv: "local" }).ok).toBe(false);
    expect(evaluateTestDbGuard({ databaseUrl: "mysql://u:p@localhost/db", appEnv: "local" }).ok).toBe(false);
  });

  it("bloquea un host remoto aunque el perfil sea local (Supabase directo y pooler)", () => {
    const direct = evaluateTestDbGuard({ databaseUrl: "postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres", appEnv: "local" });
    const pooler = evaluateTestDbGuard({
      databaseUrl: "postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
      appEnv: "local",
    });
    expect(direct.ok).toBe(false);
    expect(pooler.ok).toBe(false);
  });

  it("bloquea APP_ENV distinto de local aunque el host sea local (túnel a staging)", () => {
    expect(evaluateTestDbGuard({ databaseUrl: LOCAL, appEnv: "staging" }).ok).toBe(false);
    expect(evaluateTestDbGuard({ databaseUrl: LOCAL, appEnv: "production" }).ok).toBe(false);
  });

  it("bloquea un pooler local", () => {
    const result = evaluateTestDbGuard({ databaseUrl: `${LOCAL}&pgbouncer=true`, appEnv: "local" });
    expect(result.ok).toBe(false);
  });

  it.each(["prod", "production", "nci_prod", "staging", "nci-staging", "live"])("bloquea la base %s", (name) => {
    const result = evaluateTestDbGuard({ databaseUrl: `postgresql://u:p@localhost:5433/${name}`, appEnv: "local" });
    expect(result.ok).toBe(false);
  });

  it("no bloquea nombres que solo contienen esas letras dentro de otra palabra", () => {
    expect(evaluateTestDbGuard({ databaseUrl: "postgresql://u:p@localhost:5433/products_dev", appEnv: "local" }).ok).toBe(true);
    expect(evaluateTestDbGuard({ databaseUrl: "postgresql://u:p@localhost:5433/delivery", appEnv: "local" }).ok).toBe(true);
  });

  it("el motivo nunca incluye usuario ni contraseña", () => {
    const result = evaluateTestDbGuard({ databaseUrl: "postgresql://admin:SuperSecreta@db.example.com:5432/app", appEnv: "local" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toContain("SuperSecreta");
      expect(result.reason).not.toContain("admin");
    }
  });
});
