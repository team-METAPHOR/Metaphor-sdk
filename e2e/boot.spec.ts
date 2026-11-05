import { expect, test } from "@playwright/test";
import { defaultConfig, mockWidget, SITE } from "./mock";

test("loads from the script tag and fetches config without cookies", async ({ page }) => {
  const requests = await mockWidget(page);
  await page.goto(SITE);
  await expect(page.getByRole("button", { name: "버그 신고", exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    method: "GET",
    path: "/api/v1/widget/config",
    projectKey: "mpk_test",
    origin: SITE,
    cookie: null,
  });
});

test("stays inert when the widget is disabled", async ({ page }) => {
  await mockWidget(page, { ...defaultConfig(), widget_enabled: false });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(SITE);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).not.toHaveAttribute("data-metaphor-ready", "true");
  expect(errors).toEqual([]);
});
