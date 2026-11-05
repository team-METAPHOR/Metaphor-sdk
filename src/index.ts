/** Entry point. Never throws into the host page; does nothing unless the widget is enabled. */
import { fetchConfig } from "./api";
import { readScriptConfig } from "./script-config";
import { mountWidget } from "./widget";

declare global {
  interface Window {
    __metaphorLoaded?: boolean;
  }
}

export async function boot(script: HTMLScriptElement | null): Promise<void> {
  try {
    if (window.__metaphorLoaded) return;
    window.__metaphorLoaded = true;
    const settings = readScriptConfig(script);
    if (!settings) return;
    const config = await fetchConfig(settings);
    if (!config?.widget_enabled || !config.reporting_enabled) return;
    mountWidget(settings, config);
  } catch {
    return;
  }
}

boot(document.currentScript instanceof HTMLScriptElement ? document.currentScript : null);
