import { test, expect } from "@playwright/test";

test("opens the drawing workspace and exposes the solver controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Draw/ })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Simple" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accurate" })).toBeVisible();
});
