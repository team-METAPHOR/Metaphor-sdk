import { expect, test } from "@playwright/test";
import { API, defaultConfig, mockWidget, SITE } from "./mock";

test("submits a text report with explicit environment consent and no cookies", async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: "private", value: "never-send", url: API }]);
  const requests = await mockWidget(page);
  await page.goto(`${SITE}/cart?token=secret#private`);
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("제목", { exact: true }).fill("검색 오류");
  await page.getByLabel("설명", { exact: true }).fill("검색 결과가 없습니다");
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("rcpt_test");
  const report = requests.find((r) => r.method === "POST");
  expect(report).toMatchObject({
    origin: SITE,
    cookie: null,
    projectKey: "mpk_test",
    path: "/api/v1/widget/reports",
  });
  const body = report?.body?.toString() ?? "";
  expect(body).toContain('"page_url":"http://shop.test/cart"');
  expect(body).toContain('"consent":{"environment":false,"screenshot":false}');
  expect(body).not.toContain('"user_agent"');
  expect(body).not.toContain('filename="screenshot.png"');
});

test("supports keyboard cancel and environment opt-in", async ({ page }) => {
  const requests = await mockWidget(page);
  await page.goto(SITE);
  await page.getByRole("button", { name: "버그 신고", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("제목", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("설명", { exact: true }).fill("오류 설명");
  await page.getByLabel("브라우저 환경 정보 전송에 동의합니다").check();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("접수되었습니다");
  expect(requests.find((r) => r.method === "POST")?.body?.toString()).toContain('"user_agent"');
});

test("does not mount or submit when reporting is disabled", async ({ page }) => {
  const requests = await mockWidget(page, { ...defaultConfig(), reporting_enabled: false });
  await page.goto(SITE);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "버그 신고", exact: true })).toHaveCount(0);
  expect(requests.filter((r) => r.method === "POST")).toHaveLength(0);
});

test("changed content gets a fresh submission key", async ({ page }) => {
  await page.clock.install();
  await mockWidget(page);
  const keys: (string | undefined)[] = [];
  await page.route(`${API}/api/v1/widget/reports?**`, async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": SITE,
          "access-control-allow-headers": "Idempotency-Key",
          "access-control-allow-methods": "POST",
        },
      });
    keys.push(route.request().headers()["idempotency-key"]);
    return route.fulfill({
      status: 503,
      headers: { "access-control-allow-origin": SITE },
      json: { error: { code: "WIDGET_UNAVAILABLE" } },
    });
  });
  await page.goto(SITE);
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("설명", { exact: true }).fill("첫 설명");
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("전송하지 못했습니다");
  await page.getByLabel("설명", { exact: true }).fill("바꾼 설명");
  await page.clock.fastForward(32000);
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[0]).not.toBe(keys[1]);
});

test("retries the same submission with the same key after backoff", async ({ page }) => {
  await page.clock.install();
  await mockWidget(page);
  const keys: (string | undefined)[] = [];
  await page.route(`${API}/api/v1/widget/reports?**`, async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": SITE,
          "access-control-allow-headers": "Idempotency-Key",
          "access-control-allow-methods": "POST",
        },
      });
    keys.push(route.request().headers()["idempotency-key"]);
    return route.fulfill({
      status: keys.length === 1 ? 503 : 201,
      headers: { "access-control-allow-origin": SITE },
      json:
        keys.length === 1
          ? { error: { code: "WIDGET_UNAVAILABLE" } }
          : { status: "received", receipt_id: "retry_receipt" },
    });
  });
  await page.goto(SITE);
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("설명", { exact: true }).fill("오류 설명");
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("전송하지 못했습니다");
  await page.clock.fastForward(32000);
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("retry_receipt");
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});

for (const [status, response, text] of [
  [200, { status: "duplicate", receipt_id: null }, "이미 접수된 오류"],
  [429, { error: { code: "DAILY_LIMIT_EXCEEDED" } }, "신고 한도"],
  [422, { error: { code: "SCOPE_VIOLATION" } }, "신고를 접수할 수 없습니다"],
] as const) {
  test(`shows response state ${status}`, async ({ page }) => {
    await mockWidget(page);
    await page.route(`${API}/api/v1/widget/reports?**`, (route) =>
      route.fulfill({
        status: route.request().method() === "OPTIONS" ? 204 : status,
        headers: {
          "access-control-allow-origin": SITE,
          "access-control-allow-headers": "Idempotency-Key",
          "access-control-allow-methods": "POST",
        },
        ...(route.request().method() === "OPTIONS" ? {} : { json: response }),
      }),
    );
    await page.goto(SITE);
    await page.getByRole("button", { name: "버그 신고", exact: true }).click();
    await page.getByLabel("설명", { exact: true }).fill("오류 설명");
    await page.getByRole("button", { name: "신고 보내기" }).click();
    await expect(page.getByRole("status")).toContainText(text);
  });
}

test("uses consent the host collected at signup and hides those checkboxes", async ({ page }) => {
  const requests = await mockWidget(page);
  await page.addInitScript(() => {
    window.metaphorConsent = { environment: true, screenshot: true };
  });
  await page.goto(SITE);
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await expect(page.getByLabel("브라우저 환경 정보 전송에 동의합니다")).toBeHidden();
  await expect(page.getByLabel("마스킹된 스크린샷 전송에 동의합니다")).toBeHidden();
  await expect(page.getByText("가입할 때 동의한")).toBeVisible();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("접수되었습니다");
  const body = requests.find((r) => r.method === "POST")?.body?.toString() ?? "";
  expect(body).toContain('"consent":{"environment":true,"screenshot":true}');
  expect(body).toContain('filename="screenshot.png"');
});

test("shows checkboxes again once the host clears consent", async ({ page }) => {
  await mockWidget(page);
  await page.addInitScript(() => {
    window.metaphorConsent = { environment: true, screenshot: false };
  });
  await page.goto(SITE);
  const launch = page.getByRole("button", { name: "버그 신고", exact: true });
  await launch.click();
  await expect(page.getByLabel("브라우저 환경 정보 전송에 동의합니다")).toBeHidden();
  await expect(page.getByLabel("마스킹된 스크린샷 전송에 동의합니다")).toBeVisible();
  await page.getByRole("button", { name: "취소" }).click();
  await page.evaluate(() => {
    delete window.metaphorConsent;
  });
  await launch.click();
  await expect(page.getByLabel("브라우저 환경 정보 전송에 동의합니다")).toBeVisible();
  await expect(page.getByLabel("브라우저 환경 정보 전송에 동의합니다")).not.toBeChecked();
  await expect(page.getByText("가입할 때 동의한")).toBeHidden();
});
