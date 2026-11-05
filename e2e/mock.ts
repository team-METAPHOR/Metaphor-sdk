// Serves the fixture site and a mock widget API through Playwright route interception, so tests
// need no servers. Site and API use different origins, like a real customer page.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

export const SITE = "http://shop.test";
export const API = "http://api.test";

export interface RecordedRequest {
  method: string;
  path: string;
  projectKey: string | null;
  origin: string | null;
  cookie: string | null;
  contentType: string | null;
  body: Buffer | null;
}

export function defaultConfig() {
  return {
    widget_enabled: true,
    reporting_enabled: true,
    screenshot_allowed: true,
    auto_detect: { enabled: true, js_error: true, unhandled_rejection: true, http_5xx: true },
    limits: { max_screenshot_bytes: 4194304, max_description: 8000, max_mask_boxes: 20 },
    mask_selectors: ["[data-private]", "[data-sensitive]", "input[type=password]"],
  };
}

/** Routes SITE and API for `page`; returns the list of API requests the SDK made. */
export async function mockWidget(page: Page, config = defaultConfig()): Promise<RecordedRequest[]> {
  const requests: RecordedRequest[] = [];
  await page.route(`${SITE}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/sdk/metaphor.js") {
      return route.fulfill({
        contentType: "text/javascript",
        body: readFileSync("dist/metaphor.js"),
      });
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: readFileSync("e2e/fixtures/site.html", "utf8"),
    });
  });
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = await request.allHeaders();
    // Mirrors the backend: CORS only for the registered origin, never credentials.
    const cors = { "access-control-allow-origin": SITE, vary: "Origin" };
    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: { ...cors, "access-control-allow-headers": "Idempotency-Key" },
      });
    }
    requests.push({
      method: request.method(),
      path: url.pathname,
      projectKey: url.searchParams.get("project_key"),
      origin: headers.origin ?? null,
      cookie: headers.cookie ?? null,
      contentType: headers["content-type"] ?? null,
      body: request.postDataBuffer(),
    });
    if (url.pathname === "/api/v1/widget/config")
      return route.fulfill({ headers: cors, json: config });
    if (url.pathname === "/api/v1/widget/reports") {
      return route.fulfill({
        status: 201,
        headers: cors,
        json: { receipt_id: "rcpt_test", status: "received" },
      });
    }
    return route.fulfill({ status: 404, headers: cors, json: { error: { code: "NOT_FOUND" } } });
  });
  return requests;
}
