import { afterEach, expect, it, vi } from "vitest";
import { fetchConfig, submitReport } from "../src/api";

const settings = { projectKey: "mpk_test", apiBase: "http://api.test" };
afterEach(() => vi.unstubAllGlobals());

it("ignores malformed config instead of mounting a partial widget", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ widget_enabled: true, reporting_enabled: true })),
      ),
  );
  expect(await fetchConfig(settings)).toBeNull();
});

it("does not treat malformed successful responses as receipts", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 201 })));
  expect(await submitReport(settings, new FormData(), "test-key")).toMatchObject({
    status: 502,
    code: "INVALID_RESPONSE",
  });
});

it("preserves rate-limit status when the response body cannot be parsed", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 429 })));
  expect(await submitReport(settings, new FormData(), "test-key")).toMatchObject({ status: 429 });
});
