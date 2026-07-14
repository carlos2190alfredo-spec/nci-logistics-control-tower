import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

interface ReadinessCheck {
  category: string;
  name: string;
  status: "ready" | "not_ready" | "optional";
  detail?: string;
}

const checks: ReadinessCheck[] = [];

function add(category: string, name: string, fn: () => Omit<ReadinessCheck, "category" | "name">) {
  try {
    checks.push({ category, name, ...fn() });
  } catch (error) {
    checks.push({ category, name, status: "not_ready", detail: String(error) });
  }
}

add("Build", "TypeScript compiles", () => {
  try {
    execSync("pnpm typecheck", { stdio: "pipe" });
    return { status: "ready" };
  } catch {
    return { status: "not_ready", detail: "TypeScript errors" };
  }
});

add("Build", "Lint: 0 errors", () => {
  try {
    const out = execSync("pnpm lint 2>&1", { encoding: "utf8" });
    const errors = out.match(/(\d+) error/)?.[1] ?? "0";
    return { status: parseInt(errors) === 0 ? "ready" : "not_ready", detail: `${errors} errors` };
  } catch {
    return { status: "not_ready" };
  }
});

add("Build", "Tests pass", () => {
  try {
    execSync("pnpm test", { stdio: "pipe" });
    return { status: "ready" };
  } catch {
    return { status: "not_ready", detail: "Test failures" };
  }
});

add("Build", "Next.js build succeeds", () => {
  try {
    execSync("pnpm build", { stdio: "pipe", timeout: 300000 });
    return { status: "ready" };
  } catch {
    return { status: "not_ready", detail: "Build failed" };
  }
});

add("Security", "Security checks pass", () => {
  try {
    execSync("npx tsx scripts/security-check.ts", { stdio: "pipe" });
    return { status: "ready" };
  } catch {
    return { status: "not_ready", detail: "Security check failures" };
  }
});

add("Security", "No .env in git", () => {
  const tracked = execSync("git ls-files", { encoding: "utf8" });
  const risky = tracked.split("\n").filter((f) => /\.env(?!\.example)$/.test(f));
  return { status: risky.length === 0 ? "ready" : "not_ready", detail: risky.join(", ") || undefined };
});

add("Security", "Security headers configured", () => {
  const source = readFileSync("next.config.ts", "utf8");
  const ok = source.includes("Content-Security-Policy");
  return { status: ok ? "ready" : "not_ready" };
});

add("Data", "Prisma client generated", () => ({
  status: existsSync("src/generated/prisma") ? "ready" : "not_ready",
}));

add("Data", "Migrations up to date", () => {
  try {
    const out = execSync("npx prisma migrate status 2>&1", { encoding: "utf8" });
    const pending = out.includes("have not yet been applied");
    return { status: pending ? "not_ready" : "ready", detail: pending ? "Pending migrations" : undefined };
  } catch {
    return { status: "not_ready", detail: "Cannot check migration status" };
  }
});

add("Config", ".env or .env.local exists", () => ({
  status: existsSync(".env") || existsSync(".env.local") ? "ready" : "not_ready",
}));

add("Config", "DATABASE_URL set", () => ({
  status: process.env.DATABASE_URL ? "ready" : "not_ready",
}));

add("Config", "SESSION_SECRET set", () => ({
  status: process.env.SESSION_SECRET ? "ready" : "not_ready",
}));

add("AI", "DEEPSEEK_API_KEY", () => ({
  status: process.env.DEEPSEEK_API_KEY ? "ready" : "optional",
  detail: process.env.DEEPSEEK_API_KEY ? "DeepSeek active" : "Rules fallback (optional)",
}));

add("Files", "package.json exists", () => ({
  status: existsSync("package.json") ? "ready" : "not_ready",
}));

add("Files", "next.config.ts exists", () => ({
  status: existsSync("next.config.ts") ? "ready" : "not_ready",
}));

add("Files", "Service worker present", () => ({
  status: existsSync("public/sw.js") ? "ready" : "not_ready",
}));

add("Git", "Working tree clean", () => {
  const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
  return { status: status === "" ? "ready" : "not_ready", detail: status ? `${status.split("\n").length} changes` : undefined };
});

console.log("\n=== Readiness Check ===\n");

const categories = [...new Set(checks.map((c) => c.category))];
let notReady = 0;

for (const cat of categories) {
  console.log(`[${cat}]`);
  for (const c of checks.filter((ch) => ch.category === cat)) {
    const icon = c.status === "ready" ? "READY" : c.status === "optional" ? "OPT  " : "MISS ";
    console.log(`  ${icon}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    if (c.status === "not_ready") notReady++;
  }
  console.log();
}

const total = checks.length;
const ready = checks.filter((c) => c.status === "ready").length;
const optional = checks.filter((c) => c.status === "optional").length;

console.log(`${total} checks: ${ready} ready, ${optional} optional, ${notReady} not ready`);
if (notReady > 0) {
  console.error(`\n${notReady} readiness check(s) failed.`);
  process.exit(1);
}
console.log("\nAll readiness checks passed.");
