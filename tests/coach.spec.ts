import { expect, test } from "@playwright/test";

test("guided demo scores control", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Hear Sarah.*introduce themselves/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start Training" }).click();
  await expect(page.getByRole("spinbutton", { name: "Scored reps" })).toHaveValue("4");
  await page.getByRole("textbox", { name: "Age" }).fill("34");
  await page.getByRole("button", { name: "Continue to demonstration" }).click();
  await expect(page.getByLabel("Animated skeleton demonstrating the exercise")).toBeVisible();
  await page.getByRole("button", { name: "Enter coach demo" }).click();
  const avatar = page.getByLabel("Alex movement avatar");
  await expect(avatar).toBeVisible();
  await expect(avatar.getByTestId("avatar-guidance")).toContainText("MIRRORING");
  await expect(page.getByRole("button", { name: "Accept target" })).toBeEnabled({
    timeout: 15000,
  });
  await expect(page.getByRole("slider", { name: "Target range" })).toHaveCount(0);
  await page.getByRole("button", { name: "Accept target" }).click();
  await expect(page.getByText("QUALITY STARTS IN")).toBeVisible();
  await expect(page.getByTestId("quality-score")).not.toHaveText("—", {
    timeout: 25000,
  });
  await expect(page.getByRole("heading", { name: "Next workout" })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText(/Gemini did not supply/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "See Results" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue this workout" })).toHaveCount(0);
  await expect(page.locator(".next-workouts .choice")).toHaveCount(3);
  await page.getByRole("button", { name: "See Results" }).click();
  await expect(page.getByRole("heading", { name: "Session Results" })).toBeVisible();
  await expect(page.getByText(/Demo Mode stays/i)).toHaveCount(0);
  await expect(page.locator(".final-scores b").first()).not.toHaveText("—");
  const repTable = page.getByRole("table", { name: /Alex · score per rep/ });
  await expect(repTable).toBeVisible();
  await expect(repTable.getByRole("columnheader", { name: "Score" })).toBeVisible();
  const scores = await repTable.getByRole("cell").allTextContents();
  expect(scores.some((score) => /^\d+$/.test(score.trim()))).toBe(true);
  await expect(page.getByText(/couldn't clearly see/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Exit" }).click();
  await expect(page.getByRole("heading", { name: /TRAIN THE REP/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Controlled arm raises/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Controlled squats/ })).toBeVisible();
  await page.getByRole("button", { name: "Everyday League home" }).click();
  await expect(page.getByRole("button", { name: "Arcade Championship" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Jumping jacks" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
