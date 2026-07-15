import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

interface DiagResult {
  name: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
}

const results: DiagResult[] = [];

function check(name: string, fn: () => DiagResult) {
  try {
    results.push(fn());
  } catch (error) {
    results.push({ name, status: "fail", detail: String(error).slice(0, 200) });
  }
}

check("Node.js version", () => {
  const version = process.version;
  const major = parseInt(version.slice(1));
  return { name: "Node.js version", status: major >= 20 ? "ok" : "warn", detail: version };
});

check("pnpm available", () => {
  try {
    const version = execSync("pnpm --version", { encoding: "utf8", stdio: "pipe" }).trim();
    return { name: "pnpm available", status: "ok", detail: `v${version}` };
  } catch {
    return { name: "pnpm available", status: "fail", detail: "pnpm not found" };
  }
});

check("Docker running", () => {
  try {
    execSync("docker info", { encoding: "utf8", stdio: "pipe" });
    return { name: "Docker running", status: "ok" };
  } catch {
    return { name: "Docker running", status: "warn", detail: "Docker not running" };
  }
});

check(".env exists", () => ({
  name: ".env exists",
  status: existsSync(".env") || existsSync(".env.local") ? "ok" : "warn",
  detail: existsSync(".env") ? ".env" : existsSync(".env.local") ? ".env.local" : "No .env file found",
}));

check("DATABASE_URL set", () => ({
  name: "DATABASE_URL set",
  status: process.env.DATABASE_URL ? "ok" : "fail",
  detail: process.env.DATABASE_URL ? "configured" : "Missing DATABASE_URL",
}));

check("SESSION_SECRET set", () => ({
  name: "SESSION_SECRET set",
  status: process.env.SESSION_SECRET ? "ok" : "fail",
  detail: process.env.SESSION_SECRET ? "configured" : "Missing SESSION_SECRET",
}));

check("MFA_ENCRYPTION_KEY set", () => ({
  name: "MFA_ENCRYPTION_KEY set",
  status: process.env.MFA_ENCRYPTION_KEY ? "ok" : "warn",
  detail: process.env.MFA_ENCRYPTION_KEY ? "configured" : "Missing (MFA will not work)",
}));

