// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { startBreadcrumbs } from "../src/breadcrumbs";

const API = "https://api.metaphor.test";
let host: HTMLElement;
let trail: ReturnType<typeof startBreadcrumbs>;
const seen = () => trail().map(({ t: _t, ...item }) => item);
const last = () => seen().at(-1);
const click = (element: Element) =>
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
const change = (element: Element) => element.dispatchEvent(new Event("change", { bubbles: true }));

beforeAll(() => {
  // A stub transport; the SDK wraps whatever fetch the page has.
  window.fetch = vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("down")
      ? Promise.reject(new TypeError("offline"))
      : new Response(null, { status: String(input).includes("fail") ? 503 : 200 }),
  ) as typeof fetch;
});

beforeEach(() => {
  history.replaceState(null, "", "/start");
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.attachShadow({ mode: "open" }).innerHTML = "<button>버그 신고</button>";
  document.body.append(host);
  trail = startBreadcrumbs(host, ["[data-mask]"], API);
});

afterEach(() => vi.useRealTimers());

it("records navigation paths without query or hash", () => {
  history.pushState(null, "", "/cart?token=secret#private");
  history.pushState(null, "", "/reset/opaque-reset-credential-0123456789");
  expect(seen()).toEqual([
    { type: "navigation", path: "/start" },
    { type: "navigation", path: "/cart" },
    { type: "navigation", path: "/reset/:redacted" },
  ]);
  expect(JSON.stringify(trail())).not.toContain("secret");
});

it("records clicks on the nearest interactive element with a stable selector", () => {
  document.body.innerHTML = `
    <button data-testid="add-cart"><span>장바구니 담기</span></button>
    <a id="checkout" href="#">결제</a>
    <div role="tab" aria-label="상세 정보"><i>i</i></div>
    <nav><ul><li><button id=":r1:">메뉴</button></li></ul></nav>
    <p>not interactive</p>`;
  click(document.querySelector("span") as Element);
  expect(last()).toEqual({
    type: "click",
    tag: "button",
    text: "장바구니 담기",
    testid: "add-cart",
    selector: '[data-testid="add-cart"]',
  });
  click(document.querySelector("#checkout") as Element);
  expect(last()).toEqual({ type: "click", tag: "a", text: "결제", selector: "#checkout" });
  click(document.querySelector("i") as Element);
  expect(last()).toEqual({
    type: "click",
    tag: "div",
    role: "tab",
    text: "상세 정보",
    selector: 'div[aria-label="상세 정보"]',
  });
  click(document.querySelector("nav button") as Element);
  expect(last()).toMatchObject({ text: "메뉴", selector: "nav > ul > li > button" });
  const before = trail().length;
  click(document.querySelector("p") as Element);
  expect(trail()).toHaveLength(before);
});

it("omits text for fields and masked areas and never reads values", () => {
  document.body.innerHTML = `
    <input type="checkbox" id="agree" value="secret-value">
    <label>메모 <textarea>secret notes</textarea><select><option>secret choice</option></select></label>
    <div data-mask><button>홍길동 010-1234-5678</button></div>
    <div data-private><a href="#">private@example.com</a></div>`;
  click(document.querySelector("#agree") as Element);
  expect(seen()).toContainEqual({ type: "click", tag: "input", selector: "#agree" });
  click(document.querySelector("label") as Element);
  expect(last()).toMatchObject({ tag: "label", text: "메모" });
  click(document.querySelector("[data-mask] button") as Element);
  expect(last()).toEqual({
    type: "click",
    tag: "button",
    selector: "div:nth-of-type(1) > button",
  });
  click(document.querySelector("[data-private] a") as Element);
  expect(last()).not.toHaveProperty("text");
  const json = JSON.stringify(trail());
  for (const secret of ["secret", "홍길동", "010-1234", "private@example.com"])
    expect(json).not.toContain(secret);
});

