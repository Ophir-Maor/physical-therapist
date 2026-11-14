import { expect, test } from "@playwright/test";

test("guided demo scores control and keeps arcade available", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Guided Coach" }).click();
  await page.getByRole("button", { name: "4 quality reps" }).click();
  await page.getByRole("button", { name: "Continue to demonstration" }).click();
  await expect(page.getByLabel("Animated skeleton demonstrating the exercise")).toBeVisible();
  await page.getByRole("button", { name: "Enter coach demo" }).click();
  await expect(page.getByRole("button", { name: "Accept target" })).toBeEnabled({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Accept target" }).click();
  await expect(page.getByText("QUALITY STARTS IN")).toBeVisible();
  await expect(page.getByTestId("quality-score")).not.toHaveText("—", {
    timeout: 25000,
  });
  await expect(page.getByRole("heading", { name: "Session results" })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".final-scores b").first()).not.toHaveText("—");
  await page.getByRole("button", { name: "Everyday League home" }).click();
  await page.getByRole("button", { name: "Start Broadcasting" }).click();
  await expect(page.getByRole("button", { name: "Enter Demo Arena" })).toBeVisible();
  expect(errors).toEqual([]);
});
