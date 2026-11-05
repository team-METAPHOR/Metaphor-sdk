// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readScriptConfig } from "../src/script-config";

function tag(attrs: Record<string, string>): HTMLScriptElement {
  const script = document.createElement("script");
  for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value);
  return script;
}

describe("readScriptConfig", () => {
  it("reads key and api base, trimming the trailing slash", () => {
    const script = tag({
      "data-metaphor-project-key": "mpk_test",
      "data-metaphor-api-base": "http://localhost:8000/",
    });
    expect(readScriptConfig(script)).toEqual({
      projectKey: "mpk_test",
      apiBase: "http://localhost:8000",
    });
  });

  it("returns null when an attribute is missing", () => {
    expect(readScriptConfig(tag({ "data-metaphor-project-key": "mpk_test" }))).toBeNull();
    expect(readScriptConfig(null)).toBeNull();
  });
});
