import { expect, test } from "@playwright/test";
import { API, defaultConfig, mockWidget, SITE } from "./mock";

test("short report includes observed clicks and feedback only with separate consent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const requests = await mockWidget(page, { ...defaultConfig(), activity_allowed: true });
  await page.goto(`${SITE}/products/2?token=never-send`);
  await expect(page.getByRole("button", { name: "버그 신고", exact: true })).toBeVisible();
  await page.getByTestId("add-to-cart").click();
  await page.getByTestId("increase").click();
  await expect(page.locator("#notice")).toHaveText("수량 확인 완료");
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("설명", { exact: true }).fill("이거 안돼요");
  await page.getByLabel("최근 2분의 클릭·화면 이동·안내 문구 전송에 동의합니다").check();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("접수되었습니다");
  const body = requests.find((request) => request.method === "POST")?.body?.toString() ?? "";
  const payload = JSON.parse(body.split("\r\n\r\n")[1]?.split("\r\n--")[0] ?? "{}");
  expect(payload.description).toBe("이거 안돼요");
  expect(
    payload.activity.events.map((event: { kind: string; path: string }) => [
      event.kind,
      event.path,
    ]),
  ).toEqual([
    ["navigation", "/products/2"],
    ["click", "/products/2"],
    ["navigation", "/cart"],
    ["click", "/cart"],
  ]);
  expect(payload.activity.events.at(-1)).toMatchObject({
    selector: '[data-testid="increase"]',
    label: "수량 늘리기",
    feedback: ["수량 확인 완료"],
  });
  expect(body).not.toContain("never-send");
  expect(body).not.toContain('"environment":{');
  expect(body).not.toContain('filename="screenshot.png"');
  expect(body).not.toContain('신고 보내기","feedback');
});

test("omits activity when consent is unchecked even with collection enabled", async ({ page }) => {
  const requests = await mockWidget(page, { ...defaultConfig(), activity_allowed: true });
  await page.goto(SITE);
  await page.getByTestId("increase").click();
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("설명", { exact: true }).fill("이거 안돼요");
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("접수되었습니다");
  expect(requests.find((request) => request.method === "POST")?.body?.toString()).not.toContain(
    '"activity"',
  );
});

test("retries with the same frozen activity and idempotency key after time passes", async ({
  page,
}) => {
  await page.clock.install();
  await mockWidget(page, { ...defaultConfig(), activity_allowed: true });
  const sent: { key: string | undefined; payload: string }[] = [];
  await page.route(`${API}/api/v1/widget/reports?**`, (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": SITE,
          "access-control-allow-headers": "Idempotency-Key",
          "access-control-allow-methods": "POST",
        },
      });
    sent.push({
      key: request.headers()["idempotency-key"],
      payload: request.postData()?.split("\r\n\r\n")[1]?.split("\r\n--")[0] ?? "",
    });
    return route.fulfill({
      status: sent.length === 1 ? 503 : 201,
      headers: { "access-control-allow-origin": SITE },
      json:
        sent.length === 1
          ? { error: { code: "UNAVAILABLE" } }
          : { status: "received", receipt_id: "rcpt_retry" },
    });
  });
  await page.goto(SITE);
  await expect(page.getByRole("button", { name: "버그 신고", exact: true })).toBeVisible();
  await page.getByTestId("increase").click();
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("설명", { exact: true }).fill("이거 안돼요");
  await page.getByLabel("최근 2분의 클릭·화면 이동·안내 문구 전송에 동의합니다").check();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("전송하지 못했습니다");
  await page.clock.fastForward(35000);
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("rcpt_retry");
  expect(sent).toHaveLength(2);
  expect(sent[0]).toEqual(sent[1]);
  expect(JSON.parse(sent[0]?.payload ?? "{}").activity.events.at(-1).kind).toBe("click");
});
