# Metaphor Web SDK

고객사 사이트에 `<script>` 한 줄로 넣는 버그 신고 SDK입니다. 실제 사용자가 스크린샷과 설명으로 버그를 신고하면 Metaphor 백엔드가 AI QA 엔진으로 재현·검증합니다.

```html
<script src="https://<cdn>/sdk/metaphor.js"
        data-metaphor-project-key="mpk_..."
        data-metaphor-api-base="https://api.<metaphor>" defer></script>
```

- 백엔드 API 계약: `Metaphor-back/docs/api/widget-sdk.md`
- 개발 규칙과 보안 규칙: [AGENTS.md](AGENTS.md)

## 개발

```bash
npm ci
npx playwright install chromium --only-shell
npm run check     # lint, 타입, 유닛 테스트, 빌드, 번들 크기(50 KiB gzip)
npm run e2e       # Playwright (테스트 페이지와 mock API를 route로 가로챔, 서버 불필요)
```

실제 백엔드와 함께 확인할 때는 SDK가 연동된 데모 사이트 `BugLab-shop`을 사용합니다.

## 현재 상태

기본 골격만 있습니다(스크립트 태그 읽기, config 조회, 꺼져 있으면 아무것도 하지 않음). 신고 UI, 마스킹 캡처, 오류 자동 감지, 전송은 아직 구현되지 않았습니다.
