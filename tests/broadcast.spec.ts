import { test, expect } from "@playwright/test";
test("demo uses detector pipeline through results and restart", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "TRAIN THE",
  );
  await page.screenshot({ path: "test-results/landing.png", fullPage: true });
  await page.getByRole("button", { name: "Arcade Championship" }).click();
  await page.getByLabel("03 / MATCH LENGTH").selectOption("15");
  await page.getByRole("button", { name: "Enter Demo Arena" }).click();
  await expect(page.getByRole("button", { name: "Start match" })).toBeEnabled();
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.getByText("ON THE CLOCK")).toBeVisible({ timeout: 6000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "test-results/broadcast.png", fullPage: true });
  await expect(
    page.getByRole("heading", { name: /WINS\.|SHARED GLORY/ }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".final-scores b").first()).not.toHaveText("0");
  await expect(page.locator(".final-scores b").nth(1)).not.toHaveText("0");
  await expect(page.locator(".results details")).not.toContainText("(0)");
  await page.screenshot({ path: "test-results/results.png", fullPage: true });
  await page.getByRole("button", { name: "Run it back" }).click();
  await expect(page.getByRole("button", { name: "Start match" })).toBeEnabled();
  await expect(page.locator(".player b").first()).toHaveText("0");
  expect(errors).toEqual([]);
});
test("solo arm raise setup and narrow layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Arcade Championship" }).click();
  await page.getByRole("button", { name: "Solo practice" }).click();
  await page.getByRole("button", { name: "Arm raises" }).click();
  await page.getByLabel("03 / MATCH LENGTH").selectOption("15");
  await page.getByRole("button", { name: "Enter Demo Arena" }).click();
  await expect(
    page.getByRole("heading", { name: "Arm Raise Championship" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start match" })).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.getByRole("heading", { name: /WINS\./ })).toBeVisible({
    timeout: 25000,
  });
  await expect(page.locator(".final-scores b")).not.toHaveText("0");
});

test("camera denial is actionable and demo remains available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Arcade Championship" }).click();
  await page.getByLabel("Live webcam").check();
  await page.getByRole("button", { name: "Enable Camera" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Camera permission denied",
  );
  await expect(
    page.getByRole("button", { name: "Start match" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "End broadcast" }).click();
  await page.getByLabel("Demo Mode").check();
  await page.getByRole("button", { name: "Enter Demo Arena" }).click();
  await expect(page.getByRole("button", { name: "Start match" })).toBeEnabled();
});
