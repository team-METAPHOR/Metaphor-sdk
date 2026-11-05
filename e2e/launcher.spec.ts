import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { mockWidget, SITE } from "./mock";

async function withoutLauncher(page: Page) {
  const requests = await mockWidget(page);
  await page.route(`${SITE}/hidden-launcher`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: readFileSync("e2e/fixtures/site.html", "utf8").replace(
        'data-metaphor-project-key="mpk_test"',
        'data-metaphor-show-launcher="false" data-metaphor-project-key="mpk_test"',
      ),
    }),
  );
  await page.goto(`${SITE}/hidden-launcher`);
  const launch = page.getByRole("button", { name: "버그 신고", exact: true, includeHidden: true });
  await expect(launch).toHaveCount(1);
  await expect(launch).toBeHidden();
  return requests;
}

test("hides the permanent launcher while detected errors can still be reported", async ({
  page,
}) => {
  const requests = await withoutLauncher(page);
  await page.locator("#throw").click();
  await page.getByRole("button", { name: "오류가 감지되었습니다. 신고하기" }).click();
  expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("rcpt_test");
  const report = requests.find((request) => request.method === "POST");
  expect(report?.body?.toString()).toContain('"error_type":"js_error"');
  expect(report?.cookie).toBeNull();
});

test("keeps rage detection and user-submitted reporting with the launcher hidden", async ({
  page,
}) => {
  const requests = await withoutLauncher(page);
  const bounds = await page.locator("#sold-out").boundingBox();
  if (!bounds) throw new Error("disabled fixture missing");
  for (let i = 0; i < 3; i++) await page.mouse.click(bounds.x + 10, bounds.y + 10);
  await page.getByRole("button", { name: "반응이 없나요? 버그 신고하기" }).click();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("rcpt_test");
  const report = requests.find((request) => request.method === "POST");
  expect(report?.body?.toString()).toContain('"error_type":"manual"');
  expect(report?.cookie).toBeNull();
});
