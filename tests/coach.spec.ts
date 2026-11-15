import { expect, test } from "@playwright/test";

test("guided demo scores control and keeps arcade available", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Hear Sarah.*introduce themselves/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start Training" }).click();
  await page.getByRole("button", { name: "4 quality reps" }).click();
  await page.getByRole("button", { name: "Continue to demonstration" }).click();
  await expect(page.getByLabel("Animated skeleton demonstrating the exercise")).toBeVisible();
  await page.getByRole("button", { name: "Enter coach demo" }).click();
  const avatar = page.getByLabel("Alex movement avatar");
  await expect(avatar).toBeVisible();
  await expect(avatar.getByTestId("avatar-guidance")).toContainText("MIRRORING");
  await expect(page.getByRole("button", { name: "Accept target" })).toBeEnabled({
    timeout: 15000,
  });
  await page.getByLabel("Target range").fill("60");
  await page.getByRole("button", { name: "Accept target" }).click();
  await expect(page.getByText("QUALITY STARTS IN")).toBeVisible();
  await expect(avatar).toHaveAttribute("data-state", "past", { timeout: 15000 });
  await expect(avatar.getByTestId("avatar-guidance")).toContainText("TOO HIGH");
  await expect(page.getByTestId("quality-score")).not.toHaveText("—", {
    timeout: 25000,
  });
  await expect(page.getByRole("heading", { name: "Session results" })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".final-scores b").first()).not.toHaveText("—");
  const repTable = page.getByRole("table", { name: /Alex · score per rep/ });
  await expect(repTable).toBeVisible();
  await expect(repTable.getByRole("columnheader", { name: "Score" })).toBeVisible();
  const scores = await repTable.getByRole("cell").allTextContents();
  expect(scores.some((score) => /^\d+$/.test(score.trim()))).toBe(true);
  await page.getByRole("button", { name: "Everyday League home" }).click();
  await page.getByRole("button", { name: "Arcade Championship" }).click();
  await expect(page.getByRole("button", { name: "Enter Demo Arena" })).toBeVisible();
  expect(errors).toEqual([]);
});
