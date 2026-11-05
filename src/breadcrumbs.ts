/**
 * Recent reporter actions (breadcrumbs), kept only in memory and sent only with
 * `consent.activity`. Never records input values, bodies, headers, cookies or URL queries.
 */
import type { Breadcrumb, BreadcrumbItem } from "./api";
import { isHttpMethod, isSdkScript, safeError, watchRequests } from "./detect";
import { redactText, sanitizePath } from "./privacy";

const KEEP = 100;
const SEND = 50;
const WINDOW = 600000;
const INTERACTIVE =
  "button,a,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],summary,label,input[type=button],input[type=submit],input[type=checkbox],input[type=radio]";
const FIELD = "input,textarea,select,[contenteditable]";
const KEYS = /^(?:Enter|Escape|Tab|Backspace|Arrow(?:Up|Down|Left|Right))$/;
const isSecret = (element: Element) =>
  element instanceof HTMLInputElement && /^(?:password|hidden|file)$/.test(element.type);
const TEXT_TYPES = /^(?:text|search|email|tel|url|number)$/;

type Fields = Record<string, string | number | boolean | undefined>;

/** Drops empty fields (callers cap lengths). */
function compact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined && value !== "") out[key] = value;
  return out;
}

const clean = (text: string | null | undefined) =>
  text ? redactText(text.replace(/\s+/g, " ").trim()).slice(0, 80) : undefined;

