// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { buildPayload } from "../src/report";

it("omits environment without consent and removes URL queries and fragments", () => {
  const payload = buildPayload(
    { title: "버그", description: "설명", environment: false, screenshot: false },
    "http://shop.test/cart?token=secret#private",
  );
  expect(payload).toEqual({
    title: "버그",
    description: "설명",
    page_url: "http://shop.test/cart",
    error_type: "manual",
    consent: { environment: false, screenshot: false },
  });
});

it("redacts credential path segments from page_url", () => {
  const payload = buildPayload(
    { title: "버그", description: "설명", environment: false, screenshot: false },
    "https://shop.test/reset/opaque-reset-credential-0123456789?x=1",
  );
  expect(payload.page_url).toBe("https://shop.test/reset/:redacted");
});
