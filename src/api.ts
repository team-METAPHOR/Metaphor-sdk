/** Client for the backend widget API (Metaphor-back docs/api/widget-sdk.md). No cookies, ever. */
import type { ScriptConfig } from "./script-config";

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
export type ReportError = { readonly message: string; readonly stack_top?: string };
export type AutomaticReport =
  | { readonly error_type: "js_error" | "unhandled_rejection"; readonly error: ReportError }
  | {
      readonly error_type: "http_5xx";
      readonly error: ReportError & {
        readonly http: {
          readonly method: HttpMethod;
          readonly path: string;
          readonly status: number;
        };
      };
    };
/** One recent reporter action. Never a value, body, header or query. Empty fields are omitted. */
export type BreadcrumbItem =
  | { readonly type: "navigation"; readonly path: string }
  | {
      readonly type: "click";
      readonly tag?: string;
      readonly role?: string;
      readonly text?: string;
      readonly testid?: string;
      readonly selector?: string;
    }
  | {
      readonly type: "input";
      readonly tag?: string;
      readonly input_type?: string;
      readonly label?: string;
      readonly testid?: string;
      readonly selector?: string;
      readonly checked?: boolean;
      readonly selected_text?: string;
      readonly length?: number;
    }
  | {
      readonly type: "submit";
      readonly label?: string;
      readonly testid?: string;
      readonly selector?: string;
    }
  | { readonly type: "key"; readonly key: string }
  | {
      readonly type: "request";
      readonly method: HttpMethod;
      readonly path: string;
      readonly status?: number;
      readonly duration_ms: number;
    }
  | { readonly type: "error"; readonly message: string };
/** `t`: integer ms relative to submit time, in [-600000, 0]. */
export type Breadcrumb = BreadcrumbItem & { readonly t: number };
export type ReportPayload = {
  readonly title?: string;
  readonly description?: string;
  readonly page_url: string;
  readonly consent?: {
    readonly environment?: boolean;
    readonly screenshot?: boolean;
    readonly activity?: boolean;
  };
  readonly environment?: {
    readonly user_agent?: string;
    readonly language?: string;
    readonly timezone?: string;
    readonly viewport?: { readonly width: number; readonly height: number };
  };
  readonly mask_boxes?: readonly (readonly [number, number, number, number])[];
  readonly breadcrumbs?: readonly Breadcrumb[];
} & ({ readonly error_type: "manual"; readonly error?: never } | AutomaticReport);

export interface WidgetConfig {
  widget_enabled: boolean;
  reporting_enabled: boolean;
  screenshot_allowed: boolean;
  auto_detect: {
    enabled: boolean;
    js_error: boolean;
    unhandled_rejection: boolean;
    http_5xx: boolean;
  };
  limits: { max_screenshot_bytes: number; max_description: number; max_mask_boxes: number };
  mask_selectors: string[];
}

function url(config: ScriptConfig, path: string): string {
  return `${config.apiBase}/api/v1/widget/${path}?project_key=${encodeURIComponent(config.projectKey)}`;
}

export async function submitReport(config: ScriptConfig, form: FormData, key: string) {
  try {
    const response = await fetch(url(config, "reports"), {
      method: "POST",
      body: form,
      credentials: "omit",
      headers: { "Idempotency-Key": key },
      signal: AbortSignal.timeout(15000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (
      response.ok &&
      !(
        typeof body === "object" &&
        body !== null &&
        "status" in body &&
        ((body.status === "received" &&
          "receipt_id" in body &&
          typeof body.receipt_id === "string" &&
          body.receipt_id.length > 0) ||
          (body.status === "duplicate" && "receipt_id" in body && body.receipt_id === null))
      )
    )
      return { status: 502, code: "INVALID_RESPONSE" };
    if (typeof body !== "object" || body === null)
      return { status: response.status, code: "INVALID_RESPONSE" };
    return {
      status: response.status,
      receipt: "receipt_id" in body && typeof body.receipt_id === "string" ? body.receipt_id : "",
      duplicate: "status" in body && body.status === "duplicate",
      code:
        "error" in body &&
        typeof body.error === "object" &&
        body.error !== null &&
        "code" in body.error &&
        typeof body.error.code === "string"
          ? body.error.code
          : "",
    };
  } catch {
    return { status: 0, code: "NETWORK_ERROR" };
  }
}

export async function fetchConfig(config: ScriptConfig): Promise<WidgetConfig | null> {
  try {
    const response = await fetch(url(config, "config"), {
      credentials: "omit",
      signal: AbortSignal.timeout(15000),
    });
    const value: unknown = response.ok ? await response.json() : null;
    return isWidgetConfig(value) ? value : null;
  } catch {
    return null;
  }
}

function isWidgetConfig(value: unknown): value is WidgetConfig {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("widget_enabled" in value) ||
    typeof value.widget_enabled !== "boolean" ||
    !("reporting_enabled" in value) ||
    typeof value.reporting_enabled !== "boolean" ||
    !("screenshot_allowed" in value) ||
    typeof value.screenshot_allowed !== "boolean"
  )
    return false;
  if (
    !("auto_detect" in value) ||
    typeof value.auto_detect !== "object" ||
    value.auto_detect === null
  )
    return false;
  const auto = value.auto_detect;
  if (
    !("enabled" in auto) ||
    typeof auto.enabled !== "boolean" ||
    !("js_error" in auto) ||
    typeof auto.js_error !== "boolean" ||
    !("unhandled_rejection" in auto) ||
    typeof auto.unhandled_rejection !== "boolean" ||
    !("http_5xx" in auto) ||
    typeof auto.http_5xx !== "boolean"
  )
    return false;
  if (!("limits" in value) || typeof value.limits !== "object" || value.limits === null)
    return false;
  const limits = value.limits;
  const limit = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;
  return (
    "max_description" in limits &&
    limit(limits.max_description) &&
    "max_screenshot_bytes" in limits &&
    limit(limits.max_screenshot_bytes) &&
    "max_mask_boxes" in limits &&
    limit(limits.max_mask_boxes) &&
    "mask_selectors" in value &&
    Array.isArray(value.mask_selectors) &&
    value.mask_selectors.every((s: unknown) => typeof s === "string")
  );
}
