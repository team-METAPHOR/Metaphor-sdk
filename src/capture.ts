import type { WidgetConfig } from "./api";

export function maskedElements(root: Document, selectors: readonly string[]): Element[] {
  const matches = new Set<Element>(
    root.querySelectorAll(
      "input,textarea,select,[contenteditable],iframe,canvas,video,audio,object,embed,img,svg",
    ),
  );
  for (const selector of selectors)
    for (const element of root.querySelectorAll(selector)) matches.add(element);
  return [...matches];
}

export async function captureViewport(config: WidgetConfig, host: HTMLElement): Promise<Blob> {
  const masks = new Set(maskedElements(document, config.mask_selectors));
  const width = innerWidth;
  const height = innerHeight;
  const scale = Math.min(1, 4096 / width, 4096 / height, Math.sqrt(8000000 / (width * height)));
  const clone = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? "");
    if (
      !(node instanceof Element) ||
      node === host ||
      node.matches("script,style,link,meta,base,noscript,template")
    )
      return null;
    const copy = document.createElement(
      node.namespaceURI === "http://www.w3.org/1999/xhtml" &&
        !node.localName.includes("-") &&
        !masks.has(node)
        ? node.localName
        : "div",
    );
    const style = getComputedStyle(node);
    for (const property of style) {
      const value = style.getPropertyValue(property);
      if (!/url\s*\(|image-set\s*\(/i.test(value)) copy.style.setProperty(property, value);
    }
    copy.style.setProperty("animation", "none", "important");
    copy.style.setProperty("transition", "none", "important");
    if (style.position === "fixed") {
      const rect = node.getBoundingClientRect();
      copy.style.position = "absolute";
      copy.style.top = `${rect.top + scrollY}px`;
      copy.style.left = `${rect.left + scrollX}px`;
    }
    if (masks.has(node) || node.shadowRoot || node.localName.includes("-")) {
      const rect = node.getBoundingClientRect();
      copy.style.width = `${rect.width}px`;
      copy.style.height = `${rect.height}px`;
      copy.style.background = "#000";
      copy.style.color = "#000";
      copy.style.borderColor = "#000";
      copy.style.boxShadow = "none";
      copy.style.borderRadius = "0";
      return copy;
    }
    for (const child of node.childNodes) {
      const next = clone(child);
      if (next) copy.append(next);
    }
    return copy;
  };
  const body = clone(document.body);
  if (!(body instanceof HTMLElement)) throw new CaptureError();
  body.style.position = "absolute";
  body.style.left = `${-scrollX}px`;
  body.style.top = `${-scrollY}px`;
  body.style.width = `${document.body.getBoundingClientRect().width}px`;
  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:white`;
  wrapper.append(body);
  for (const element of masks) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cover = document.createElement("div");
    cover.style.cssText = `position:absolute;left:${Math.floor(rect.left)}px;top:${Math.floor(rect.top)}px;width:${Math.ceil(rect.right) - Math.floor(rect.left)}px;height:${Math.ceil(rect.bottom) - Math.floor(rect.top)}px;background:#000;z-index:2147483647`;
    wrapper.append(cover);
  }
  const xml = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new CaptureError());
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new CaptureError();
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob || blob.size > Math.min(4194304, config.limits.max_screenshot_bytes))
    throw new CaptureError();
  return blob;
}

export class CaptureError extends Error {}