it("ignores clicks, keys and changes inside the SDK's own widget", () => {
  const before = trail().length;
  const button = host.shadowRoot?.querySelector("button") as Element;
  click(button);
  button.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
  );
  expect(trail()).toHaveLength(before);
});

it("records input changes as metadata only", () => {
  document.body.innerHTML = `
    <label for="email">이메일</label><input id="email" type="email" data-testid="email">
    <input type="password" name="pw" placeholder="비밀번호">
    <input type="hidden" name="csrf">
    <input type="checkbox" aria-label="약관 동의">
    <select name="size"><option>S</option><option selected>XL</option></select>
    <div data-metaphor-record><select name="color"><option>파랑</option><option selected>빨강</option></select></div>
    <select data-sensitive name="card"><option selected>신한 1234</option></select>
    <textarea placeholder="요청 사항"></textarea>`;
  const email = document.querySelector("#email") as HTMLInputElement;
  email.value = "private@example.com";
  change(email);
  expect(last()).toEqual({
    type: "input",
    tag: "input",
    input_type: "email",
    label: "이메일",
    testid: "email",
    selector: '[data-testid="email"]',
    length: 19,
  });
  const password = document.querySelector("[type=password]") as HTMLInputElement;
  password.value = "hunter2";
  change(password);
  expect(last()).toEqual({ type: "input", tag: "input", input_type: "password" });
  change(document.querySelector("[type=hidden]") as Element);
  expect(last()).toEqual({ type: "input", tag: "input", input_type: "hidden" });
  const box = document.querySelector("[type=checkbox]") as HTMLInputElement;
  box.checked = true;
  change(box);
  expect(last()).toMatchObject({ input_type: "checkbox", label: "약관 동의", checked: true });
  change(document.querySelector("[name=size]") as Element);
  expect(last()).toMatchObject({ tag: "select", label: "size" });
  expect(last()).not.toHaveProperty("selected_text");
  change(document.querySelector("[name=color]") as Element);
  expect(last()).toMatchObject({ tag: "select", label: "color", selected_text: "빨강" });
  change(document.querySelector("[name=card]") as Element);
  expect(last()).toEqual({ type: "input", tag: "select", selector: "select:nth-of-type(2)" });
  const notes = document.querySelector("textarea") as HTMLTextAreaElement;
  notes.value = "문 앞에 놔주세요";
  change(notes);
  expect(last()).toMatchObject({ tag: "textarea", label: "요청 사항", length: 9 });
  const json = JSON.stringify(trail());
  for (const secret of ["private@example.com", "hunter2", "pw", "신한", "문 앞", "XL"])
    expect(json).not.toContain(secret);
});

it("records form submits and allowed keys, but no keys in password fields", () => {
  document.body.innerHTML = `
    <form aria-label="로그인"><input id="user"><input id="pw" type="password"></form>`;
  const form = document.querySelector("form") as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true }));
  expect(last()).toEqual({
    type: "submit",
    label: "로그인",
    selector: 'form[aria-label="로그인"]',
  });
  const key = (id: string, value: string) =>
    document
      .getElementById(id)
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
  key("user", "a");
  key("user", "Enter");
  expect(last()).toEqual({ type: "key", key: "Enter" });
  key("user", "ArrowDown");
  expect(last()).toEqual({ type: "key", key: "ArrowDown" });
  const before = trail().length;
  (document.getElementById("pw") as HTMLInputElement).focus();
  key("pw", "Backspace");
  key("pw", "Enter");
  expect(trail()).toHaveLength(before);
  expect(seen().some((item) => item.type === "key" && item.key === "a")).toBe(false);
});

