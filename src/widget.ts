import { submitReport, type WidgetConfig } from "./api";
import { captureViewport } from "./capture";
import { type Detection, startDetection } from "./detect";
import { buildPayload } from "./report";
import type { ScriptConfig } from "./script-config";

export function mountWidget(settings: ScriptConfig, config: WidgetConfig) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{all:initial;font-family:system-ui,sans-serif;color-scheme:light;color:#172033}
    *{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;padding:10px 16px;background:white;color:#172033}
    button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
    #launch{position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#172033;color:white;box-shadow:0 4px 20px #0003}
    dialog{position:fixed;margin:auto;width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid #cbd5e1;border-radius:16px;padding:24px;background:white;color:#172033;box-shadow:0 12px 48px #0004}
    dialog::backdrop{background:#0005}h2{margin:0 0 20px;font-size:22px}label{display:block;margin:14px 0 6px}input[type=text],textarea{width:100%;border:1px solid #94a3b8;border-radius:8px;padding:10px}textarea{min-height:120px;resize:vertical}.actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}#submit{background:#172033;color:white}p{line-height:1.5}input[type=checkbox]{width:18px;height:18px;vertical-align:middle}button:disabled{opacity:.5;cursor:wait}
    </style><button id="launch" type="button">버그 신고</button><button id="hint" type="button" hidden style="position:fixed;bottom:76px;right:20px;z-index:2147483647;max-width:calc(100vw - 40px)">오류가 감지되었습니다. 신고하기</button><dialog aria-labelledby="heading"><form>
    <h2 id="heading">버그 신고</h2><label for="title">제목</label><input id="title" type="text" maxlength="200">
    <label for="description">설명</label><textarea id="description" required></textarea>
    <label><input id="environment" type="checkbox"> 브라우저 환경 정보 전송에 동의합니다</label>
    ${config.screenshot_allowed ? '<label><input id="screenshot" type="checkbox"> 마스킹된 스크린샷 전송에 동의합니다</label>' : ""}
    <p role="status" aria-live="polite"></p><div class="actions"><button id="cancel" type="button">취소</button><button id="submit" type="submit">신고 보내기</button></div></form></dialog>`;
  const launch = root.querySelector("#launch");
  const dialog = root.querySelector("dialog");
  const form = root.querySelector("form");
  const title = root.querySelector("#title");
  const description = root.querySelector("#description");
  const environment = root.querySelector("#environment");
  const screenshot = root.querySelector("#screenshot");
  const screenshotConsent = () =>
    screenshot instanceof HTMLInputElement && screenshot.checked && config.screenshot_allowed;
  const submit = root.querySelector("#submit");
  const status = root.querySelector("[role=status]");
  if (
    !(launch instanceof HTMLButtonElement) ||
    !(dialog instanceof HTMLDialogElement) ||
    !(form instanceof HTMLFormElement) ||
    !(title instanceof HTMLInputElement) ||
    !(description instanceof HTMLTextAreaElement) ||
    !(environment instanceof HTMLInputElement) ||
    !(submit instanceof HTMLButtonElement) ||
    !status
  )
    return;
  description.maxLength = Math.min(8000, config.limits.max_description);
  screenshot?.addEventListener("change", () => {
    description.required = !screenshotConsent();
  });
  let pending: { signature: string; key: string; form: FormData } | undefined;
  let retryAt = 0;
  let attempts = 0;
  let busy = false;
  let detection: Detection | undefined;
  const hint = root.querySelector("#hint");
  let suggested: Detection | undefined;
  const stopDetection = startDetection(config, settings.apiBase, (value) => {
    if (dialog.open || !host.isConnected) return;
    suggested = value;
    if (hint instanceof HTMLElement) hint.hidden = false;
  });
  hint?.addEventListener("click", () => {
    if (dialog.open) return;
    detection = suggested;
    title.value = "감지된 오류 신고";
    description.value = suggested?.error.message ?? "";
    if (hint instanceof HTMLElement) hint.hidden = true;
    submit.disabled = false;
    dialog.showModal();
  });
  launch.addEventListener("click", () => {
    if (!dialog.open) {
      detection = undefined;
      dialog.showModal();
    }
  });
  root.querySelector("#cancel")?.addEventListener("click", () => dialog.close());
  const send = async () => {
    if (submit.disabled || Date.now() < retryAt) return;
    const payload = buildPayload(
      {
        title: title.value,
        description: description.value,
        environment: environment.checked,
        screenshot: screenshotConsent(),
      },
      location.href,
      detection,
    );
    const signature = JSON.stringify(payload);
    if (new Blob([signature]).size > 32768 || payload.page_url.length > 2048) {
      status.textContent = "내용이 너무 깁니다. 설명을 줄여 주세요.";
      return;
    }
    if (pending?.signature === signature && attempts >= 3) return;
    if (!pending || pending.signature !== signature) {
      if (!payload.description.trim() && !screenshotConsent()) {
        status.textContent = "설명을 입력해 주세요.";
        return;
      }
      submit.disabled = true;
      const body = new FormData();
      if (screenshotConsent()) {
        status.textContent = "민감한 정보를 가린 스크린샷을 준비하는 중…";
        try {
          body.append("screenshot", await captureViewport(config, host), "screenshot.png");
        } catch {
          status.textContent =
            "스크린샷을 준비하지 못했습니다. 동의를 해제하고 설명으로 신고해 주세요.";
          submit.disabled = false;
          return;
        }
      }
      body.append("payload", signature);
      pending = {
        signature,
        key:
          crypto.randomUUID?.() ??
          Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
            n.toString(16).padStart(2, "0"),
          ).join(""),
        form: body,
      };
      attempts = 0;
    }
    submit.disabled = true;
    status.textContent = "보내는 중…";
    const result = await submitReport(settings, pending.form, pending.key);
    submit.disabled = false;
    if (result.status === 200 || result.status === 201) {
      status.textContent = result.duplicate
        ? "이미 접수된 오류에 제보가 추가되었습니다."
        : `접수되었습니다. 접수 번호: ${result.receipt}`;
      pending = undefined;
      submit.disabled = true;
      return;
    }
    if (result.status === 429) {
      stopDetection();
      if (hint instanceof HTMLElement) hint.hidden = true;
      retryAt =
        result.code === "DAILY_LIMIT_EXCEEDED"
          ? Date.parse(`${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}T00:00:00Z`)
          : Date.now() + 30000;
      status.textContent = "신고 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
      return;
    }
    if (result.status === 0 || result.status >= 500) {
      attempts += 1;
      retryAt = Date.now() + 30000 * 2 ** (attempts - 1) + Math.random() * 1000;
      status.textContent = "전송하지 못했습니다. 잠시 후 같은 내용으로 다시 시도해 주세요.";
      if (attempts >= 3) submit.disabled = true;
      return;
    }
    status.textContent = "신고를 접수할 수 없습니다. 내용을 확인해 주세요.";
    if (
      [
        "WIDGET_REPORTING_DISABLED",
        "ORIGIN_NOT_ALLOWED",
        "WIDGET_NOT_FOUND",
        "PROGRAM_NOT_ACTIVE",
        "EXTERNAL_AI_NOT_ALLOWED",
      ].includes(result.code)
    )
      host.remove();
    else {
      if (result.code === "AUTO_DETECT_DISABLED") {
        stopDetection();
        detection = undefined;
      }
      pending = undefined;
    }
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    form.inert = true;
    void send()
      .catch(() => {
        status.textContent = "신고를 준비하지 못했습니다. 다시 시도해 주세요.";
        submit.disabled = false;
      })
      .finally(() => {
        busy = false;
        form.inert = false;
      });
  });
  document.body.append(host);
  form.addEventListener("input", () => {
    if (!busy) submit.disabled = false;
  });
}
