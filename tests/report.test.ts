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
