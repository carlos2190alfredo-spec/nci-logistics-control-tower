import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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
    results.push({ name, status: "fail", detail: String(error) });
  }
}

check("Node.js version", () => {
  const version = process.version;
  const major = parseInt(version.slice(1));
  return {
    name: "Node.js version",
    status: major >= 20 ? "ok" : "warn",
    detail: version,
  };
});

check("pnpm available", () => {
  try {
    const version = execSync("pnpm --version", { encoding: "utf8" }).trim();
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
    return { name: "Docker running", status: "warn", detail: "Docker not running (needed for local dev)" };
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

check("DEEPSEEK_API_KEY status", () => ({
  name: "DEEPSEEK_API_KEY status",
  status: process.env.DEEPSEEK_API_KEY ? "ok" : "ok",
  detail: process.env.DEEPSEEK_API_KEY ? "configured (DeepSeek active)" : "not set (rules fallback active)",
}));

check("Prisma client generated", () => ({
  name: "Prisma client generated",
  status: existsSync("src/generated/prisma") ? "ok" : "fail",
  detail: existsSync("src/generated/prisma") ? "generated" : "Run `pnpm postinstall`",
}));

check("node_modules exists", () => ({
  name: "node_modules exists",
  status: existsSync("node_modules") ? "ok" : "fail",
  detail: existsSync("node_modules") ? "installed" : "Run `pnpm install`",
}));

check("Next.js config exists", () => ({
  name: "Next.js config exists",
  status: existsSync("next.config.ts") ? "ok" : "fail",
}));

check("TypeScript check", () => {
  try {
    execSync("pnpm typecheck", { stdio: "pipe" });
    return { name: "TypeScript check", status: "ok" };
  } catch {
    return { name: "TypeScript check", status: "fail", detail: "TypeScript errors found" };
  }
});

check("Lint check", () => {
  try {
    const output = execSync("pnpm lint 2>&1", { encoding: "utf8" });
    const errorMatch = output.match(/(\d+) error/);
    const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
    return {
      name: "Lint check",
      status: errors === 0 ? "ok" : "fail",
      detail: errors > 0 ? `${errors} lint errors` : "0 errors",
    };
  } catch {
    return { name: "Lint check", status: "fail", detail: "Lint failed" };
  }
});

check("Tests pass", () => {
  try {
    execSync("pnpm test", { stdio: "pipe" });
    return { name: "Tests pass", status: "ok" };
  } catch {
    return { name: "Tests pass", status: "fail", detail: "Some tests failed" };
  }
});

check("Security checks", () => {
  try {
    execSync("npx tsx scripts/security-check.ts", { stdio: "pipe" });
    return { name: "Security checks", status: "ok" };
  } catch {
    return { name: "Security checks", status: "fail", detail: "Security check failures" };
  }
});

check("public/sw.js exists", () => ({
  name: "public/sw.js exists",
  status: existsSync("public/sw.js") ? "ok" : "warn",
  detail: existsSync("public/sw.js") ? "present" : "Service worker missing",
}));

check("Migration files present", () => {
  try {
    const migrations = execSync("ls prisma/migrations/ | wc -l", { encoding: "utf8" }).trim();
    return {
      name: "Migration files present",
      status: parseInt(migrations) > 0 ? "ok" : "warn",
      detail: `${migrations} migration(s)`,
    };
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
