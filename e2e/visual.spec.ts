import { expect, test } from "@playwright/test";
import { mockWidget, SITE } from "./mock";

for (const width of [320, 390, 1440])
  for (const colorScheme of ["light", "dark"] as const) {
    test(`panel reflows and preserves keyboard access at ${width}px ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await mockWidget(page);
      await page.goto(SITE);
      const launch = page.getByRole("button", { name: "버그 신고", exact: true });
      await launch.focus();
      await page.keyboard.press("Enter");
      const title = page.getByLabel("제목", { exact: true });
      await expect(title).toBeFocused();
      expect(await title.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      const panel = page.getByRole("dialog");
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("panel.png") });
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("button", { name: "신고 보내기" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(title).toBeFocused();
      const controls = [
        page.getByLabel("설명", { exact: true }),
        page.getByLabel("브라우저 환경 정보 전송에 동의합니다"),
        page.getByLabel("마스킹된 스크린샷 전송에 동의합니다"),
        page.getByRole("button", { name: "취소" }),
        page.getByRole("button", { name: "신고 보내기" }),
      ];
      for (const control of controls) {
        await page.keyboard.press("Tab");
        await expect(control).toBeFocused();
        expect(await control.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      }
      await page.keyboard.press("Tab");
      await expect(title).toBeFocused();
      await page.getByLabel("설명", { exact: true }).fill("검색 결과가 표시되지 않습니다.");
      const submit = page.getByRole("button", { name: "신고 보내기" });
      const before = await submit.boundingBox();
      await submit.click();
      await expect(page.getByRole("status")).toContainText("접수되었습니다");
      const after = await submit.boundingBox();
      expect(after?.width).toBe(before?.width);
      expect(after?.height).toBe(before?.height);
      await page.screenshot({ path: testInfo.outputPath("received.png") });
      await page.keyboard.press("Escape");
      await expect(launch).toBeFocused();
    });
  }
