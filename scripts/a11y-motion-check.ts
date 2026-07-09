/**
 * Verificación de accesibilidad y movimiento:
 * 1. prefers-reduced-motion: reduce → las animaciones deben quedar en ~0 ms.
 * 2. Navegación por teclado en login → foco visible y orden lógico.
 * 3. Sin scroll horizontal en 375 px (portada y login).
 * Uso: pnpm exec tsx scripts/a11y-motion-check.ts (dev server activo).
 */
import { chromium } from "@playwright/test";

const baseURL = "http://localhost:3000";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const browser = await chromium.launch();

  // 1. Reduced motion
  const reduced = await browser.newContext({ reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${baseURL}/`);
  const animationDuration = await reducedPage.evaluate(() => {
    const el = document.querySelector(".anim-page");
    return el ? getComputedStyle(el).animationDuration : "no-element";
  });
  // El navegador normaliza 0.01ms a segundos (1e-05s); ambas formas son válidas.
  check(
    "reduced-motion anula animaciones",
    animationDuration === "0.01ms" || parseFloat(animationDuration) <= 0.0001,
    `animation-duration=${animationDuration}`,
  );
  const scrollBehavior = await reducedPage.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  check("reduced-motion anula smooth scroll", scrollBehavior === "auto", `scroll-behavior=${scrollBehavior}`);
  await reduced.close();

  // 2. Teclado en login
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`);
  const order: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? `${el.tagName.toLowerCase()}${el.getAttribute("name") ? `[${el.getAttribute("name")}]` : `:${el.textContent?.trim().slice(0, 20)}`}` : "none";
      }),
    );
  }
  check(
    "orden de tabulacion login: enlace → correo → contrasena → entrar",
    order.join(" > ").includes("input[email] > input[password] > button"),
    order.join(" > "),
  );
  const outline = await page.evaluate(() => {
    const input = document.querySelector('input[name="email"]') as HTMLInputElement;
    input.focus();
    return getComputedStyle(input).outlineWidth;
  });
  check("focus visible con outline", outline !== "0px", `outline-width=${outline}`);

  // 3. Sin scroll horizontal en 375px
  for (const route of ["/", "/login"]) {
    const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(`${baseURL}${route}`);
    const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`sin scroll horizontal en 375px (${route})`, overflow <= 0, `overflow=${overflow}px`);
    await mobile.close();
  }

  await browser.close();
  if (failures > 0) {
    console.error(`${failures} verificaciones fallaron`);
    process.exit(1);
  }
  console.log("Todas las verificaciones de accesibilidad/movimiento pasaron.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
