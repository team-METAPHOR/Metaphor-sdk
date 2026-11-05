export function redactText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, (href) => {
      try {
        const url = new URL(href);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.href;
      } catch {
        return "[URL]";
      }
    })
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[이메일]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [가림]")
    .replace(
      /\b(?:password|passwd|token|secret|api[_-]?key|authorization|session|cookie)\s*[:=]\s*[^\s,;]+/gi,
      "[인증 정보]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[토큰]");
}
