import { describe, expect, it } from "vitest";
import { redactText, sanitizeUrl } from "../src/privacy";

it("removes emails, explicit credentials and URL queries from report text", () => {
  const text = redactText(
    "검색 오류 private@example.com token=secret Authorization: Bearer abc123 https://shop.test/cart?session=secret#private",
  );
  expect(text).toContain("검색 오류");
  expect(text).not.toContain("private@example.com");
  expect(text).not.toContain("secret");
  expect(text).not.toContain("abc123");
});

describe("sanitizeUrl", () => {
  it.each([
    ["https://shop.test/products/42", "https://shop.test/products/42"],
    ["https://shop.test/cart", "https://shop.test/cart"],
    ["https://shop.test/", "https://shop.test/"],
    ["https://shop.test/assets/index-BdK3x9aQ.js", "https://shop.test/assets/index-BdK3x9aQ.js"],
    ["https://shop.test/static/main.3f9a1b2c.js", "https://shop.test/static/main.3f9a1b2c.js"],
    ["https://shop.test/reset/abc?x=1#y", "https://shop.test/reset/:redacted"],
    [
      "https://shop.test/reset/opaque-reset-credential-0123456789?x=1",
      "https://shop.test/reset/:redacted",
    ],
    ["https://user:pass@shop.test/cart?a=1#b", "https://shop.test/cart"],
    ["https://shop.test/invite/s3cr3t/accept", "https://shop.test/invite/:redacted/accept"],
    ["https://shop.test/auth/callback/xyz", "https://shop.test/auth/callback/:redacted"],
    ["https://shop.test/account/password/hunter2", "https://shop.test/account/password/:redacted"],
    [
      "https://shop.test/orders/3f2b8c4e-1a2b-4c3d-9e8f-0123456789ab/items",
      "https://shop.test/orders/:redacted/items",
    ],
    ["https://shop.test/files/0123456789abcdef0123", "https://shop.test/files/:redacted"],
    [
      "https://shop.test/s/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM",
      "https://shop.test/s/:redacted",
    ],
    ["https://shop.test/d/Ab3dEf6hIj9kLm2nOp5qRs8t", "https://shop.test/d/:redacted"],
    ["https://shop.test/d/AbcdefGhijklMnopqrStuvwxYz", "https://shop.test/d/:redacted"],
    ["https://shop.test/d/k3y%2DAb3dEf6hIj9kLm2nOp5q", "https://shop.test/d/:redacted"],
    ["https://shop.test/d/%E0%A4%A", "https://shop.test/d/:redacted"],
    ["https://shop.test/cart;jsessionid=ABC123/view", "https://shop.test/cart/view"],
  ])("%s", (input, expected) => {
    expect(sanitizeUrl(input)).toBe(expected);
  });

  it("returns null for unparsable URLs", () => {
    expect(sanitizeUrl("not a url")).toBeNull();
  });
});

it("redacts opaque path segments of URLs inside report text", () => {
  expect(redactText("열기 https://shop.test/reset/opaque-reset-credential-0123456789 실패")).toBe(
    "열기 https://shop.test/reset/:redacted 실패",
  );
});
