import { expect, test } from "@playwright/test";

test("public screen renders tournament timer shell", async ({ page }) => {
  const token = process.env.TEST_PUBLIC_TOKEN;
  test.skip(!token, "Set TEST_PUBLIC_TOKEN to the seeded tournament public token.");

  await page.goto(`/screen/${token}`);

  await expect(page.getByText(/POKER CLUB|Friday Night Poker/i)).toBeVisible();
  await expect(page.getByText(/Блайнды/i)).toBeVisible();
  await expect(page.locator(".timer-display")).toBeVisible();
});
