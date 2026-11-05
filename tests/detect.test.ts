import { expect, it } from "vitest";
import { httpFailure, isSdkScript, safeError, stackTop } from "../src/detect";

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

const pathOf = (url: string) => {
  const detection = httpFailure({ method: "GET", url, status: 500 });
  return detection && "http" in detection.error ? detection.error.http.path : undefined;
};

it("redacts credential path segments from HTTP failure paths", () => {
  expect(pathOf("https://shop.test/api/reset/opaque-reset-credential-0123456789?x=1")).toBe(
    "/api/reset/:redacted",
  );
  expect(pathOf("https://shop.test/api/products/42")).toBe("/api/products/42");
});

it("builds stack_top from a sanitized script URL", () => {
  expect(
    stackTop(
      "https://u:p@cdn.test/s/0123456789abcdef0123/app.js?v=1#x",
      10,
      5,
      "https://shop.test/",
    ),
  ).toBe("https://cdn.test/s/:redacted/app.js:10:5");
  expect(stackTop("/assets/index-BdK3x9aQ.js", 1, 2, "https://shop.test/x")).toBe(
    "https://shop.test/assets/index-BdK3x9aQ.js:1:2",
  );
  expect(stackTop("chrome-extension://abc/x.js", 1, 2, "https://shop.test/")).toBeUndefined();
});

it("recognizes the SDK's own latest and version-pinned script URLs", () => {
  expect(isSdkScript("/sdk/v1/metaphor.js")).toBe(true);
  expect(isSdkScript("/sdk/v1/metaphor-0.1.0.js")).toBe(true);
  expect(isSdkScript("/sdk/v1/metaphor-1.2.3-rc.1.js")).toBe(true);
  expect(isSdkScript("/assets/metaphor-helper.js")).toBe(false);
  expect(isSdkScript("/sdk/v1/metaphor-0.1.js")).toBe(false);
  expect(isSdkScript("/assets/app.js")).toBe(false);
  expect(isSdkScript("/sdk/v1/metaphor.js.map")).toBe(false);
});
