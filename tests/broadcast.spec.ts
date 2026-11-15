import { expect, test } from "@playwright/test";

test("landing offers only the controlled coaching exercises", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("TRAIN THE");
  await expect(page.getByRole("button", { name: "Arcade Championship" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Jumping jacks" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Arm raises" })).toHaveCount(0);
  await expect(page.getByLabel("Leaderboard exercise").locator("option")).toHaveText([
    "Controlled arm raises",
    "Controlled squats",
  ]);
});
