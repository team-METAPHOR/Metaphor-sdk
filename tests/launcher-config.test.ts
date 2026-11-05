// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readScriptConfig } from "../src/script-config";

function script(value?: string) {
  const element = document.createElement("script");
  element.dataset.metaphorProjectKey = "mpk_test";
  element.dataset.metaphorApiBase = "http://api.test";
  if (value !== undefined) element.dataset.metaphorShowLauncher = value;
  return element;
}

describe("manual launcher setting", () => {
  it.each(["false", " FALSE ", "False"])("reads %s as an explicit launcher opt-out", (value) => {
    expect(readScriptConfig(script(value))).toMatchObject({ showLauncher: false });
  });

  it.each([undefined, "true", "", "unexpected"])(
    "preserves the default launcher for %s",
    (value) => {
      expect(readScriptConfig(script(value))?.showLauncher).not.toBe(false);
    },
  );
});
