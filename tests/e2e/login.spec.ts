import { expect, test } from "@playwright/test";

test("home page exposes local product and login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LOGISTICS CONTROL TOWER" })).toBeVisible();
  await page.getByRole("link", { name: "Iniciar sesion" }).click();
  await expect(page.getByRole("heading", { name: "NCI Logistics Control Tower" })).toBeVisible();
});
