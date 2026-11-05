const REDACTED = ":redacted";
const SENSITIVE =
  /^(?:reset|invite|invitation|token|tokens|verify|verification|confirm|confirmation|activate|activation|magic|signin|sign-in|login|log-in|auth|oauth|callback|password|passwords|recover|recovery|unsubscribe|share|key|keys|secret|session|sso|otp|code)$/i;
const TOKEN_CHARS = /^[A-Za-z0-9_\-+=~]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOpaque(segment: string): boolean {
  if (segment.length > 64 || UUID.test(segment) || /^[0-9a-f]{16,}$/i.test(segment)) return true;
  const parts = segment.split(".");
  if (parts.length >= 2 && parts.every((part) => part.length >= 8 && TOKEN_CHARS.test(part)))
    return true;
  const stem = segment.replace(/\.[a-z]{1,5}$/, "");
  if (!TOKEN_CHARS.test(stem)) return /[0-9]/.test(stem) && stem.length >= 20;
  const letters = /[A-Za-z]/.test(stem);
  const digits = /[0-9]/.test(stem);
  return (
    (stem.length >= 20 && letters && digits) ||
    (stem.length >= 24 && /[A-Z]/.test(stem) && /[a-z]/.test(stem))
  );
}

/** Replaces credential-like path segments with a placeholder and drops `;params`. */
export function sanitizePath(pathname: string): string {
  let afterSensitive = false;
  return pathname
    .split("/")
    .map((raw) => {
      const encoded = raw.split(";")[0] ?? "";
      if (!encoded) return encoded;
      let segment: string;
      try {
        segment = decodeURIComponent(encoded);
      } catch {
        afterSensitive = false;
        return REDACTED;
      }
      if (SENSITIVE.test(segment)) {
        afterSensitive = true;
        return encoded;
      }
      const redact = afterSensitive || isOpaque(segment);
      afterSensitive = false;
      return redact ? REDACTED : encoded;
    })
    .join("/");
}

/** Origin plus sanitized path; never userinfo, query or fragment. Null if unparsable. */
export function sanitizeUrl(href: string, base?: string): string | null {
  try {
    const url = new URL(href, base);
    return `${url.origin}${sanitizePath(url.pathname)}`;
  } catch {
    return null;
  }
}

export function redactText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, (href) => {
      return sanitizeUrl(href) ?? "[URL]";
    })
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[이메일]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [가림]")
    .replace(
      /\b(?:password|passwd|token|secret|api[_-]?key|authorization|session|cookie)\s*[:=]\s*[^\s,;]+/gi,
      "[인증 정보]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[토큰]");
}
