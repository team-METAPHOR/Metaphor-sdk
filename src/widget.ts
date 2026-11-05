import { submitReport, type WidgetConfig } from "./api";
import { captureViewport } from "./capture";
import { type Detection, startDetection } from "./detect";
import { startRageDetection } from "./rage";
import { buildPayload } from "./report";
import type { ScriptConfig } from "./script-config";

export function mountWidget(settings: ScriptConfig, config: WidgetConfig) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{all:initial;--surface:#fff;--ink:#172033;--edge:#64748b;--focus:#2563eb;--space1:8px;--space2:16px;--space3:24px;--float-gap:20px;--radius-field:8px;--radius-button:10px;--radius-dialog:16px;--control-height:44px;--field-padding:10px;--panel-width:440px;--viewport-gap:32px;--focus-width:3px;--focus-offset:3px;--border-width:1px;--text-size:16px;--heading-size:22px;--line-height:1.5;--textarea-height:120px;--checkbox-size:18px;--layer:2147483647;--shadow-float:0 4px 20px #0003;--shadow-dialog:0 12px 48px #0004;--backdrop:#0005;font:var(--text-size)/var(--line-height) system-ui,sans-serif;color-scheme:light;color:var(--ink)}
    @media(prefers-color-scheme:dark){:host{--surface:#111827;--ink:#f1f5f9;--edge:#94a3b8;--focus:#60a5fa;color-scheme:dark}}
    *{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer;min-height:var(--control-height);border:var(--border-width) solid var(--edge);border-radius:var(--radius-button);padding:var(--field-padding) var(--space2);background:var(--surface);color:var(--ink)}
    button:focus-visible,input:focus-visible,textarea:focus-visible{outline:var(--focus-width) solid var(--focus);outline-offset:var(--focus-offset)}
    button:hover{filter:brightness(.92)}button:active{filter:brightness(.85)}
    #launch{position:fixed;right:var(--float-gap);bottom:var(--float-gap);z-index:var(--layer);background:var(--ink);color:var(--surface);box-shadow:var(--shadow-float)}
    dialog{position:fixed;margin:auto;width:min(var(--panel-width),calc(100vw - var(--viewport-gap)));max-height:calc(100dvh - var(--viewport-gap));overflow:auto;border:var(--border-width) solid var(--edge);border-radius:var(--radius-dialog);padding:var(--space3);background:var(--surface);color:var(--ink);box-shadow:var(--shadow-dialog)}
    dialog::backdrop{background:var(--backdrop)}h2{margin:0 0 var(--space3);font-size:var(--heading-size)}label{display:block;margin:var(--space2) 0 var(--space1);word-break:keep-all;overflow-wrap:anywhere}label:has(input[type=checkbox]){display:flex;align-items:center;gap:var(--space1);min-height:var(--control-height)}input[type=text],textarea{width:100%;border:var(--border-width) solid var(--edge);border-radius:var(--radius-field);padding:var(--field-padding);background:var(--surface);color:var(--ink)}textarea{min-height:var(--textarea-height);resize:vertical}.actions{display:flex;flex-wrap:wrap;gap:var(--space1);justify-content:flex-end;margin-top:var(--space3)}#submit{background:var(--ink);color:var(--surface)}p{line-height:var(--line-height);overflow-wrap:anywhere}input[type=checkbox]{width:var(--checkbox-size);height:var(--checkbox-size);flex-shrink:0;accent-color:var(--focus)}button:disabled{background:var(--edge);color:var(--surface);cursor:default}#hint{position:fixed;bottom:calc(var(--float-gap) + var(--control-height) + var(--space3));right:var(--float-gap);z-index:var(--layer);max-width:calc(100vw - 2 * var(--float-gap))}
    #launch[hidden]~#hint{bottom:var(--float-gap)}
    </style><button id="launch" type="button">버그 신고</button><button id="hint" type="button" hidden>오류가 감지되었습니다. 신고하기</button><dialog aria-labelledby="heading"><form>
    <h2 id="heading">버그 신고</h2><label for="title">제목</label><input id="title" type="text" maxlength="200">
    <label for="description">설명</label><textarea id="description" required></textarea>
    <label><input id="environment" type="checkbox"> 브라우저 환경 정보 전송에 동의합니다</label>
    ${config.screenshot_allowed ? '<label><input id="screenshot" type="checkbox"> 마스킹된 스크린샷 전송에 동의합니다</label>' : ""}
    <p role="status" aria-live="polite"></p><div class="actions"><button id="cancel" type="button">취소</button><button id="submit" type="submit">신고 보내기</button></div></form></dialog>`;
  const style = root.querySelector("style");
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(style?.textContent ?? "");
  style?.remove();
  root.adoptedStyleSheets = [sheet];
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
  launch.hidden = settings.showLauncher === false;
  description.maxLength = Math.min(8000, config.limits.max_description);
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [...form.querySelectorAll("input,textarea,button")].filter(
      (element) =>
        (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLButtonElement) &&
        !element.disabled,
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && root.activeElement === first && last instanceof HTMLElement) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && root.activeElement === last && first instanceof HTMLElement) {
      event.preventDefault();
      first.focus();
    }
  });
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
  let nextHint = 0;
  const offer = (value?: Detection) => {
    if (dialog.open || !host.isConnected || Date.now() < nextHint) return;
    nextHint = Date.now() + 60000;
    suggested = value;
    if (hint instanceof HTMLElement) {
      hint.textContent = value ? "오류가 감지되었습니다. 신고하기" : "반응이 없나요? 버그 신고하기";
      hint.hidden = false;
    }
  };
  const stopDetection = startDetection(config, settings.apiBase, offer);
  const stopRage = config.auto_detect.enabled
    ? startRageDetection(host, () => offer())
    : () => undefined;
  hint?.addEventListener("click", () => {
    if (dialog.open) return;
    detection = suggested;
    title.value = suggested ? "감지된 오류 신고" : "반응 없는 요소 신고";
    description.value = (suggested?.error.message ?? "요소를 눌러도 반응이 없습니다.").slice(
      0,
      description.maxLength,
    );
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
    if (payload.title.length > 200 || payload.description.length > description.maxLength) {
      status.textContent = "입력 가능한 글자 수를 초과했습니다.";
      return;
    }
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
      stopRage();
      if (hint instanceof HTMLElement) hint.hidden = true;
      retryAt =
        // Both daily caps reset at UTC midnight (program budget and widget share of it).
        ["DAILY_LIMIT_EXCEEDED", "WIDGET_DAILY_LIMITED"].includes(result.code)
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
        // The customer has not proven ownership of the test origin yet; retrying cannot help.
        "ORIGIN_NOT_VERIFIED",
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
