/** Entry point. Never throws into the host page; does nothing unless the widget is enabled. */
import { fetchConfig } from "./api";
import { readScriptConfig } from "./script-config";

declare global {
  interface Window {
    __metaphorLoaded?: boolean;
  }
}

export async function boot(script: HTMLScriptElement | null): Promise<void> {
  if (window.__metaphorLoaded) return;
  window.__metaphorLoaded = true;
  const settings = readScriptConfig(script);
  if (!settings) return;
  const config = await fetchConfig(settings);
  if (!config?.widget_enabled) return;
  document.documentElement.dataset.metaphorReady = "true";
  // TODO(sdk): report button UI, auto-detect, breadcrumbs, masked capture, submit.
}

boot(document.currentScript as HTMLScriptElement | null).catch(() => {});
