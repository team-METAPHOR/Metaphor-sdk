import { expect, it } from "vitest";
import { httpFailure, safeError } from "../src/detect";

it("records only an allowed method, query-free path and 5xx status", () => {
  expect(
    httpFailure({
      method: "post",
      url: "https://shop.test/api/fail?token=secret#private",
      status: 502,
    }),
  ).toEqual({
    error_type: "http_5xx",
    error: { message: "HTTP 502", http: { method: "POST", path: "/api/fail", status: 502 } },
  });
  expect(httpFailure({ method: "TRACE", url: "https://shop.test/", status: 500 })).toBeNull();
  expect(httpFailure({ method: "GET", url: "https://shop.test/", status: 404 })).toBeNull();
});

it("does not copy arbitrary error messages or rejection objects", () => {
  expect(safeError(new TypeError("password=secret private@example.com"))).toBe("TypeError 발생");
  expect(safeError({ password: "secret" })).toBe("JavaScript 오류 발생");
});
