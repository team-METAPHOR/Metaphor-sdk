import { redactText, sanitizePath } from "./privacy";

export interface ActivityEvent {
  kind: "navigation" | "click";
  path: string;
  age_ms: number;
  selector?: string;
  label?: string;
  feedback?: string[];
}
export interface RecentActivity {
  version: 1;
  truncated: boolean;
  events: ActivityEvent[];
}

const PRIVATE = "input,textarea,select,[contenteditable],[data-metaphor-mask],[data-private]";
const AUTH =
  /\/(?:login|logout|signin|sign-in|signup|auth|oauth|reset|password|token|session)(?:\/|$)/i;

/** 메모리에만 보관하고, 신고창을 열 때 고정한 복사본만 전송합니다. */
export function startActivity(host: HTMLElement, masks: readonly string[]) {
  let active = true;
  let truncated = false;
  let previous = "";
  let events: { at: number; event: Omit<ActivityEvent, "age_ms"> }[] = [];
  let lastClick: (typeof events)[number] | undefined;
  const privateSelector = [PRIVATE, ...masks].join(",");
  const empty = (): RecentActivity => ({ version: 1, truncated, events: [] });
  try {
    document.querySelector(privateSelector);
  } catch {
    truncated = true;
    return { snapshot: empty, stop: () => undefined };
  }
  const privateElement = (element: Element): boolean =>
    element === host || host.contains(element) || !!element.closest(privateSelector);
  const path = () => {
    const raw = location.pathname;
    const safe = sanitizePath(raw);
    return safe === raw && !AUTH.test(safe) && !/[?#\\]/.test(safe) && safe.length <= 512
      ? safe
      : null;
  };
  const prune = () => {
    const since = Date.now() - 120000;
    while (events.length && ((events[0]?.at ?? Infinity) < since || events.length > 20)) {
      events.shift();
      truncated = true;
    }
  };
  const route = () => {
    if (!active) return;
    const current = path();
    if (current === previous) return;
    previous = current ?? "";
    lastClick = undefined;
    if (current) events.push({ at: Date.now(), event: { kind: "navigation", path: current } });
    else truncated = true;
    prune();
  };
  const selector = (element: Element) => {
    const parts: string[] = [];
    let node: Element | null = element;
    while (node && node !== document.documentElement && parts.length < 8) {
      const id = node.getAttribute("data-testid");
      if (id && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id) && sanitizePath(`/${id}`) === `/${id}`) {
        const anchor = `[data-testid="${id}"]`;
        if (document.querySelectorAll(anchor).length === 1) {
          parts.unshift(anchor);
          break;
        }
      }
      const tag = node.localName;
      if (!/^[a-z][a-z0-9]*$/.test(tag)) return null;
      const index = node.parentElement
        ? [...node.parentElement.children]
            .filter((child) => child.localName === tag)
            .indexOf(node) + 1
        : 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      node = node.parentElement;
    }
    const value = parts.join(" > ");
    return value.length <= 256 && document.querySelectorAll(value).length === 1 ? value : null;
  };
  const publicText = (element: Element, max: number) => {
    if (privateElement(element)) return "";
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = "";
    let node = walker.nextNode();
    while (node && text.length < 1000) {
      const parent = node.parentElement;
      if (
        parent &&
        !privateElement(parent) &&
        !parent.closest('script,style,[hidden],[aria-hidden="true"]')
      )
        text += node.textContent ?? "";
      node = walker.nextNode();
    }
    return redactText(text).replace(/\s+/g, " ").trim().slice(0, max);
  };
  const click = (event: MouseEvent) => {
    try {
      if (!active || event.button !== 0 || event.composedPath().includes(host)) return;
      route();
      const current = path();
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest('button,a,[role="button"],[role="link"]');
      if (!current || !target || privateElement(target) || !button || privateElement(button))
        return;
      const stable = selector(button);
      if (!stable) {
        truncated = true;
        return;
      }
      const label = redactText(button.getAttribute("aria-label") ?? publicText(button, 80)).slice(
        0,
        80,
      );
      lastClick = {
        at: Date.now(),
        event: { kind: "click", path: current, selector: stable, label, feedback: [] },
      };
      events.push(lastClick);
      prune();
    } catch {
      truncated = true;
    }
  };
  const observer = new MutationObserver((mutations) => {
    try {
      if (
        !active ||
        !lastClick ||
        Date.now() - lastClick.at > 1000 ||
        path() !== lastClick.event.path
      )
        return;
      for (const mutation of mutations) {
        const element =
          mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (!element || privateElement(element)) continue;
        const candidates = new Set<Element>();
        const live = element.closest(
          '[role="status"],[role="alert"],[aria-live="polite"],[aria-live="assertive"]',
        );
        if (live) candidates.add(live);
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches(
              '[role="status"],[role="alert"],[aria-live="polite"],[aria-live="assertive"]',
            )
          )
            candidates.add(node);
          node
            .querySelectorAll(
              '[role="status"],[role="alert"],[aria-live="polite"],[aria-live="assertive"]',
            )
            .forEach((item) => {
              candidates.add(item);
            });
        }
        for (const candidate of candidates) {
          if (candidate.closest('[hidden],[aria-hidden="true"]')) continue;
          const text = publicText(candidate, 120);
          const feedback = lastClick.event.feedback ?? [];
          if (text && !feedback.includes(text) && feedback.length < 2)
            lastClick.event.feedback = [...feedback, text];
        }
      }
    } catch {
      truncated = true;
    }
  });
  document.addEventListener("click", click, true);
  window.addEventListener("popstate", route);
  window.addEventListener("hashchange", route);
  const timer = setInterval(() => {
    try {
      route();
      prune();
    } catch {
      truncated = true;
    }
  }, 500);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  route();
  return {
    snapshot(): RecentActivity {
      if (!active) return empty();
      try {
        route();
        prune();
        const now = Date.now();
        const result: RecentActivity = {
          version: 1,
          truncated,
          events: events.map(({ at, event }) => ({
            ...event,
            ...(event.feedback ? { feedback: [...event.feedback] } : {}),
            age_ms: Math.max(0, Math.min(120000, now - at)),
          })),
        };
        while (new TextEncoder().encode(JSON.stringify(result)).length > 8192) {
          result.events.shift();
          result.truncated = true;
        }
        return result;
      } catch {
        truncated = true;
        return empty();
      }
    },
    stop() {
      active = false;
      events = [];
      lastClick = undefined;
      clearInterval(timer);
      observer.disconnect();
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", route);
      window.removeEventListener("hashchange", route);
    },
  };
}
