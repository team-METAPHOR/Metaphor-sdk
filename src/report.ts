import type { Breadcrumb, ReportPayload } from "./api";
import type { Detection } from "./detect";
import { redactText, sanitizeUrl } from "./privacy";

export interface Draft {
  readonly title: string;
  readonly description: string;
  readonly environment: boolean;
  readonly screenshot: boolean;
  readonly activity: boolean;
}

export function buildPayload(
  draft: Draft,
  href = location.href,
  detection?: Detection,
  breadcrumbs: readonly Breadcrumb[] = [],
) {
  const page = sanitizeUrl(href);
  if (page === null) throw new TypeError("Invalid page URL");
  return {
    title: redactText(draft.title),
    description: redactText(draft.description),
    page_url: page,
    ...(detection ?? { error_type: "manual" as const }),
    consent: {
      environment: draft.environment,
      screenshot: draft.screenshot,
      activity: draft.activity,
    },
    ...(draft.activity && breadcrumbs.length ? { breadcrumbs } : {}),
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
  } satisfies ReportPayload;
}
