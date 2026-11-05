import { expect, test } from "@playwright/test";
import { mockWidget, SITE } from "./mock";

test("offers a manual report for three pointerdowns on a disabled button", async ({ page }) => {
  const requests = await mockWidget(page);
  await page.goto(SITE);
  const bounds = await page.locator("#sold-out").boundingBox();
  if (!bounds) throw new Error("disabled fixture missing");
  for (let i = 0; i < 3; i++) await page.mouse.click(bounds.x + 10, bounds.y + 10);
  await page.getByRole("button", { name: "반응이 없나요? 버그 신고하기" }).click();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("rcpt_test");
  const body = requests.find((r) => r.method === "POST")?.body?.toString() ?? "";
  expect(body).toContain('"error_type":"manual"');
  expect(body).not.toContain('"error":');
  expect(body).not.toContain("coordinates");
  expect(body).not.toContain("clientX");
});

test("does not prompt for slow or distant pointerdowns", async ({ page }) => {
  await page.clock.install();
  await mockWidget(page);
  await page.goto(SITE);
  await page.mouse.click(20, 20);
  await page.clock.fastForward(1100);
  await page.mouse.click(20, 20);
  await page.mouse.click(200, 200);
  await expect(page.getByRole("button", { name: "반응이 없나요? 버그 신고하기" })).toBeHidden();
});
