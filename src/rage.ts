export function startRageDetection(host: HTMLElement, offer: () => void) {
  let count = 0;
  let started = 0;
  let x = 0;
  let y = 0;
  let next = 0;
  const pointerdown = (event: PointerEvent) => {
    try {
      if (event.composedPath().includes(host) || !event.isPrimary || event.button !== 0) return;
      const now = Date.now();
      if (now < next) return;
      if (now - started > 1000 || Math.hypot(event.clientX - x, event.clientY - y) > 30) {
        count = 0;
        started = now;
        x = event.clientX;
        y = event.clientY;
      }
      count += 1;
      if (count < 3) return;
      count = 0;
      next = now + 60000;
      offer();
    } catch {
      return;
    }
  };
  document.addEventListener("pointerdown", pointerdown, true);
  return () => document.removeEventListener("pointerdown", pointerdown, true);
}
