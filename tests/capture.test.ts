// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { maskedElements } from "../src/capture";

it("includes configured selectors and every editable field, aborting invalid selectors", () => {
  document.body.innerHTML =
    "<p data-private>private</p><input><textarea></textarea><select></select><div contenteditable>private</div><p>public</p>";
  expect(maskedElements(document, ["[data-private]"])).toHaveLength(5);
  expect(() => maskedElements(document, ["["])).toThrow();
});
