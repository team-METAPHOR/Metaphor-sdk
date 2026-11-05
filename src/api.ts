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

export async function fetchConfig(config: ScriptConfig): Promise<WidgetConfig | null> {
  try {
    const response = await fetch(url(config, "config"), { credentials: "omit" });
    return response.ok ? ((await response.json()) as WidgetConfig) : null;
  } catch {
    return null;
  }
}
