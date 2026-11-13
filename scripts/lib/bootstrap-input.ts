/**
 * Validación de la entrada del bootstrap de producción (`scripts/bootstrap-production.ts`).
 *
 * Pura y sin E/S para poder probarla. Ningún mensaje de error incluye la contraseña.
 */

export const MIN_BOOTSTRAP_PASSWORD_LENGTH = 16;
const MAX_BOOTSTRAP_PASSWORD_LENGTH = 256;

export interface BootstrapAdminInput {
  email: string;
  name: string;
  password: string;
}

/** TLD reservados o no enrutables: ese buzon no puede recibir el correo de recuperacion. */
const UNROUTABLE_TLDS = ["local", "localhost", "test", "invalid", "example"];
const RESERVED_DOMAINS = ["example.com", "example.org", "example.net"];

/** Contraseñas demo publicadas en el repositorio (seed.ts, README, guias). Nunca validas en produccion. */
const PUBLIC_DEMO_PASSWORDS = new Set([
  "NCIPlatform2026!",
  "PanatruckOwner2026!",
  "Operaciones2026!",
  "Despacho2026!",
  "Conductor2026!",
  "Cliente2026!",
  "TransLogistica2026!",
  "Distribuciones2026!",
  "Demo2024!",
]);

export function parseBootstrapInput(
  env: Record<string, string | undefined>,
): BootstrapAdminInput {
  const problems: string[] = [];

  const email = (env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (env.BOOTSTRAP_ADMIN_NAME ?? "").trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD ?? "";

  if (!email) {
    problems.push("BOOTSTRAP_ADMIN_EMAIL es obligatorio.");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    problems.push("BOOTSTRAP_ADMIN_EMAIL no es un correo valido.");
  } else {
    const domain = email.split("@")[1];
    const tld = domain.split(".").pop() ?? "";
    if (UNROUTABLE_TLDS.includes(tld) || RESERVED_DOMAINS.includes(domain)) {
      problems.push(
        "BOOTSTRAP_ADMIN_EMAIL debe ser un buzon real (no .local, .test, .invalid ni example.*): recibe la recuperacion de contrasena.",
      );
    }
  }

  if (name.length < 2 || name.length > 120) {
    problems.push("BOOTSTRAP_ADMIN_NAME es obligatorio (2 a 120 caracteres).");
  }

  if (!password) {
    problems.push("BOOTSTRAP_ADMIN_PASSWORD es obligatorio.");
  } else if (password.length < MIN_BOOTSTRAP_PASSWORD_LENGTH) {
    problems.push(
      `BOOTSTRAP_ADMIN_PASSWORD debe tener al menos ${MIN_BOOTSTRAP_PASSWORD_LENGTH} caracteres.`,
    );
  } else if (password.length > MAX_BOOTSTRAP_PASSWORD_LENGTH) {
    problems.push(
      `BOOTSTRAP_ADMIN_PASSWORD no puede superar ${MAX_BOOTSTRAP_PASSWORD_LENGTH} caracteres.`,
    );
  } else if (PUBLIC_DEMO_PASSWORDS.has(password)) {
    problems.push(
      "BOOTSTRAP_ADMIN_PASSWORD es una contrasena demo publicada en el repositorio.",
    );
  } else if (email && password.toLowerCase() === email) {
    problems.push("BOOTSTRAP_ADMIN_PASSWORD no puede ser igual al correo.");
  }

  if (problems.length > 0) {
    throw new Error(problems.map((problem) => `- ${problem}`).join("\n"));
  }

  return { email, name, password };
}
