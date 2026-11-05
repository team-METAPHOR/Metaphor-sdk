# AGENTS.md — Metaphor Web SDK

Guide for coding agents (Claude Code, Codex, etc.) and humans. Read fully before changing code.

## 1. What this is

A small JavaScript file that customer sites embed with one `<script>` tag. It lets real users
report bugs (screenshot + description) and auto-detects some errors, then sends reports to the
Metaphor backend (`team-METAPHOR/Metaphor-back`), which reproduces them with an AI QA engine.

```html
<script src="https://<cdn>/sdk/metaphor.js"
        data-metaphor-project-key="mpk_..."
        data-metaphor-api-base="https://api.<metaphor>" defer></script>
```

The tag contract above is shared with `team-METAPHOR/BugLab-shop` (demo customer site). Do not
rename the attributes.

## 2. Backend contract (source of truth)

`Metaphor-back/docs/api/widget-sdk.md`. Read it before touching network code.

- `GET  {apiBase}/api/v1/widget/config?project_key=...` → enabled flags, limits, `mask_selectors`
- `POST {apiBase}/api/v1/widget/reports?project_key=...` → multipart: `payload` (JSON) +
  optional `screenshot` (PNG), optional `Idempotency-Key` header
- The payload schema is a whitelist; unknown fields are rejected (422). Keep TS types in
  `src/api.ts` identical to the doc.
- Breadcrumbs (user click/navigation history) are **on hold** for security review. Do not
  collect or send them until the backend contract adds them.

## 3. Hard rules (security and host safety)

- Never send cookies (`credentials: "omit"` on every request), auth headers, tokens, request or
  response bodies, input values, or keystrokes.
- Screenshots: mask before capture. Black out every element matching `mask_selectors` plus all
  `input`, `textarea`, `select`, `[contenteditable]` values in the cloned DOM, then render. Only
  the masked image is uploaded. If a selector throws, abort the capture.
- Send a screenshot or environment data only with the user's explicit consent in the report UI
  (`consent.screenshot`, `consent.environment`).
- Never throw into the host page. Every entry point catches and stays silent. A disabled or
  unreachable widget must be a no-op.
- Load once (`window.__metaphorLoaded`). No globals beyond that unless documented here.
- UI lives in a Shadow DOM root; never touch or restyle host elements.
- Disabled buttons do not emit `click`: detect rage/dead clicks with a capture-phase
  `pointerdown` listener on `document` (measured in BugLab-shop docs/FUNCTIONAL_SPEC.md §9.3).
- Bundle budget: 50 KiB gzip (`npm run size`). Prefer the platform over dependencies; a new
  runtime dependency needs a reason in the PR.

## 4. Layout

```text
src/index.ts          entry: boot from the script tag, fetch config, start features
src/script-config.ts  reads data-metaphor-* attributes
src/api.ts            backend client and wire types
tests/                unit tests (vitest + happy-dom), *.test.ts
harness/              local customer page (:4100) + mock widget API (:4200, different origin)
e2e/                  Playwright tests against the harness
scripts/              build (esbuild → dist/metaphor.js, IIFE) and size budget
```

## 5. Commands

```bash
npm ci
npx playwright install chromium --only-shell   # once
npm run check      # lint + typecheck + unit + build + size
npm run e2e        # builds, starts the harness, runs Playwright
npm run harness    # manual: open http://localhost:4100
METAPHOR_API_BASE=http://localhost:8000 METAPHOR_PROJECT_KEY=mpk_... npm run harness
                   # same page against a real local backend
```

The mock API records every request (`GET :4200/__mock/requests`), can change the config
(`POST :4200/__mock/config`), and resets with `POST :4200/__mock/reset`. Assert on what the SDK
sent (no cookies, right origin, right payload) rather than on internals.

## 6. Workflow

- Never commit directly to `main`. One task = one branch = one PR; stacked PRs for a series.
- Branches `<type>/<kebab-topic>` (`feat/`, `fix/`, `refactor/`, `test/`, `docs/`, `chore/`).
- PR title `[scope] 한국어 요약` — scopes: `global`, `core`, `ui`, `capture`, `detect`, `api`,
  `test`. PR body in Korean: `## 변경 사항` / `## 테스트` / `## 스택`.
- Commits: Conventional Commits, English, imperative, ≤ 72 chars.
- No AI attribution in commits or PRs (no `Co-Authored-By`, no "Generated with").
- TDD: failing test first (unit or harness e2e), then the code. `npm run check` and
  `npm run e2e` pass before pushing.
