/** Client for the backend widget API (Metaphor-back docs/api/widget-sdk.md). No cookies, ever. */
import type { ScriptConfig } from "./script-config";

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
    const body: unknown = await response.json();
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