it("records same-origin requests with path, status and duration, skipping the API", async () => {
  await fetch(`${location.origin}/api/cart?token=secret`, { method: "post" });
  expect(last()).toMatchObject({ type: "request", method: "POST", path: "/api/cart", status: 200 });
  expect(Number.isInteger((last() as { duration_ms: number }).duration_ms)).toBe(true);
  await fetch("/api/fail");
  expect(last()).toMatchObject({ method: "GET", path: "/api/fail", status: 503 });
  await fetch("/api/down").catch(() => undefined);
  expect(last()).toEqual({ type: "request", method: "GET", path: "/api/down", duration_ms: 0 });
  const before = trail().length;
  await fetch(`${API}/api/v1/widget/reports?project_key=x`);
  await fetch("https://other.test/collect");
  expect(trail()).toHaveLength(before);
  expect(JSON.stringify(trail())).not.toContain("secret");
});

it("records uncaught errors by kind only", () => {
  window.dispatchEvent(
    new ErrorEvent("error", { error: new TypeError("password=secret"), filename: "/app.js" }),
  );
  expect(last()).toEqual({ type: "error", message: "TypeError 발생" });
  window.dispatchEvent(
    new ErrorEvent("error", { error: new Error("x"), filename: "/sdk/v1/metaphor.js" }),
  );
  expect(last()).toEqual({ type: "error", message: "TypeError 발생" });
});

it("keeps 100, sends the newest 50 within 10 minutes and dedupes repeats", () => {
  vi.useFakeTimers({ now: 1_000_000 });
  trail = startBreadcrumbs(host, [], API);
  document.body.innerHTML = '<button id="a">A</button><button id="b">B</button>';
  click(document.querySelector("#a") as Element);
  click(document.querySelector("#a") as Element);
  expect(seen().filter((item) => item.type === "click")).toHaveLength(1);
  vi.advanceTimersByTime(600_001);
  for (let i = 0; i < 120; i++) click(document.querySelector(i % 2 ? "#a" : "#b") as Element);
  vi.advanceTimersByTime(250);
  const sent = trail();
  expect(sent).toHaveLength(50);
  expect(sent.every(({ t }) => Number.isInteger(t) && t <= 0 && t >= -600_000)).toBe(true);
  expect(sent.at(-1)?.t).toBe(-250);
  expect(trail(Date.now() + 600_000)).toHaveLength(0);
});

it("gives masked and secret elements a structural selector without testid or ids", () => {
  document.body.innerHTML = `
    <section data-private>
      <button data-testid="user-kim" id="kim" aria-label="김철수">a</button>
      <button data-testid="user-lee" id="lee">b</button>
    </section>
    <input type="password" id="pw" data-testid="pw-field">
    <form data-sensitive name="card-form" data-testid="card"><button>pay</button></form>
    <button data-testid="mail private@example.com">c</button>`;
  click(document.querySelector("#lee") as Element);
  expect(last()).toEqual({
    type: "click",
    tag: "button",
    selector: "section > button:nth-of-type(2)",
  });
  change(document.querySelector("#pw") as Element);
  expect(last()).toEqual({ type: "input", tag: "input", input_type: "password" });
  document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true }));
  expect(last()).toEqual({ type: "submit", selector: "form" });
  click(document.querySelector("body > button") as Element);
  expect(last()).toMatchObject({ testid: "mail [이메일]" });
  const json = JSON.stringify(trail());
  for (const secret of ["kim", "lee", "김철수", "pw-field", "card", "private@example.com"])
    expect(json).not.toContain(secret);
});

it("redacts personal data in navigation and request paths", async () => {
  history.pushState(null, "", "/users/kim@example.com/orders/1234567");
  history.pushState(null, "", `/members/${encodeURIComponent("홍길동")}/products/1`);
  await fetch("/api/phones/01012345678");
  expect(seen()).toEqual(
    expect.arrayContaining([
      { type: "navigation", path: "/users/:redacted/orders/:redacted" },
      { type: "navigation", path: "/members/:redacted/products/1" },
      expect.objectContaining({ type: "request", path: "/api/phones/:redacted" }),
    ]),
  );
});