check("PostgreSQL connectivity", () => {
  try {
    execSync('npx prisma db execute --stdin <<< "SELECT 1"', { stdio: "pipe", timeout: 10000 });
    return { name: "PostgreSQL connectivity", status: "ok" };
  } catch {
    try {
      const url = process.env.DATABASE_URL ?? "";
      const match = url.match(/:(\d+)\//);
      const port = match?.[1] ?? "5433";
      execSync(`nc -z localhost ${port}`, { stdio: "pipe", timeout: 5000 });
      return { name: "PostgreSQL connectivity", status: "ok", detail: `port ${port} open` };
    } catch {
      return { name: "PostgreSQL connectivity", status: "fail", detail: "Cannot reach PostgreSQL" };
    }
  }
});

check("MinIO connectivity", () => {
  try {
    const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
    execSync(`curl -sf --max-time 3 ${endpoint}/minio/health/live`, { stdio: "pipe" });
    return { name: "MinIO connectivity", status: "ok" };
  } catch {
    return { name: "MinIO connectivity", status: "warn", detail: "MinIO not reachable" };
  }
});

check("ClamAV connectivity", () => {
  try {
    execSync("nc -z 127.0.0.1 3310", { stdio: "pipe", timeout: 3000 });
    return { name: "ClamAV connectivity", status: "ok" };
  } catch {
    return { name: "ClamAV connectivity", status: "warn", detail: "ClamAV not reachable (port 3310)" };
  }
});

check("Mailpit connectivity", () => {
  try {
    execSync("curl -sf --max-time 3 http://localhost:8025/api/v1/messages", { stdio: "pipe" });
    return { name: "Mailpit connectivity", status: "ok" };
  } catch {
    return { name: "Mailpit connectivity", status: "warn", detail: "Mailpit not reachable" };
  }
});

check("DEEPSEEK_API_KEY status", () => ({
  name: "DEEPSEEK_API_KEY status",
  status: "ok",
  detail: process.env.DEEPSEEK_API_KEY ? "configured (DeepSeek active)" : "not set (rules fallback active)",
}));

check("Google Maps status", () => ({
  name: "Google Maps status",
  status: "ok",
  detail: `mode=${process.env.GOOGLE_MAPS_ROUTES_MODE ?? "disabled"}, key=${process.env.GOOGLE_MAPS_API_KEY ? "set" : "not set"}`,
}));

check("Prisma client generated", () => ({
  name: "Prisma client generated",
  status: existsSync("src/generated/prisma") ? "ok" : "fail",
  detail: existsSync("src/generated/prisma") ? "generated" : "Run `pnpm postinstall`",
}));

check("Prisma migrations status", () => {
  try {
    const out = execSync("npx prisma migrate status 2>&1", { encoding: "utf8", timeout: 15000 });
    const pending = out.includes("have not yet been applied");
    return {
      name: "Prisma migrations status",
      status: pending ? "fail" : "ok",
      detail: pending ? "Pending migrations" : "all applied",
    };
  } catch {
    return { name: "Prisma migrations status", status: "warn", detail: "Cannot check (DB may be down)" };
  }
});

check("node_modules exists", () => ({
  name: "node_modules exists",
  status: existsSync("node_modules") ? "ok" : "fail",
  detail: existsSync("node_modules") ? "installed" : "Run `pnpm install`",
}));

check("Next.js config exists", () => ({
  name: "Next.js config exists",
  status: existsSync("next.config.ts") ? "ok" : "fail",
}));

check("public/sw.js exists (PWA)", () => ({
  name: "public/sw.js exists (PWA)",
  status: existsSync("public/sw.js") ? "ok" : "warn",
  detail: existsSync("public/sw.js") ? "present" : "Service worker missing",
}));

check("public/manifest.webmanifest exists (PWA)", () => ({
  name: "public/manifest.webmanifest exists (PWA)",
  status: existsSync("public/manifest.webmanifest") ? "ok" : "warn",
}));

check("Backup scripts present", () => ({
  name: "Backup scripts present",
  status: existsSync("scripts/backup/backup-all.ts") && existsSync("scripts/backup/crypto.ts") ? "ok" : "warn",
}));

check("Demo tenant exists", () => {
  try {
    const seed = readFileSync("prisma/seed.ts", "utf8");
    const hasDemoTenants = seed.includes("isDemo: true") && seed.includes("panatruck-demo");
    return {
      name: "Demo tenant exists",
      status: hasDemoTenants ? "ok" : "warn",
      detail: hasDemoTenants ? "panatruck-demo + translogistica-demo in seed" : "No demo tenants in seed",
    };
  } catch {
    return { name: "Demo tenant exists", status: "warn", detail: "Cannot read seed.ts" };
  }
});

check("Key routes exist", () => {
  const requiredPages = [
    "src/app/page.tsx",
    "src/app/login/page.tsx",
    "src/app/platform/tenants/page.tsx",
    "src/app/t/[tenantSlug]/page.tsx",
    "src/app/t/[tenantSlug]/admin/page.tsx",
    "src/app/t/[tenantSlug]/admin/operations-copilot/page.tsx",
    "src/app/t/[tenantSlug]/driver/page.tsx",
    "src/app/t/[tenantSlug]/portal/page.tsx",
    "src/app/t/[tenantSlug]/settings/page.tsx",
  ];
  const missing = requiredPages.filter((p) => !existsSync(p));
  return {
    name: "Key routes exist",
    status: missing.length === 0 ? "ok" : "fail",
    detail: missing.length > 0 ? `Missing: ${missing.join(", ")}` : `${requiredPages.length} routes verified`,
  };
});

check("TypeScript check", () => {
  try {
    execSync("pnpm typecheck", { stdio: "pipe", timeout: 120000 });
    return { name: "TypeScript check", status: "ok" };
  } catch {
    return { name: "TypeScript check", status: "fail", detail: "TypeScript errors found" };
  }
});

check("Lint check (0 errors)", () => {
  try {
    const output = execSync("pnpm lint 2>&1", { encoding: "utf8", timeout: 120000 });
    const errorMatch = output.match(/(\d+) error/);
    const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
    return {
      name: "Lint check (0 errors)",
      status: errors === 0 ? "ok" : "fail",
      detail: `${errors} errors`,
    };
  } catch {
    return { name: "Lint check (0 errors)", status: "fail", detail: "Lint failed" };
  }
});

check("Tests pass", () => {
  try {
    const out = execSync("pnpm test 2>&1", { encoding: "utf8", timeout: 120000 });
    const match = out.match(/(\d+) passed/);
    return { name: "Tests pass", status: "ok", detail: match ? `${match[1]} passed` : "all passed" };
  } catch {
    return { name: "Tests pass", status: "fail", detail: "Some tests failed" };
  }
});

check("Security checks pass", () => {
  try {
    const out = execSync("npx tsx scripts/security-check.ts 2>&1", { encoding: "utf8", timeout: 180000 });
    const pass = out.includes("Todas las verificaciones");
    return { name: "Security checks pass", status: pass ? "ok" : "fail" };
  } catch {
    return { name: "Security checks pass", status: "fail", detail: "Security check failures" };
  }
});

check("Migration files present", () => {
  try {
    const count = execSync("ls -d prisma/migrations/*/ | wc -l", { encoding: "utf8" }).trim();
    return { name: "Migration files present", status: "ok", detail: `${count} migration(s)` };
  } catch {
    return { name: "Migration files present", status: "warn" };
  }
});

console.log("\n=== App Doctor ===\n");
let failures = 0;
let warnings = 0;
for (const r of results) {
  const icon = r.status === "ok" ? "PASS" : r.status === "warn" ? "WARN" : "FAIL";
  console.log(`${icon}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  if (r.status === "fail") failures++;
  if (r.status === "warn") warnings++;
}

console.log(`\n${results.length} checks: ${results.length - failures - warnings} ok, ${warnings} warnings, ${failures} failures`);
if (failures > 0) process.exit(1);
