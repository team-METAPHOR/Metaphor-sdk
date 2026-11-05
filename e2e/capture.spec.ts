import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { defaultConfig, mockWidget, SITE } from "./mock";

test("uploads only a masked PNG and leaves the host inputs untouched", async ({
  page,
}, testInfo) => {
  const requests = await mockWidget(page);
  await page.goto(SITE);
  await page.locator("input[name=email]").fill("private@example.com");
  const points = await page.evaluate(() =>
    [
      ...document.querySelectorAll("[data-private], input, textarea, select, [contenteditable]"),
    ].map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: Math.floor(rect.x + 5), y: Math.floor(rect.y + 5) };
    }),
  );
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("마스킹된 스크린샷 전송에 동의합니다").check();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("rcpt_test");
  const report = requests.find((r) => r.method === "POST");
  const data = report?.body;
  if (!data) throw new Error("report missing");
  const start = data.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(start).toBeGreaterThan(0);
  const end = data.indexOf(Buffer.from([73, 69, 78, 68]), start) + 8;
  await writeFile(testInfo.outputPath("masked-viewport.png"), data.subarray(start, end));
  await testInfo.attach("masked-viewport", {
    body: data.subarray(start, end),
    contentType: "image/png",
  });
  const pixels = await page.evaluate(
    async ({ png, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas missing");
      context.drawImage(image, 0, 0);
      return points.map(({ x, y }) => [...context.getImageData(x, y, 1, 1).data]);
    },
    {
      png: data.subarray(start, end).toString("base64"),
      points,
    },
  );
  expect(pixels).toHaveLength(6);
  for (const pixel of pixels) expect(pixel).toEqual([0, 0, 0, 255]);
  expect(data.toString()).toContain('"screenshot":true');
  await expect(page.locator("input[name=email]")).toHaveValue("private@example.com");
});

test("does not upload a screenshot over the configured byte limit", async ({ page }) => {
  const config = defaultConfig();
  const requests = await mockWidget(page, {
    ...config,
    limits: { ...config.limits, max_screenshot_bytes: 1 },
  });
  await page.goto(SITE);
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("마스킹된 스크린샷 전송에 동의합니다").check();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("스크린샷을 준비하지 못했습니다");
  expect(requests.filter((r) => r.method === "POST")).toHaveLength(0);
});

test("aborts capture on an invalid selector without submitting", async ({ page }) => {
  const requests = await mockWidget(page, { ...defaultConfig(), mask_selectors: ["["] });
  await page.goto(SITE);
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await page.getByLabel("마스킹된 스크린샷 전송에 동의합니다").check();
  await page.getByRole("button", { name: "신고 보내기" }).click();
  await expect(page.getByRole("status")).toContainText("스크린샷을 준비하지 못했습니다");
  expect(requests.filter((r) => r.method === "POST")).toHaveLength(0);
});

test("hides screenshot consent when not allowed", async ({ page }) => {
  await mockWidget(page, { ...defaultConfig(), screenshot_allowed: false });
  await page.goto(SITE);
  await page.getByRole("button", { name: "버그 신고", exact: true }).click();
  await expect(page.getByLabel("마스킹된 스크린샷 전송에 동의합니다")).toHaveCount(0);
});
