// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { startActivity } from "../src/activity";
import { buildPayload } from "../src/report";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

it("records ordered clicks, safe selectors, route changes and post-click feedback", async () => {
  history.replaceState({}, "", "/products/2?token=secret");
  document.body.innerHTML = '<button data-testid="add">담기</button><p role="status"></p>';
  const host = document.createElement("div");
  const collector = startActivity(host, []);
  document.querySelector("button")?.click();
  const status = document.querySelector("p");
  if (status) status.textContent = "장바구니 담기 완료";
  await new Promise((resolve) => setTimeout(resolve, 0));
  history.pushState({}, "", "/cart#secret");
  const data = collector.snapshot();
  expect(data.events.map((event) => event.kind)).toEqual(["navigation", "click", "navigation"]);
  expect(data.events[1]).toMatchObject({
    selector: '[data-testid="add"]',
    label: "담기",
    feedback: ["장바구니 담기 완료"],
  });
  expect(JSON.stringify(data)).not.toContain("secret");
  collector.stop();
});

it("excludes input values, sensitive elements, widget UI and unsafe mask configuration", () => {
  history.replaceState({}, "", "/cart");
  document.body.innerHTML =
    '<input value="secret"><div data-private><button>private</button></div><button data-testid="ok">확인</button>';
  const host = document.createElement("div");
  host.innerHTML = "<button>sdk</button>";
  document.body.append(host);
  const collector = startActivity(host, ["[data-private]"]);
  document.querySelectorAll("button,input").forEach((element) => {
    (element as HTMLElement).click();
  });
  expect(collector.snapshot().events.filter((event) => event.kind === "click")).toHaveLength(1);
  expect(JSON.stringify(collector.snapshot())).not.toMatch(/private|secret|sdk/);
  collector.stop();
  const disabled = startActivity(host, ["["]);
  document.querySelectorAll("button").forEach((element) => {
    element.click();
  });
  expect(disabled.snapshot().events).toEqual([]);
  disabled.stop();
});

it("limits retained age, count and bytes and stops completely", () => {
  vi.useFakeTimers();
  history.replaceState({}, "", "/cart");
  document.body.innerHTML = '<button data-testid="increase">+</button>';
  const collector = startActivity(document.createElement("div"), []);
  for (let i = 0; i < 30; i++) document.querySelector("button")?.click();
  expect(collector.snapshot().events.length).toBeLessThanOrEqual(20);
  expect(collector.snapshot().truncated).toBe(true);
  expect(new TextEncoder().encode(JSON.stringify(collector.snapshot())).length).toBeLessThanOrEqual(
    8192,
  );
  vi.advanceTimersByTime(120001);
  expect(collector.snapshot().events).toEqual([]);
  collector.stop();
  document.querySelector("button")?.click();
  expect(collector.snapshot().events).toEqual([]);
});

it("sends the frozen activity only with separate consent", () => {
  const activity = { version: 1 as const, truncated: false, events: [] };
  const draft = { title: "", description: "이거 안돼요", environment: false, screenshot: false };
  expect(buildPayload(draft, "https://shop.test/cart", undefined, activity)).not.toHaveProperty(
    "activity",
  );
  const payload = buildPayload(
    { ...draft, activity: true },
    "https://shop.test/cart",
    undefined,
    activity,
  );
  expect(payload.activity).toEqual(activity);
  expect(payload.consent.activity).toBe(true);
});

it("distinguishes duplicate button ids and excludes masked descendants from labels", () => {
  history.replaceState({}, "", "/cart");
  document.body.innerHTML =
    '<section data-testid="cart"><div><button data-testid="plus">+<span data-private>private</span></button></div><div><button data-testid="plus">+</button></div></section>';
  const collector = startActivity(document.createElement("div"), ["[data-private]"]);
  document.querySelectorAll("button").forEach((button) => {
    button.click();
  });
  const clicks = collector.snapshot().events.filter((event) => event.kind === "click");
  expect(clicks[0]?.selector).not.toBe(clicks[1]?.selector);
  for (const click of clicks) {
    expect(document.querySelectorAll(click.selector ?? "invalid")).toHaveLength(1);
    expect(click.label).toBe("+");
  }
  collector.stop();
});

it("does not collect authentication routes and freezes nested feedback arrays", async () => {
  history.replaceState({}, "", "/login/secret");
  document.body.innerHTML = '<button data-testid="ok">확인</button><p role="status"></p>';
  const collector = startActivity(document.createElement("div"), []);
  document.querySelector("button")?.click();
  expect(collector.snapshot().events).toEqual([]);
  history.replaceState({}, "", "/cart");
  document.querySelector("button")?.click();
  const status = document.querySelector("p");
  if (status) status.textContent = "완료";
  await new Promise((resolve) => setTimeout(resolve, 0));
  const snapshot = collector.snapshot();
  const frozen = JSON.stringify(snapshot);
  if (status) status.textContent = "나중 안내";
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(JSON.stringify(snapshot)).toBe(frozen);
  collector.stop();
});
