import { expect, it } from "vitest";
import { redactText } from "../src/privacy";

it("removes emails, explicit credentials and URL queries from report text", () => {
  const text = redactText(
    "검색 오류 private@example.com token=secret Authorization: Bearer abc123 https://shop.test/cart?session=secret#private",
  );
  expect(text).toContain("검색 오류");
  expect(text).not.toContain("private@example.com");
  expect(text).not.toContain("secret");
  expect(text).not.toContain("abc123");
});
