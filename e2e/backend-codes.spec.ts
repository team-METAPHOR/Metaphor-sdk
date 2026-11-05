// Backend codes added after the MVP: origin verification (422) and the widget daily cap (429).
import { expect, type Page, test } from "@playwright/test";
import { API, mockWidget, SITE } from "./mock";

async function failReports(page: Page, status: number, code: string): Promise<() => number> {
  let posts = 0;
  await page.route(`${API}/api/v1/widget/reports?**`, (route) => {
    const preflight = route.request().method() === "OPTIONS";
    if (!preflight) posts += 1;
    return route.fulfill({
      status: preflight ? 204 : status,
      headers: {
        "access-control-allow-origin": SITE,
        "access-control-allow-headers": "Idempotency-Key",
        "access-control-allow-methods": "POST",
      },
      ...(preflight ? {} : { json: { error: { code } } }),
    });
  });
  return () => posts;
}

async function sendReport(page: Page) {
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("설명", { exact: true }).fill("오류 설명");
  await page.getByRole("button", { name: "신고 보내기" }).click();
}

test("unverified origin removes the widget instead of retrying", async ({ page }) => {
  await mockWidget(page);
  const posts = await failReports(page, 422, "ORIGIN_NOT_VERIFIED");
  await page.goto(SITE);
  await sendReport(page);
  await expect(page.getByRole("button", { name: "버그 신고", exact: true })).toHaveCount(0);
  expect(posts()).toBe(1);
});

test("widget daily cap waits until the next UTC day", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-05T12:00:00Z") });
  await mockWidget(page);
  const posts = await failReports(page, 429, "WIDGET_DAILY_LIMITED");
  await page.goto(SITE);
  await sendReport(page);
  await expect(page.getByRole("status")).toContainText("신고 한도");
  await page.clock.fastForward("01:00:00");
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await page.waitForTimeout(200);
  expect(posts()).toBe(1);
});
