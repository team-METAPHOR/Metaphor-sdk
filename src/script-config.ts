/** Settings read from the SDK's own <script> tag (contract shared with BugLab-shop). */
export interface ScriptConfig {
  projectKey: string;
  apiBase: string;
  showLauncher?: boolean;
}

export function readScriptConfig(script: HTMLScriptElement | null): ScriptConfig | null {
  const projectKey = script?.dataset.metaphorProjectKey?.trim();
  const apiBase = script?.dataset.metaphorApiBase?.trim().replace(/\/+$/, "");
  if (!projectKey || !apiBase) return null;
  const hideLauncher = script?.dataset.metaphorShowLauncher?.trim().toLowerCase() === "false";
  return { projectKey, apiBase, ...(hideLauncher ? { showLauncher: false } : {}) };
}
