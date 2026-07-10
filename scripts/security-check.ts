/**
 * Verificaciones estáticas locales. No inventa cobertura ni ejecuta escáneres
 * externos: cada regla se prueba con grep + comprobaciones deterministas.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

type Check = { name: string; run: () => { ok: boolean; detail?: string } };

function grepMissing(patterns: string[]): string[] {
  const args = [
    "grep",
    "-RIn",
    "--exclude-dir=generated",
    "--exclude-dir=node_modules",
    "--exclude-dir=.next",
    "--exclude=security-check.ts",
    ...patterns.flatMap((p) => ["-e", p]),
    "--include=*.ts",
    "--include=*.tsx",
    "--include=*.js",
    "src",
    "prisma",
    "public",
  ];
  try {
    const output = execSync(args.join(" "), { encoding: "utf8" });
    return output.trim() ? output.trim().split("\n") : [];
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string };
    if (err.status === 1) return [];
    return [(err.stdout ?? "").toString().trim()].filter(Boolean);
  }
}

const checks: Check[] = [
  {
    name: "sin queryRawUnsafe / $executeRawUnsafe",
    run: () => {
      const hits = grepMissing(["queryRawUnsafe", "\\$executeRawUnsafe"]);
      return { ok: hits.length === 0, detail: hits.slice(0, 5).join("\n") };
    },
  },
  {
    name: "sin dangerouslySetInnerHTML",
    run: () => {
      const hits = grepMissing(["dangerouslySetInnerHTML"]);
      return { ok: hits.length === 0, detail: hits.slice(0, 5).join("\n") };
    },
  },
  {
    name: "sin .env versionados",
    run: () => {
      const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n");
      const risky = tracked.filter((path) => /\.env(?!\.example$)/.test(path));
      return { ok: risky.length === 0, detail: risky.join("\n") };
    },
  },
  {
    name: "sin secretos aparentes en código versionado",
    run: () => {
      const tracked = execSync("git ls-files -- 'src' 'scripts' 'prisma'", { encoding: "utf8" }).split("\n").filter(Boolean);
      const patterns = [/AKIA[0-9A-Z]{16}/, /BEGIN\s+(RSA|DSA|EC)\s+PRIVATE\s+KEY/, /ghp_[A-Za-z0-9]{20,}/];
      const findings: string[] = [];
      for (const file of tracked) {
        try {
          const content = readFileSync(file, "utf8");
          for (const pattern of patterns) {
            if (pattern.test(content)) findings.push(`${file}: ${pattern.source}`);
          }
        } catch {
          // ignore binary
        }
      }
      return { ok: findings.length === 0, detail: findings.join("\n") };
    },
  },
  {
    name: "next.config.ts define headers de seguridad",
    run: () => {
      const source = readFileSync("next.config.ts", "utf8");
      const required = ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"];
      const missing = required.filter((header) => !source.includes(header));
      return { ok: missing.length === 0, detail: missing.length ? `Faltan: ${missing.join(", ")}` : "" };
    },
  },
  {
    name: "cookies de sesion configuran httpOnly y sameSite",
    run: () => {
      const source = readFileSync("src/lib/server/auth.ts", "utf8");
      const ok = source.includes("httpOnly: true") && source.includes('sameSite: "lax"');
      return { ok, detail: ok ? "" : "auth.ts no configura cookies seguras." };
    },
  },
  {
    name: "SW no cachea rutas privadas (/api /platform /t)",
    run: () => {
      const source = readFileSync("public/sw.js", "utf8");
      const ok = source.includes("PRIVATE_PATH_PREFIXES") && source.includes("/api/");
      return { ok, detail: ok ? "" : "public/sw.js parece cachear rutas privadas." };
    },
  },
  {
    name: "endpoints mutables validan Origin",
    run: () => {
      const source = readFileSync("src/app/api/t/[tenantSlug]/driver/sync/route.ts", "utf8");
      const ok = source.includes("verifyMutationOrigin");
      return { ok, detail: ok ? "" : "sync/route.ts no valida Origin." };
    },
  },
  {
    name: "storage valida magic bytes",
    run: () => {
      const source = readFileSync("src/lib/server/storage.ts", "utf8");
      const ok = source.includes("detectMimeFromMagicBytes");
      return { ok, detail: ok ? "" : "storage.ts sin validación de magic bytes." };
    },
  },
  {
    name: "TS: sin errores de tipos",
    run: () => {
      try {
        execSync("pnpm typecheck", { stdio: "pipe" });
        return { ok: true };
      } catch (error) {
        const err = error as { stdout?: Buffer; stderr?: Buffer };
        return { ok: false, detail: `${err.stderr?.toString() ?? err.stdout?.toString() ?? "typecheck falló"}`.slice(0, 400) };
      }
    },
  },
];

let failures = 0;
for (const check of checks) {
  const result = check.run();
  console.log(`${result.ok ? "PASS" : "FAIL"} — ${check.name}`);
  if (!result.ok) {
    failures += 1;
    if (result.detail) console.log(`    ${result.detail.split("\n").slice(0, 4).join("\n    ")}`);
  }
}
if (failures > 0) {
  console.error(`${failures} verificación(es) de seguridad fallaron.`);
  process.exit(1);
}
console.log("Todas las verificaciones de seguridad locales pasaron.");
