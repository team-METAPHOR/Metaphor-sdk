export interface Draft {
  readonly title: string;
  readonly description: string;
  readonly environment: boolean;
  readonly screenshot: boolean;
}

export function buildPayload(draft: Draft, href = location.href, detection?: Detection) {
  const page = new URL(href);
  page.search = "";
  page.hash = "";
  return {
    title: draft.title,
    description: draft.description,
    page_url: page.href,
    ...(detection ?? { error_type: "manual" as const }),
    consent: { environment: draft.environment, screenshot: draft.screenshot },
    ...(draft.environment
      ? {
          environment: {
            user_agent: navigator.userAgent.slice(0, 512),
            language: navigator.language.slice(0, 35),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 64),
            viewport: {
              width: Math.max(1, Math.min(10000, innerWidth)),
              height: Math.max(1, Math.min(10000, innerHeight)),
            },
          },
        }
      : {}),
  };
}

import type { Detection } from "./detect";
