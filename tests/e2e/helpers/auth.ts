import { expect, type Page } from "@playwright/test";
import { TOTP } from "otpauth";

/** Secreto TOTP que `prisma/seed.ts` asigna a los usuarios demo con MFA. */
export const SEED_TOTP_SECRET = "JBSWY3DPEHPK3PXP4567ABCDEFGHIJKL";

/**
 * Espera a que React hidrate el formulario de la pagina.
 *
 * El formulario de login trae valores por defecto (`platform@nci.local`). Si el
 * test rellena los campos antes de la hidratacion, React los repone y el envio
 * sale con el usuario por defecto o se queda en /login. `networkidle` no basta
 * con el dev server en frio: hay que ver las props de React en el nodo.
 */
async function waitForHydratedForm(page: Page) {
  await page.waitForFunction(
    () => {
      const form = document.querySelector("form");
      return Boolean(form) && Object.keys(form as object).some((key) => key.startsWith("__reactProps$"));
    },
    undefined,
    { timeout: 60_000 },
  );
}

async function fillVerified(page: Page, label: string, value: string) {
  const field = page.getByLabel(label);
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

async function failureMessage(page: Page) {
  const alert = page.getByRole("alert").first();
  return (await alert.isVisible().catch(() => false)) ? `: ${(await alert.textContent())?.trim()}` : "";
}

/**
 * Inicia sesion y, si el usuario tiene MFA, completa el TOTP del seed.
 * Falla con un mensaje claro si la sesion no se establece, en lugar de dejar
 * que el test siga sin autenticar y reciba la pagina de login como respuesta.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await waitForHydratedForm(page);
  await fillVerified(page, "Correo", email);
  await fillVerified(page, "Contrasena", password);
  await page.getByRole("button", { name: "Entrar" }).click();
  try {
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  } catch {
    throw new Error(`login(${email}) no salio de /login${await failureMessage(page)}`);
  }

  if (page.url().includes("/mfa/verify")) {
    await waitForHydratedForm(page);
    const totp = new TOTP({ secret: SEED_TOTP_SECRET, algorithm: "SHA1", digits: 6, period: 30 });
    await fillVerified(page, "Codigo de verificacion", totp.generate());
    await page.getByRole("button", { name: "Verificar" }).click();
    try {
      await page.waitForURL((url) => !url.pathname.includes("/mfa/"), { timeout: 30_000 });
    } catch {
      throw new Error(`login(${email}) no supero la verificacion MFA${await failureMessage(page)}`);
    }
  }
  await page.waitForLoadState("networkidle");
}
