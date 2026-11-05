import type { WidgetConfig } from "./api";

export interface Detection {
  readonly error_type: "js_error" | "unhandled_rejection" | "http_5xx";
  readonly error: {
    readonly message: string;
    readonly stack_top?: string;
    readonly http?: { readonly method: string; readonly path: string; readonly status: number };
  };
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
  if (
    info.status < 500 ||
    info.status > 599 ||
    !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(method)
  )
    return null;
  try {
    const path = new URL(info.url).pathname;
    if (path.length > 2048) return null;
    return {
      error_type: "http_5xx",
      error: { message: `HTTP ${info.status}`, http: { method, path, status: info.status } },
    };
  } catch {
    return null;
  }
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
          if (source.pathname.endsWith("/metaphor.js")) return;
          stack_top = `${source.origin}${source.pathname}:${event.lineno}:${event.colno}`.slice(
            0,
            300,
          );
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
    const observe = (method: string, href: string, status: number) => {
      try {
        const target = new URL(href, location.href);
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
    window.fetch = new Proxy(window.fetch, {
      apply(target, receiver, args) {
        const response: Promise<Response> = Reflect.apply(target, receiver, args);
        return response.then((value) => {
          try {
            const input: unknown = args[0];
            const init: unknown = args[1];
            const method =
              typeof init === "object" &&
              init !== null &&
              "method" in init &&
              typeof init.method === "string"
                ? init.method
                : input instanceof Request
                  ? input.method
                  : "GET";
            const href =
              input instanceof Request
                ? input.url
                : input instanceof URL
                  ? input.href
                  : typeof input === "string"
                    ? input
                    : "";
            observe(method, href, value.status);
          } catch {
            return value;
          }
          return value;
        });
      },
    });
    const requests = new WeakMap<XMLHttpRequest, { method: string; href: string }>();
    XMLHttpRequest.prototype.open = new Proxy(XMLHttpRequest.prototype.open, {
      apply(target, receiver, args) {
        const result: unknown = Reflect.apply(target, receiver, args);
        if (receiver instanceof XMLHttpRequest) {
          const method: unknown = args[0];
          const href: unknown = args[1];
          if (typeof method === "string" && (typeof href === "string" || href instanceof URL)) {
            if (!requests.has(receiver))
              receiver.addEventListener("loadend", () => {
                const info = requests.get(receiver);
                if (info) observe(info.method, info.href, receiver.status);
              });
            requests.set(receiver, { method, href: String(href) });
          }
        }
        return result;
      },
    });
  }
  return () => {
    enabled = false;
  };
}
