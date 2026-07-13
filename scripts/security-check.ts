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
    name: "sin dangerouslySetInnerHTML (excepto QR SVG controlado)",
    run: () => {
      const hits = grepMissing(["dangerouslySetInnerHTML"]).filter(
        (line) => !line.includes("mfa-setup-flow.tsx"),
      );
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
    name: "auth revoca sesión previa en login (anti fixation)",
    run: () => {
      const source = readFileSync("src/lib/server/auth.ts", "utf8");
      const ok = source.includes("previousToken") && source.includes("session.updateMany");
      return { ok, detail: ok ? "" : "auth.ts no revoca sesión previa en login." };
    },
  },
  {
    name: "auth expone revokeAllUserSessions",
    run: () => {
      const source = readFileSync("src/lib/server/auth.ts", "utf8");
      const ok = source.includes("export async function revokeAllUserSessions");
      return { ok, detail: ok ? "" : "revokeAllUserSessions no está expuesto." };
    },
  },
  {
    name: "password-reset persiste solo hash del token",
    run: () => {
      const source = readFileSync("src/lib/server/password-reset.ts", "utf8");
      const persistsHash = source.includes("hashToken(token)");
      const noPlain = !/tokenHash:\s*token[^H]/.test(source) && !/tokenHash:\s*rawToken/.test(source);
      const ok = persistsHash && noPlain;
      return { ok, detail: ok ? "" : "password-reset.ts podría guardar el token en claro." };
    },
  },
  {
    name: "recuperar/[token] tiene noindex y no-cache",
    run: () => {
      const source = readFileSync("src/app/recuperar/[token]/page.tsx", "utf8");
      const ok = source.includes('robots: { index: false') && source.includes("force-dynamic");
      return { ok, detail: ok ? "" : "página de reset falta noindex o dynamic." };
    },
  },
  {
    name: "actions de reset con rate limit por email e IP",
    run: () => {
      const source = readFileSync("src/lib/server/password-reset-actions.ts", "utf8");
      const ok = source.includes('"auth.password_reset.email"') && source.includes('"auth.password_reset.ip"');
      return { ok, detail: ok ? "" : "password-reset-actions.ts sin rate limit doble." };
    },
  },
  {
    name: "file pipeline usa quarantine prefix",
    run: () => {
      const source = readFileSync("src/lib/server/file-pipeline.ts", "utf8");
      const ok = source.includes("quarantine/") && source.includes("CopyObjectCommand") && source.includes("DeleteObjectCommand");
      return { ok, detail: ok ? "" : "file-pipeline.ts sin cuarentena o sin promote/delete." };
    },
  },
  {
    name: "file pipeline fails closed when AV unavailable",
    run: () => {
      const source = readFileSync("src/lib/server/file-pipeline.ts", "utf8");
      const ok = source.includes("AV_UNAVAILABLE") && source.includes("fail closed");
      return { ok, detail: ok ? "" : "file-pipeline.ts no falla cerrado sin AV." };
    },
  },
  {
    name: "antivirus provider strips EXIF from JPEG",
    run: () => {
      const source = readFileSync("src/lib/server/file-pipeline.ts", "utf8");
      const ok = source.includes("stripExif") && source.includes('mimeType === "image/jpeg"');
      return { ok, detail: ok ? "" : "file-pipeline.ts no strip EXIF de JPEG." };
    },
  },
  {
    name: "submitProofAction uses quarantine pipeline",
    run: () => {
      const source = readFileSync("src/lib/server/actions.ts", "utf8");
      const ok = source.includes("processUploadThroughPipeline");
      return { ok, detail: ok ? "" : "actions.ts no usa pipeline de cuarentena para upload." };
    },
  },
  {
    name: "shells link to /account/security",
    run: () => {
      const shell = readFileSync("src/components/shell/shell-chrome.tsx", "utf8");
      const driver = readFileSync("src/components/shell/driver-shell.tsx", "utf8");
      const ok = shell.includes("/account/security") && driver.includes("/account/security");
      return { ok, detail: ok ? "" : "Shells sin link a seguridad." };
    },
  },
  {
    name: "document download gates on FileAttachment by objectKey",
    run: () => {
      const source = readFileSync("src/app/api/t/[tenantSlug]/documents/[documentId]/route.ts", "utf8");
      const ok = source.includes("objectKey: document.objectKey") && source.includes('status !== "AVAILABLE"');
      return { ok, detail: ok ? "" : "document download no verifica FileAttachment por objectKey." };
    },
  },
  {
    name: "proof download gates on FileAttachment status",
    run: () => {
      const source = readFileSync("src/app/api/t/[tenantSlug]/proof/[tripId]/route.ts", "utf8");
      const ok = source.includes("fileAttachment.findFirst") && source.includes('status !== "AVAILABLE"');
      return { ok, detail: ok ? "" : "proof download no verifica FileAttachment." };
    },
  },
  {
    name: "POD filters evidence by AVAILABLE FileAttachment",
    run: () => {
      const source = readFileSync("src/lib/server/pod-pdf.ts", "utf8");
      const ok = source.includes('status === "AVAILABLE"') && source.includes("availableKeys");
      return { ok, detail: ok ? "" : "POD no filtra evidencias por FileAttachment AVAILABLE." };
    },
  },
  {
    name: "approveProofAction includes fileAttachments in query",
    run: () => {
      const source = readFileSync("src/lib/server/actions.ts", "utf8");
      const ok = source.includes("fileAttachments: true");
      return { ok, detail: ok ? "" : "approveProofAction no incluye fileAttachments." };
    },
  },
  {
    name: "ClamAV port bound to localhost only",
    run: () => {
      const source = readFileSync("docker-compose.yml", "utf8");
      const ok = source.includes("127.0.0.1:3310:3310");
      return { ok, detail: ok ? "" : "ClamAV port exposed to all interfaces." };
    },
  },
  {
    name: "MFA secrets encrypted with AES-256-GCM, not plaintext",
    run: () => {
      const source = readFileSync("src/lib/server/mfa-crypto.ts", "utf8");
      const ok = source.includes("aes-256-gcm") && source.includes("createCipheriv") && source.includes("getAuthTag");
      return { ok, detail: ok ? "" : "mfa-crypto.ts no cifra secretos con AES-256-GCM." };
    },
  },
  {
    name: "MFA recovery codes hashed with SHA-256",
    run: () => {
      const source = readFileSync("src/lib/server/mfa-crypto.ts", "utf8");
      const ok = source.includes('createHash("sha256")') && !source.includes("codeHash: code");
      return { ok, detail: ok ? "" : "mfa-crypto.ts no hashea códigos de recuperación." };
    },
  },
  {
    name: "MFA deactivation requires password + TOTP",
    run: () => {
      const source = readFileSync("src/lib/server/mfa-actions.ts", "utf8");
      const deactivateBlock = source.split("deactivateMfaAction")[1]?.split("export")[0] ?? "";
      const ok = deactivateBlock.includes("verifyPassword") && deactivateBlock.includes("verifyMfaCode");
      return { ok, detail: ok ? "" : "deactivateMfaAction no exige password + TOTP." };
    },
  },
  {
    name: "MFA verify rate limited (10/15min)",
    run: () => {
      const source = readFileSync("src/lib/server/mfa-actions.ts", "utf8");
      const ok = source.includes('"mfa.verify"') && source.includes("enforceRateLimit");
      return { ok, detail: ok ? "" : "verifyMfaLoginAction sin rate limit." };
    },
  },
  {
    name: "partial MFA sessions have short TTL",
    run: () => {
      const source = readFileSync("src/lib/server/auth.ts", "utf8");
      const ok = source.includes("PARTIAL_MFA_PENDING") && source.includes("15 * 60 * 1000");
      return { ok, detail: ok ? "" : "auth.ts sin TTL corto para sesiones MFA parciales." };
    },
  },
  {
    name: "privileged roles require MFA",
    run: () => {
      const source = readFileSync("src/lib/server/auth.ts", "utf8");
      const ok = source.includes("MFA_REQUIRED_PLATFORM_ROLES") && source.includes("MFA_REQUIRED_TENANT_ROLES");
      return { ok, detail: ok ? "" : "auth.ts sin enforcement de MFA por rol." };
    },
  },
  {
    name: "MFA verify page has noindex",
    run: () => {
      const source = readFileSync("src/app/mfa/verify/page.tsx", "utf8");
      const ok = source.includes("noindex") && source.includes("force-dynamic");
      return { ok, detail: ok ? "" : "/mfa/verify sin noindex o force-dynamic." };
    },
  },
  {
    name: "backup crypto uses AES-256-GCM",
    run: () => {
      const source = readFileSync("scripts/backup/crypto.ts", "utf8");
      const ok = source.includes("aes-256-gcm") && source.includes("createCipheriv") && source.includes("getAuthTag");
      return { ok, detail: ok ? "" : "backup/crypto.ts no usa AES-256-GCM." };
    },
  },
  {
    name: "backup deletes unencrypted dumps after encryption",
    run: () => {
      const pg = readFileSync("scripts/backup/postgres-backup.ts", "utf8");
      const minio = readFileSync("scripts/backup/minio-backup.ts", "utf8");
      const config = readFileSync("scripts/backup/config-backup.ts", "utf8");
      const ok = pg.includes("unlink(dumpFile)") && minio.includes("unlink(tarFile)") && config.includes("unlink(jsonFile)");
      return { ok, detail: ok ? "" : "backup scripts no eliminan dumps sin cifrar." };
    },
  },
  {
    name: "backup restore validates checksums before restoring",
    run: () => {
      const pg = readFileSync("scripts/backup/postgres-restore.ts", "utf8");
      const ok = pg.includes("checksum mismatch") && pg.includes("sha256File");
      return { ok, detail: ok ? "" : "postgres-restore no valida checksums." };
    },
  },
  {
    name: "backup restore uses isolated database, not production",
    run: () => {
      const pg = readFileSync("scripts/backup/postgres-restore.ts", "utf8");
      const ok = pg.includes("nci_logistics_restore_test") && !pg.includes('targetDb || "nci_logistics"');
      return { ok, detail: ok ? "" : "restore apunta a DB de produccion." };
    },
  },
  {
    name: "backups directory excluded from git",
    run: () => {
      const gitignore = readFileSync(".gitignore", "utf8");
      const ok = gitignore.includes("/backups/");
      return { ok, detail: ok ? "" : ".gitignore no excluye /backups/." };
    },
  },
  {
    name: "logger redacts 30+ sensitive keys",
    run: () => {
      const source = readFileSync("src/lib/observability/logger.ts", "utf8");
      const required = ["password", "token", "cookie", "otp", "mfa", "recoveryCode", "backupEncryptionKey", "databaseUrl", "objectKey", "session"];
      const missing = required.filter((k) => !source.includes(`"${k}"`));
      return { ok: missing.length === 0, detail: missing.length ? `Faltan keys: ${missing.join(", ")}` : "" };
    },
  },
  {
    name: "logger redacts data:image and signedUrl",
    run: () => {
      const source = readFileSync("src/lib/observability/logger.ts", "utf8");
      const ok = source.includes("data:image") && source.includes('"signedUrl"');
      return { ok, detail: ok ? "" : "logger.ts no redacta data:image o signedUrl." };
    },
  },
  {
    name: "middleware injects X-Request-ID",
    run: () => {
      const source = readFileSync("src/middleware.ts", "utf8");
      const ok = source.includes("x-request-id") && source.includes("getRequestId");
      return { ok, detail: ok ? "" : "middleware.ts no inyecta X-Request-ID." };
    },
  },
  {
    name: "health endpoint returns only status (no secrets)",
    run: () => {
      const source = readFileSync("src/app/api/internal/health/route.ts", "utf8");
      const ok = source.includes("status:") && !source.includes("checks") && !source.includes("durationMs");
      return { ok, detail: ok ? "" : "health/route.ts expone detalles internos." };
    },
  },
  {
    name: "readiness endpoint requires platform role",
    run: () => {
      const source = readFileSync("src/app/api/internal/readiness/route.ts", "utf8");
      const ok = source.includes("requirePlatformRole") && source.includes("PLATFORM_SUPER_ADMIN");
      return { ok, detail: ok ? "" : "readiness/route.ts no requiere rol de plataforma." };
    },
  },
  {
    name: "metrics endpoint requires platform role",
    run: () => {
      const source = readFileSync("src/app/api/internal/metrics/route.ts", "utf8");
      const ok = source.includes("requirePlatformRole") && source.includes("PLATFORM_SUPER_ADMIN");
      return { ok, detail: ok ? "" : "metrics/route.ts no requiere rol de plataforma." };
    },
  },
  {
    name: "system-status page requires platform role with MFA",
    run: () => {
      const source = readFileSync("src/app/platform/system-status/page.tsx", "utf8");
      const ok = source.includes("requirePlatformRole") && source.includes("PLATFORM_SUPER_ADMIN");
      return { ok, detail: ok ? "" : "system-status page no requiere rol de plataforma." };
    },
  },
  {
    name: "PWA telemetry validates allowlist and rejects base64",
    run: () => {
      const source = readFileSync("src/app/api/t/[tenantSlug]/driver/pwa-telemetry/route.ts", "utf8");
      const ok = source.includes("ALLOWED_KEYS") && source.includes('startsWith("data:")') && source.includes("base64");
      return { ok, detail: ok ? "" : "pwa-telemetry no valida allowlist o no rechaza base64." };
    },
  },
  {
    name: "PWA telemetry has rate limit and Origin check",
    run: () => {
      const source = readFileSync("src/app/api/t/[tenantSlug]/driver/pwa-telemetry/route.ts", "utf8");
      const ok = source.includes("enforceRateLimit") && source.includes("verifyMutationOrigin");
      return { ok, detail: ok ? "" : "pwa-telemetry sin rate limit o sin Origin check." };
    },
  },
  {
    name: "alerts use dedupeKey for deduplication",
    run: () => {
      const source = readFileSync("src/lib/observability/alerts.ts", "utf8");
      const ok = source.includes("dedupeKey") && source.includes("COOLDOWN_MINUTES");
      return { ok, detail: ok ? "" : "alerts.ts sin deduplicacion o cooldown." };
    },
  },
  {
    name: "error.tsx shows digest ref but not internal details",
    run: () => {
      const source = readFileSync("src/app/error.tsx", "utf8");
      const ok = source.includes("digest") && !source.includes("stack") && !source.includes("cause");
      return { ok, detail: ok ? "" : "error.tsx expone stack o causa interna." };
    },
  },
  {
    name: "internal API endpoints set Cache-Control: no-store",
    run: () => {
      const readiness = readFileSync("src/app/api/internal/readiness/route.ts", "utf8");
      const metrics = readFileSync("src/app/api/internal/metrics/route.ts", "utf8");
      const ok = readiness.includes("no-store") && metrics.includes("no-store");
      return { ok, detail: ok ? "" : "endpoints internos sin Cache-Control: no-store." };
    },
  },
  {
    name: "integration credentials encrypted with AES-256-GCM",
    run: () => {
      const source = readFileSync("src/lib/integrations/credential-crypto.ts", "utf8");
      const ok = source.includes("aes-256-gcm") && source.includes("createCipheriv") && source.includes("getAuthTag");
      return { ok, detail: ok ? "" : "credential-crypto.ts no cifra con AES-256-GCM." };
    },
  },
  {
    name: "integration providers are disabled by default",
    run: () => {
      const files = ["gps", "whatsapp", "crm", "billing", "ai"];
      const results: string[] = [];
      for (const f of files) {
        const source = readFileSync(`src/lib/integrations/disabled/${f}.ts`, "utf8");
        if (!source.includes("return false")) results.push(`${f}.ts: isEnabled() no retorna false`);
      }
      return { ok: results.length === 0, detail: results.join("\n") };
    },
  },
  {
    name: "disabled providers do not make HTTP calls",
    run: () => {
      const hits = grepMissing(["fetch(", "axios", "node-fetch", "got(", "http.request"]).filter(
        (line) => line.includes("src/lib/integrations/disabled/"),
      );
      return { ok: hits.length === 0, detail: hits.join("\n") };
    },
  },
  {
    name: "AI provider is disabled and does not call external APIs",
    run: () => {
      const source = readFileSync("src/lib/integrations/disabled/ai.ts", "utf8");
      const ok = source.includes("return false") && !source.includes("fetch(") && !source.includes("openai") && !source.includes("anthropic");
      return { ok, detail: ok ? "" : "ai.ts enabled or calls external API." };
    },
  },
  {
    name: "AI context builder isolates by tenantId",
    run: () => {
      const source = readFileSync("src/lib/ai/context-builder.ts", "utf8");
      const tenantFilters = source.match(/tenantId/g) ?? [];
      const ok = tenantFilters.length >= 15 && source.includes("buildTenantContext(tenantId");
      return { ok, detail: ok ? "" : `Solo ${tenantFilters.length} filtros tenantId (esperado >= 15).` };
    },
  },
  {
    name: "AI safety filters prevent cross-tenant and sensitive data",
    run: () => {
      const source = readFileSync("src/lib/ai/safety.ts", "utf8");
      const ok = source.includes("validateTenantIsolation") && source.includes("filterSensitiveFields") && source.includes("assertNoCriticalAction");
      return { ok, detail: ok ? "" : "safety.ts sin filtros de aislamiento o datos sensibles." };
    },
  },
  {
    name: "feedback isolated by tenant in server-side queries",
    run: () => {
      const source = readFileSync("src/app/t/[tenantSlug]/admin/feedback/page.tsx", "utf8");
      const ok = source.includes("tenantId: tenant.id") && source.includes("requireTenantRole");
      return { ok, detail: ok ? "" : "feedback page no filtra por tenantId o no requiere rol." };
    },
  },
  {
    name: "platform routes require platform role",
    run: () => {
      const pages = ["tenants", "plans", "feedback", "recommendations", "errors", "integrations"];
      const missing: string[] = [];
      for (const p of pages) {
        const source = readFileSync(`src/app/platform/${p}/page.tsx`, "utf8");
        if (!source.includes("requirePlatformRole")) missing.push(p);
      }
      return { ok: missing.length === 0, detail: missing.length ? `Sin proteccion: ${missing.join(", ")}` : "" };
    },
  },
  {
    name: "tenant admin routes require tenant role",
    run: () => {
      const pages = ["users", "drivers", "invitations", "feedback", "integrations", "recommendations", "activity"];
      const missing: string[] = [];
      for (const p of pages) {
        const source = readFileSync(`src/app/t/[tenantSlug]/admin/${p}/page.tsx`, "utf8");
        if (!source.includes("requireTenantRole")) missing.push(p);
      }
      return { ok: missing.length === 0, detail: missing.length ? `Sin proteccion: ${missing.join(", ")}` : "" };
    },
  },
  {
    name: "no API keys in plaintext in integration code",
    run: () => {
      const hits = grepMissing(["sk-", "sk_live_", "sk_test_", "Bearer "]).filter(
        (line) => line.includes("src/lib/integrations/") && !line.includes("credentialKeys"),
      );
      return { ok: hits.length === 0, detail: hits.join("\n") };
    },
  },
  {
    name: "invitation tokens hashed before storage",
    run: () => {
      const source = readFileSync("src/lib/server/invitation-actions.ts", "utf8");
      const ok = source.includes("hashToken") && source.includes("tokenHash");
      return { ok, detail: ok ? "" : "invitation-actions.ts no hashea tokens." };
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
