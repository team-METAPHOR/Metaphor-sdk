import { expect, test } from "@playwright/test";
import { mockWidget, SITE } from "./mock";

const payloadOf = (body: Buffer | null | undefined) => {
  const match = /name="payload"\r\n\r\n([\s\S]*?)\r\n--/.exec(body?.toString() ?? "");
  return JSON.parse(match?.[1] ?? "null");
};

test("attaches recent actions without values, queries or bodies", async ({ page }) => {
  const requests = await mockWidget(page);
  await page.goto(`${SITE}/cart?token=never-send#private`);
  await expect(page.getByRole("button", { name: "버그 신고", exact: true })).toBeVisible();
  await page.evaluate(() => history.pushState(null, "", "/checkout?coupon=never-send"));
  await page.getByRole("button", { name: "장바구니 담기" }).click();
  await page.locator("#memo").fill("never-send memo");
  await page.locator("#memo").press("Enter");
  await page.locator("input[name=password]").fill("never-send-password");
  await page.locator("input[name=password]").press("Tab");
  await page.locator("[data-private]").click();
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await expect(page.getByLabel("최근 동작 기록 첨부")).toBeChecked();
  await page.getByLabel("설명", { exact: true }).fill("결제가 안 됩니다");
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("rcpt_test");
  const report = requests.find((r) => r.method === "POST");
  const payload = payloadOf(report?.body);
  expect(payload.consent).toEqual({ environment: false, screenshot: false, activity: true });
  const items = payload.breadcrumbs as { t: number; type: string }[];
  expect(items.length).toBeGreaterThan(0);
  expect(items.length).toBeLessThanOrEqual(50);
  for (const { t } of items) expect(Number.isInteger(t) && t <= 0 && t >= -600000).toBe(true);
  const plain = items.map(({ t: _t, ...item }) => item);
  expect(plain).toEqual(
    expect.arrayContaining([
      { type: "navigation", path: "/cart" },
      { type: "navigation", path: "/checkout" },
      {
        type: "click",
        tag: "button",
        text: "장바구니 담기",
        testid: "add-cart",
        selector: '[data-testid="add-cart"]',
      },
      expect.objectContaining({ type: "request", method: "POST", path: "/api/cart", status: 200 }),
      expect.objectContaining({ type: "input", tag: "input", input_type: "text", length: 15 }),
      { type: "key", key: "Enter" },
      { type: "input", tag: "input", input_type: "password" },
    ]),
  );
  // No key events were recorded while the password field had focus.
  const keys = plain.filter((item) => item.type === "key");
  expect(keys).toEqual([{ type: "key", key: "Enter" }]);
  // The widget's own launcher and its API calls are not part of the trail.
  expect(JSON.stringify(plain)).not.toContain("버그 신고");
  expect(JSON.stringify(plain)).not.toContain("/api/v1/widget");
  const body = report?.body?.toString() ?? "";
  for (const secret of ["never-send", "private request body", "홍길동", "010-1234"])
    expect(body).not.toContain(secret);
});

test("sends no breadcrumbs when the reporter unchecks activity", async ({ page }) => {
  const requests = await mockWidget(page);
  await page.goto(SITE);
  await page.getByRole("button", { name: "장바구니 담기" }).click();
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("최근 동작 기록 첨부").uncheck();
  await page.getByLabel("설명", { exact: true }).fill("오류 설명");
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("rcpt_test");
  const payload = payloadOf(requests.find((r) => r.method === "POST")?.body);
  expect(payload.consent.activity).toBe(false);
  expect(payload).not.toHaveProperty("breadcrumbs");
});