export function startBreadcrumbs(host: Element, maskSelectors: readonly string[], apiBase: string) {
  const items: { at: number; item: BreadcrumbItem; key: string }[] = [];
  const record = (item: BreadcrumbItem) => {
    const key = JSON.stringify(item);
    const last = items.at(-1);
    if (last?.key === key) last.at = Date.now();
    else items.push({ at: Date.now(), item, key });
    if (items.length > KEEP) items.shift();
  };
  const masked = (element: Element) =>
    [...maskSelectors, "[data-private]", "[data-sensitive]"].some((selector) => {
      try {
        return element.closest(selector) !== null;
      } catch {
        return true;
      }
    });
  // Visible text without field contents (textarea/select text is user data) or masked parts.
  const textOf = (element: Element): string => {
    let text = "";
    for (const node of element.childNodes)
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
      else if (node instanceof Element && !node.matches(FIELD) && !masked(node))
        text += ` ${textOf(node)}`;
    return text;
  };
  // Masked elements get a structural selector only: no ids, attribute values or text.
  const structural = (element: Element) => {
    const path: string[] = [];
    for (
      let node: Element | null = element;
      node && node.localName !== "body" && path.length < 4;
      node = node.parentElement
    ) {
      const siblings = node.parentElement?.children ?? [];
      const same = [...siblings].filter((other) => other.localName === node?.localName);
      path.unshift(
        same.length > 1
          ? `${node.localName}:nth-of-type(${same.indexOf(node) + 1})`
          : node.localName,
      );
    }
    return path.join(" > ");
  };
  const selectorOf = (element: Element, label?: string) => {
    const tag = element.localName;
    const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;
    const testid = clean(element.getAttribute("data-testid"));
    if (testid) return `[data-testid=${quote(testid)}]`;
    // Skip ids that look generated (React `:r1:`, hashes, long digit runs).
    const stable = (id: string) => /^[A-Za-z][\w-]{0,39}$/.test(id) && !/\d{3}/.test(id);
    if (stable(element.id)) return `#${element.id}`;
    if (label) return `${tag}[aria-label=${quote(label)}]`;
    const path = [tag];
    for (let node = element.parentElement; node && path.length < 4; node = node.parentElement) {
      if (stable(node.id)) {
        path.unshift(`#${node.id}`);
        break;
      }
      if (node.localName === "body") break;
      path.unshift(node.localName);
    }
    return path.join(" > ");
  };
  const locate = (element: Element, label?: string, hide?: boolean) =>
    hide
      ? { selector: structural(element).slice(0, 200) }
      : {
          testid: clean(element.getAttribute("data-testid")),
          selector: selectorOf(element, label).slice(0, 200),
        };
  const origin = (event: Event) => {
    const path = event.composedPath();
    if (path.includes(host)) return null;
    const target = path[0];
    return target instanceof Element ? target : null;
  };
  const listen = <K extends keyof DocumentEventMap>(
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
  ) =>
    document.addEventListener(
      type,
      (event) => {
        try {
          handler(event);
        } catch {
          return;
        }
      },
      true,
    );

  const navigate = () =>
    record({ type: "navigation", path: sanitizePath(location.pathname).slice(0, 512) });
  navigate();
  for (const name of ["pushState", "replaceState"] as const)
    history[name] = new Proxy(history[name], {
      apply(target, receiver, args) {
        const result: unknown = Reflect.apply(target, receiver, args);
        try {
          navigate();
        } catch {
          return result;
        }
        return result;
      },
    });
  for (const type of ["popstate", "hashchange"])
    window.addEventListener(type, () => {
      try {
        navigate();
      } catch {
        return;
      }
    });

  listen("click", (event) => {
    const element = origin(event)?.closest(INTERACTIVE);
    if (!element) return;
    const secret = masked(element) || isSecret(element);
    const hidden = secret || element.matches(FIELD) || element.closest("[contenteditable]");
    const aria = hidden ? undefined : clean(element.getAttribute("aria-label"));
    record({
      type: "click",
      ...compact({
        tag: element.localName,
        role: element.getAttribute("role")?.slice(0, 32),
        text: hidden ? undefined : (aria ?? clean(textOf(element))),
        ...locate(element, aria, secret),
      }),
    } as BreadcrumbItem);
  });

  listen("change", (event) => {
    const element = origin(event);
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      )
    )
      return;
    const type = element instanceof HTMLInputElement ? element.type : undefined;
    const base = { tag: element.localName, input_type: type?.slice(0, 32) };
    if (isSecret(element)) {
      record({ type: "input", ...compact(base) } as BreadcrumbItem);
      return;
    }
    const hide = masked(element);
    const aria = hide ? undefined : clean(element.getAttribute("aria-label"));
    const fieldLabel = element.labels?.[0];
    const label = hide
      ? undefined
      : (aria ??
        clean(fieldLabel ? textOf(fieldLabel) : undefined) ??
        clean(element.getAttribute("placeholder")) ??
        clean(element.getAttribute("name")));
    const option =
      element instanceof HTMLSelectElement ? element.options[element.selectedIndex] : undefined;
    record({
      type: "input",
      ...compact({
        ...base,
        label,
        ...locate(element, aria, hide),
        checked:
          element instanceof HTMLInputElement && /^(?:checkbox|radio)$/.test(element.type)
            ? element.checked
            : undefined,
        // Option names can be personal data: only for selects the site opts in.
        selected_text:
          option && !hide && element.closest("[data-metaphor-record]")
            ? clean(option.label || option.text)
            : undefined,
        length:
          element instanceof HTMLTextAreaElement || TEXT_TYPES.test(type ?? "")
            ? element.value.length
            : undefined,
      }),
    } as BreadcrumbItem);
  });

  listen("submit", (event) => {
    const form = origin(event);
    if (!(form instanceof HTMLFormElement)) return;
    const hide = masked(form);
    const aria = hide ? undefined : clean(form.getAttribute("aria-label"));
    record({
      type: "submit",
      ...compact({
        label: hide
          ? undefined
          : (aria ?? clean(form.getAttribute("name")) ?? clean(form.getAttribute("data-testid"))),
        ...locate(form, aria, hide),
      }),
    } as BreadcrumbItem);
  });

  listen("keydown", (event) => {
    const target = origin(event);
    if (!target || !KEYS.test(event.key)) return;
    if (target instanceof HTMLInputElement && target.type === "password") return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "password") return;
    record({ type: "key", key: event.key });
  });

  watchRequests((rawMethod, url, status, ms) => {
    const method = rawMethod.toUpperCase();
    const api = new URL(apiBase);
    if (
      url.origin !== location.origin ||
      !isHttpMethod(method) ||
      (url.origin === api.origin && url.pathname.startsWith(api.pathname.replace(/\/$/, "")))
    )
      return;
    record({
      type: "request",
      method,
      path: sanitizePath(url.pathname).slice(0, 512),
      ...(status > 0 ? { status } : {}),
      duration_ms: Math.max(0, Math.min(WINDOW, Math.round(ms))),
    });
  });

  const error = (message: string) => record({ type: "error", message: message.slice(0, 200) });
  window.addEventListener("error", (event) => {
    try {
      if (!(event instanceof ErrorEvent)) return;
      if (event.filename && isSdkScript(new URL(event.filename, location.href).pathname)) return;
      error(safeError(event.error));
    } catch {
      return;
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    try {
      error(safeError(event.reason));
    } catch {
      return;
    }
  });

  /** The newest items (≤ 50) within 10 minutes, `t` relative to `now`. */
  return (now = Date.now()): Breadcrumb[] =>
    items
      .filter(({ at }) => now - at <= WINDOW)
      .slice(-SEND)
      .map(({ at, item }) => ({ t: Math.min(0, Math.round(at - now)), ...item }));
}
