import { expect, test } from "@playwright/test";
import { API, defaultConfig, mockWidget, SITE } from "./mock";

for (const kind of ["js_error", "unhandled_rejection", "fetch", "xhr"] as const) {
  test(`offers ${kind} without sending until the user submits`, async ({ page }) => {
    const requests = await mockWidget(page);
    await page.goto(SITE);
    await expect(page.getByRole("button", { name: "버그 신고", exact: true })).toBeVisible();
    if (kind === "js_error") await page.locator("#throw").click();
    else
      await page.evaluate((kind) => {
        if (kind === "unhandled_rejection")
          void Promise.reject(new TypeError("token=never-send private@example.com"));
        else if (kind === "fetch")
          void fetch("/api/fail?token=never-send", {
            method: "POST",
            body: "private request body",
          });
        else {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", "/api/fail?token=never-send");
          xhr.send();
        }
      }, kind);
    await page.getByRole("button", { name: "오류가 감지되었습니다. 신고하기" }).click();
    expect(requests.filter((r) => r.method === "POST")).toHaveLength(0);
    await page.getByRole("button", { name: "신고 보내기" }).click();
    await expect(page.getByRole("status")).toContainText("rcpt_test");
    const body = requests.find((r) => r.method === "POST")?.body?.toString() ?? "";
    expect(body).toContain(
      `"error_type":"${kind === "fetch" || kind === "xhr" ? "http_5xx" : kind}"`,
    );
    if (kind === "fetch" || kind === "xhr")
      expect(body).toContain(
        `"http":{"method":"${kind === "fetch" ? "POST" : "GET"}","path":"/api/fail","status":502}`,
      );
    expect(body).not.toContain("never-send");
    expect(body).not.toContain("private request body");
    expect(body).not.toContain("private response body");
    expect(body).not.toContain("private@example.com");
  });
}

test("respects detection flags and client prompt cooldown", async ({ page }) => {
  await page.clock.install();
  const config = defaultConfig();
  await mockWidget(page, { ...config, auto_detect: { ...config.auto_detect, js_error: false } });
  await page.goto(SITE);
  await page.locator("#throw").click();
  await expect(page.getByRole("button", { name: "오류가 감지되었습니다. 신고하기" })).toBeHidden();
  await page.evaluate(() => fetch("/api/fail"));
  await page.getByRole("button", { name: "오류가 감지되었습니다. 신고하기" }).click();
  await page.getByRole("button", { name: "취소" }).click();
  await page.evaluate(() => fetch("/api/fail"));
  await expect(page.getByRole("button", { name: "오류가 감지되었습니다. 신고하기" })).toBeHidden();
  await page.clock.fastForward(61000);
  await page.evaluate(() => fetch("/api/fail"));
  await expect(page.getByRole("button", { name: "오류가 감지되었습니다. 신고하기" })).toBeVisible();
});

test("stops prompts for the page session after 429", async ({ page }) => {
  await page.clock.install();
  await mockWidget(page);
  await page.route(`${API}/api/v1/widget/reports?**`, (route) =>
    route.fulfill({
      status: route.request().method() === "OPTIONS" ? 204 : 429,
      headers: {
        "access-control-allow-origin": SITE,
        "access-control-allow-headers": "Idempotency-Key",
        "access-control-allow-methods": "POST",
      },
      ...(route.request().method() === "OPTIONS"
        ? {}
        : { json: { error: { code: "WIDGET_IP_RATE_LIMITED" } } }),
    }),
  );
  await page.goto(SITE);
  await page.evaluate(() => fetch("/api/fail"));
  await page.getByRole("button", { name: "오류가 감지되었습니다. 신고하기" }).click();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("신고 한도");
  await page.getByRole("button", { name: "취소" }).click();
  await page.clock.fastForward(61000);
  await page.evaluate(() => fetch("/api/fail"));
  await expect(page.getByRole("button", { name: "오류가 감지되었습니다. 신고하기" })).toBeHidden();
});
