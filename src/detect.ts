import type { AutomaticReport, HttpMethod, WidgetConfig } from "./api";
import { sanitizePath, sanitizeUrl } from "./privacy";

export type Detection = AutomaticReport;

export function isHttpMethod(method: string): method is HttpMethod {
  return ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(method);
}

export function safeError(reason: unknown): string {
  const names = [
    "Error",
    "TypeError",
    "ReferenceError",
    "RangeError",
    "SyntaxError",
    "URIError",
    "EvalError",
  ];
  return reason instanceof Error && names.includes(reason.name)
    ? `${reason.name} 발생`
    : "JavaScript 오류 발생";
}

export function httpFailure(info: {
  readonly method: string;
  readonly url: string;
  readonly status: number;
}): Detection | null {
  const method = info.method.toUpperCase();
  if (info.status < 500 || info.status > 599 || !isHttpMethod(method)) return null;
  try {
    const path = sanitizePath(new URL(info.url).pathname);
    if (path.length > 2048) return null;
    return {
      error_type: "http_5xx",
      error: { message: `HTTP ${info.status}`, http: { method, path, status: info.status } },
    };
  } catch {
    return null;
  }
}

// The SDK is served as `/sdk/v1/metaphor.js` (latest) or `/sdk/v1/metaphor-<semver>.js` (pinned).
const SDK_SCRIPT = /\/metaphor(?:-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)?\.js$/;

export function isSdkScript(pathname: string): boolean {
  return SDK_SCRIPT.test(pathname);
}

export function stackTop(
  filename: string,
  lineno: number,
  colno: number,
  base: string,
): string | undefined {
  const source = new URL(filename, base);
  if (source.protocol !== "https:" && source.protocol !== "http:") return undefined;
  const suffix = `:${lineno}:${colno}`;
  return `${(sanitizeUrl(source.href) ?? "").slice(0, 300 - suffix.length)}${suffix}`;
}

export function startDetection(
  config: WidgetConfig,
  apiBase: string,
  offer: (detection: Detection) => void,
) {
  let enabled = config.auto_detect.enabled;
  let nextPrompt = 0;
  const prompt = (detection: Detection) => {
    if (!enabled || Date.now() < nextPrompt) return;
    nextPrompt = Date.now() + 60000;
    try {
      offer(detection);
    } catch {
      enabled = false;
    }
  };
  if (!enabled)
    return () => {
      enabled = false;
    };
  if (config.auto_detect.js_error)
    window.addEventListener("error", (event) => {
      try {
        if (!(event instanceof ErrorEvent)) return;
        let stack_top: string | undefined;
        if (event.filename) {
          const source = new URL(event.filename, location.href);
          if (isSdkScript(source.pathname)) return;
          stack_top = stackTop(event.filename, event.lineno, event.colno, location.href);
        }
        prompt({
          error_type: "js_error",
          error: { message: safeError(event.error), ...(stack_top ? { stack_top } : {}) },
        });
      } catch {
        return;
      }
    });
  if (config.auto_detect.unhandled_rejection)
    window.addEventListener("unhandledrejection", (event) => {
      try {
        prompt({ error_type: "unhandled_rejection", error: { message: safeError(event.reason) } });
      } catch {
        return;
      }
    });
  if (config.auto_detect.http_5xx) {
    const observe = (method: string, target: URL, status: number) => {
      try {
        const api = new URL(apiBase);
        if (
          target.origin === api.origin &&
          target.pathname.startsWith(`${api.pathname.replace(/\/$/, "")}/api/v1/widget/`)
        )
          return;
        const detection = httpFailure({ method, url: target.href, status });
        if (detection) prompt(detection);
      } catch {
        return;
      }
    };
    watchRequests(observe);
  }
  return () => {
    enabled = false;
  };
}

export type RequestListener = (method: string, url: URL, status: number, ms: number) => void;
const listeners: RequestListener[] = [];

/** Patches fetch/XHR once and reports each completion (status 0 = network failure). */
export function watchRequests(listener: RequestListener) {
  listeners.push(listener);
  if (listeners.length > 1) return;
  const notify = (method: string, href: string, status: number, started: number) => {
    try {
      const url = new URL(href, location.href);
      for (const each of listeners)
        try {
          each(method, url, status, Date.now() - started);
        } catch {
          // A failing listener never breaks the host request.
        }
    } catch {
      return;
    }
  };
  window.fetch = new Proxy(window.fetch, {
    apply(target, receiver, args) {
      const started = Date.now();
      const response: Promise<Response> = Reflect.apply(target, receiver, args);
      let method = "GET";
      let href = "";
      try {
        const input: unknown = args[0];
        const init: unknown = args[1];
        method =
          typeof init === "object" &&
          init !== null &&
          "method" in init &&
          typeof init.method === "string"
            ? init.method
            : input instanceof Request
              ? input.method
              : "GET";
        href =
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.href
              : typeof input === "string"
                ? input
                : "";
      } catch {
        return response;
      }
      return response.then(
        (value) => {
          notify(method, href, value.status, started);
          return value;
        },
        (error: unknown) => {
          notify(method, href, 0, started);
          throw error;
        },
      );
    },
  });
  const requests = new WeakMap<XMLHttpRequest, { method: string; href: string; started: number }>();
  XMLHttpRequest.prototype.open = new Proxy(XMLHttpRequest.prototype.open, {
    apply(target, receiver, args) {
      const result: unknown = Reflect.apply(target, receiver, args);
      try {
        if (receiver instanceof XMLHttpRequest) {
          const method: unknown = args[0];
          const href: unknown = args[1];
          if (typeof method === "string" && (typeof href === "string" || href instanceof URL)) {
            if (!requests.has(receiver))
              receiver.addEventListener("loadend", () => {
                const info = requests.get(receiver);
                if (info) notify(info.method, info.href, receiver.status, info.started);
              });
            const address = new URL(String(href), location.href);
            requests.set(receiver, {
              method,
              href: sanitizeUrl(address.href) ?? "",
              started: Date.now(),
            });
          }
        }
      } catch {
        return result;
      }
      return result;
    },
  });
}
