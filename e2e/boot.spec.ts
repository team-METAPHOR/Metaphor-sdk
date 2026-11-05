import { expect, test } from "@playwright/test";

const MOCK = "http://localhost:4200";

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__mock/reset`);
});

test("loads from the script tag and fetches config without cookies", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-metaphor-ready", "true");
  const calls = await (await request.get(`${MOCK}/__mock/requests`)).json();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    method: "GET",
    path: "/api/v1/widget/config",
    project_key: "mpk_harness",
    origin: "http://localhost:4100",
    cookie: null,
  });
});

test("stays inert when the widget is disabled", async ({ page, request }) => {
  await request.post(`${MOCK}/__mock/config`, { data: { widget_enabled: false } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).not.toHaveAttribute("data-metaphor-ready", "true");
  expect(errors).toEqual([]);
});
