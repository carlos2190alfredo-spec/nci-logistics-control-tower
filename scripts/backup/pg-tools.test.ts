import { describe, expect, it } from "vitest";
import {
  DOCKER_PG_IMAGE,
  buildPgCommand,
  parsePgConnection,
  pgEnv,
  redactSecrets,
  resolveToolsMode,
  type PgConnection,
} from "./pg-tools";

const PASSWORD = "p@ss/w0rd:con#chars";
const SUPABASE_SESSION = `postgresql://nci_app.khedaunvwzjduxmlufun:${encodeURIComponent(PASSWORD)}@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;

function connection(overrides: Partial<PgConnection> = {}): PgConnection {
  return {
    ...parsePgConnection(SUPABASE_SESSION, "BACKUP_DATABASE_URL"),
    ...overrides,
  };
}

describe("parsePgConnection", () => {
  it("descompone la URL y decodifica la contrasena", () => {
    expect(parsePgConnection(SUPABASE_SESSION, "BACKUP_DATABASE_URL")).toEqual({
      host: "aws-1-us-east-1.pooler.supabase.com",
      port: "5432",
      user: "nci_app.khedaunvwzjduxmlufun",
      password: PASSWORD,
      database: "postgres",
      sslmode: "require",
    });
  });

  it("exige TLS fuera de local y lo deja opcional en local", () => {
    expect(
      parsePgConnection("postgresql://u:p@db.example.com:5432/app", "X")
        .sslmode,
    ).toBe("require");
    expect(
      parsePgConnection("postgresql://u:p@localhost:5433/app", "X").sslmode,
    ).toBe("prefer");
  });

  it("rechaza el pooler en modo transaccion (pg_dump necesita sesion)", () => {
    expect(() =>
      parsePgConnection(
        "postgresql://u:p@h.supabase.com:6543/postgres",
        "BACKUP_DATABASE_URL",
      ),
    ).toThrow(/modo transaccion/);
    expect(() =>
      parsePgConnection(
        "postgresql://u:p@h.supabase.com:5432/postgres?pgbouncer=true",
        "X",
      ),
    ).toThrow(/modo transaccion/);
  });

  it("nunca incluye la URL ni la contrasena en los errores", () => {
    for (const bad of [
      "no-es-url",
      "postgresql://:supersecreta@host:5432/db",
      "mysql://u:supersecreta@host/db",
    ]) {
      try {
        parsePgConnection(bad, "BACKUP_DATABASE_URL");
        expect.unreachable();
      } catch (error) {
        expect((error as Error).message).not.toContain("supersecreta");
        expect((error as Error).message).not.toContain(bad);
        expect((error as Error).message).toContain("BACKUP_DATABASE_URL");
      }
    }
  });
});

describe("resolveToolsMode", () => {
  it("usa los binarios locales cuando estan pg_dump y psql", () => {
    expect(resolveToolsMode(undefined, () => true)).toBe("local");
  });

  it("cae a Docker si falta alguno", () => {
    expect(resolveToolsMode(undefined, () => false)).toBe("docker");
    expect(resolveToolsMode(undefined, (tool) => tool === "pg_dump")).toBe(
      "docker",
    );
  });

  it("respeta BACKUP_PG_TOOLS y rechaza valores desconocidos", () => {
    expect(resolveToolsMode("docker", () => true)).toBe("docker");
    expect(resolveToolsMode("local", () => false)).toBe("local");
    expect(() => resolveToolsMode("podman", () => true)).toThrow(
      /BACKUP_PG_TOOLS/,
    );
  });
});

describe("pgEnv", () => {
  it("mapea la conexion a variables PG*", () => {
    expect(pgEnv(connection(), "local")).toMatchObject({
      PGHOST: "aws-1-us-east-1.pooler.supabase.com",
      PGPORT: "5432",
      PGUSER: "nci_app.khedaunvwzjduxmlufun",
      PGPASSWORD: PASSWORD,
      PGDATABASE: "postgres",
      PGSSLMODE: "require",
    });
  });

  it("dentro de Docker, localhost apunta al anfitrion", () => {
    expect(pgEnv(connection({ host: "localhost" }), "docker").PGHOST).toBe(
      "host.docker.internal",
    );
    expect(pgEnv(connection({ host: "[::1]" }), "docker").PGHOST).toBe(
      "host.docker.internal",
    );
    expect(pgEnv(connection({ host: "localhost" }), "local").PGHOST).toBe(
      "localhost",
    );
  });

  it("quita los corchetes de un host IPv6", () => {
    expect(pgEnv(connection({ host: "[::1]" }), "local").PGHOST).toBe("::1");
  });
});

describe("buildPgCommand", () => {
  const dumpArgs = ["--no-owner", "--schema=public"];

  it("modo local: ejecuta la herramienta con la conexion solo en el entorno", () => {
    const command = buildPgCommand("pg_dump", dumpArgs, connection(), "local");
    expect(command.command).toBe("pg_dump");
    expect(command.args).toEqual(dumpArgs);
    expect(command.env.PGPASSWORD).toBe(PASSWORD);
  });

  it("modo docker: docker run con la imagen fijada y variables PG* sin valor en la linea de comandos", () => {
    const command = buildPgCommand("pg_dump", dumpArgs, connection(), "docker");
    expect(command.command).toBe("docker");
    expect(command.args.slice(0, 3)).toEqual(["run", "--rm", "-i"]);
    expect(command.args).toContain(DOCKER_PG_IMAGE);
    const tail = command.args.slice(command.args.indexOf(DOCKER_PG_IMAGE));
    expect(tail).toEqual([DOCKER_PG_IMAGE, "pg_dump", ...dumpArgs]);
    expect(command.env.PGPASSWORD).toBe(PASSWORD);
    // Cada -e lleva solo el nombre de la variable.
    const envNames = command.args.flatMap((arg, i) =>
      command.args[i - 1] === "-e" ? [arg] : [],
    );
    expect(envNames).toEqual(
      expect.arrayContaining([
        "PGHOST",
        "PGPORT",
        "PGUSER",
        "PGPASSWORD",
        "PGDATABASE",
        "PGSSLMODE",
      ]),
    );
    expect(envNames.every((name) => /^PG[A-Z_]+$/.test(name))).toBe(true);
  });

  it.each(["local", "docker"] as const)(
    "modo %s: ni la contrasena ni el usuario ni el host van en los argumentos",
    (mode) => {
      const command = buildPgCommand(
        "psql",
        ["-c", "SELECT 1"],
        connection(),
        mode,
      );
      const joined = command.args.join(" ");
      expect(joined).not.toContain(PASSWORD);
      expect(joined).not.toContain(encodeURIComponent(PASSWORD));
      expect(joined).not.toContain("nci_app");
      expect(joined).not.toContain("supabase.com");
      expect(joined).not.toMatch(/postgres(ql)?:\/\//);
    },
  );

  it("registra la contrasena como secreto a redactar", () => {
    expect(buildPgCommand("psql", [], connection(), "local").secrets).toEqual([
      PASSWORD,
    ]);
  });
});

describe("redactSecrets", () => {
  it("reemplaza cada aparicion del secreto", () => {
    expect(
      redactSecrets(`fallo con ${PASSWORD} y otra vez ${PASSWORD}`, [PASSWORD]),
    ).toBe("fallo con *** y otra vez ***");
  });

  it("ignora secretos vacios", () => {
    expect(redactSecrets("texto", [""])).toBe("texto");
  });
});
