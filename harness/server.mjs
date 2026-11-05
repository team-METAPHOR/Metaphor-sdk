// Local harness: a customer-like page (SITE_PORT) and a mock Metaphor widget API (API_PORT)
// on different origins, so CORS and the <script> contract behave like production.
// Point the page at a real backend instead with METAPHOR_API_BASE=http://localhost:8000.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const SITE_PORT = Number(process.env.SITE_PORT ?? 4100);
const API_PORT = Number(process.env.API_PORT ?? 4200);
const SITE_ORIGIN = `http://localhost:${SITE_PORT}`;
const API_BASE = process.env.METAPHOR_API_BASE ?? `http://localhost:${API_PORT}`;
const PROJECT_KEY = process.env.METAPHOR_PROJECT_KEY ?? "mpk_harness";

// Mock state, adjustable by tests through POST /__mock/config and read via GET /__mock/requests.
let widgetConfig = defaultConfig();
const received = [];

function defaultConfig() {
  return {
    widget_enabled: true,
    reporting_enabled: true,
    screenshot_allowed: true,
    auto_detect: { enabled: true, js_error: true, unhandled_rejection: true, http_5xx: true },
    limits: { max_screenshot_bytes: 4194304, max_description: 8000, max_mask_boxes: 20 },
    mask_selectors: ["[data-private]", "[data-sensitive]", "input[type=password]"],
  };
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

createServer((req, res) => {
  const url = new URL(req.url, SITE_ORIGIN);
  if (url.pathname === "/sdk/metaphor.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(readFileSync("dist/metaphor.js"));
    return;
  }
  const page = readFileSync("harness/site.html", "utf8")
    .replaceAll("{{API_BASE}}", API_BASE)
    .replaceAll("{{PROJECT_KEY}}", PROJECT_KEY);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page);
}).listen(SITE_PORT, () => console.log(`site  ${SITE_ORIGIN}`));

createServer(async (req, res) => {
  const url = new URL(req.url, API_BASE);
  const origin = req.headers.origin;
  // Mirrors the backend: CORS only for the registered origin, never credentials.
  const cors =
    origin === SITE_ORIGIN ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
  if (url.pathname === "/__mock/requests") return json(res, 200, received);
  if (url.pathname === "/__mock/reset") {
    widgetConfig = defaultConfig();
    received.length = 0;
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/__mock/config" && req.method === "POST") {
    widgetConfig = { ...defaultConfig(), ...JSON.parse((await readBody(req)).toString() || "{}") };
    return json(res, 200, widgetConfig);
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...cors,
      "access-control-allow-methods": "GET, POST",
      "access-control-allow-headers": "Idempotency-Key",
    });
    return res.end();
  }
  const body = req.method === "POST" ? await readBody(req) : Buffer.alloc(0);
  received.push({
    method: req.method,
    path: url.pathname,
    project_key: url.searchParams.get("project_key"),
    origin: origin ?? null,
    cookie: req.headers.cookie ?? null,
    content_type: req.headers["content-type"] ?? null,
    body_bytes: body.length,
  });
  if (origin !== SITE_ORIGIN) return json(res, 403, { error: { code: "ORIGIN_NOT_ALLOWED" } });
  if (url.pathname === "/api/v1/widget/config") return json(res, 200, widgetConfig, cors);
  if (url.pathname === "/api/v1/widget/reports" && req.method === "POST") {
    return json(res, 201, { receipt_id: "rcpt_harness", status: "received" }, cors);
  }
  json(res, 404, { error: { code: "NOT_FOUND" } }, cors);
}).listen(API_PORT, () => console.log(`api   http://localhost:${API_PORT}`));
