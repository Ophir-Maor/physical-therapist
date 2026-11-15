import { expect, test } from "@playwright/test";

test("championship board filters and empty or loaded state", async ({ page }) => {
  await page.goto("/leaderboard");
  await expect(page.getByRole("heading", { name: /sand hacks/i })).toBeVisible();
  await expect(page.getByLabel("Exercise")).toBeVisible();
  await expect(page.getByLabel("Challenge")).toBeVisible();
  await expect(page.getByLabel("Repetition goal")).toHaveCount(0);
  await expect(page.getByLabel("Range target")).toHaveCount(0);
  await expect(page.getByLabel("Duration")).toHaveCount(0);
  await page.getByLabel("Exercise").selectOption({ label: "Jumping jacks" });
  await expect(page.getByLabel("Duration")).toHaveCount(0);
  await expect(page.getByLabel("Challenge")).toHaveValue("reps");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(
    page.getByText(/no scores in this category yet|average quality|could not be loaded|unavailable/i).first(),
  ).toBeVisible();
});

test("championship board stays readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Quality board" }).click();
  await expect(page).toHaveURL(/\/leaderboard/);
  await expect(page.getByLabel("Exercise")).toBeVisible();
  const box = await page.getByLabel("Exercise").boundingBox();
  expect(box && box.width).toBeGreaterThan(120);
});
