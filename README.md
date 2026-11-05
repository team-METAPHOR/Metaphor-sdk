# Metaphor Web SDK

고객사 사이트에 `<script>` 한 줄로 넣는 버그 신고 SDK입니다. 실제 사용자가 스크린샷과 설명으로 버그를 신고하면 Metaphor 백엔드가 AI QA 엔진으로 재현·검증합니다.

```html
<script src="https://api.<metaphor>/sdk/v1/metaphor.js"
        data-metaphor-project-key="mpk_..."
        data-metaphor-api-base="https://api.<metaphor>" defer></script>
```

SDK 파일은 별도 CDN이 아니라 Metaphor 백엔드가 `<api_base>/sdk/v1/` 아래에서 직접 서빙합니다.
설치 코드는 Metaphor 대시보드의 위젯 설정 화면에서 복사해 쓰는 것을 권장합니다. 대시보드 코드는 버전 고정 URL과 `integrity` 값을 함께 넣어 줍니다.

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

## 릴리스

1. `package.json`의 `version`을 올립니다(`npm version X.Y.Z --no-git-tag-version`).
2. `CHANGELOG.md`에 해당 버전 항목을 추가합니다.
3. PR을 `main`에 머지한 뒤 그 커밋에 `vX.Y.Z` 태그를 만들어 push합니다.

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

`.github/workflows/release.yml`이 태그와 `package.json` 버전이 같은지 확인하고 `npm run check`를 통과한 빌드를 GitHub Release에 올립니다.
Release 파일은 `metaphor.js`, `metaphor.js.sha384`(`sha384-<base64>` 형식 SRI 해시), `VERSION`입니다.
빌드 결과물 첫 줄에는 `/*! Metaphor Web SDK vX.Y.Z */` 주석이 들어갑니다.

## SRI 사용

백엔드가 Release 파일을 받아 두 경로로 서빙합니다(team-METAPHOR/Metaphor-back#85).

| URL | 내용 | 캐시 |
|---|---|---|
| `/sdk/v1/metaphor.js` | 최신 버전. 릴리스마다 내용이 바뀜 | `max-age=300` |
| `/sdk/v1/metaphor-<version>.js` | 해당 버전 고정. 내용이 바뀌지 않음 | 1년, `immutable` |

`integrity`는 버전 고정 URL(`metaphor-<version>.js`)에만 붙입니다. 최신 URL은 새 버전이 배포되면 내용이 바뀌므로, 여기에 `integrity`를 붙이면 해시가 맞지 않아 브라우저가 스크립트를 조용히 차단하고 위젯이 뜨지 않습니다.
해시 값은 그 버전 Release의 `metaphor.js.sha384`이며 `crossorigin="anonymous"`를 함께 지정합니다. 대시보드에서 복사한 설치 코드에는 이미 들어 있습니다.

```html
<script src="https://api.<metaphor>/sdk/v1/metaphor-0.1.0.js"
        integrity="sha384-..."
        crossorigin="anonymous"
        data-metaphor-project-key="mpk_..."
        data-metaphor-api-base="https://api.<metaphor>" defer></script>
```

새 버전으로 올릴 때는 URL의 버전과 `integrity` 값을 함께 바꿉니다.

## 현재 상태

Shadow DOM 신고 패널, 동의 기반 환경 정보/마스킹 PNG, multipart 전송과 접수/중복/오류 상태를 제공합니다.
오류 감지는 JavaScript 오류, unhandledrejection, fetch/XHR 5xx를 신고 안내로 표시하며 사용자가 제출해야 전송합니다.
1초/30px 안의 pointerdown 3회도 수동 신고를 안내합니다. 자동 안내는 60초 간격이며 429 이후 해당 페이지 세션에서 중단합니다.

## 개인정보 및 캡처

모든 SDK 요청은 `credentials: "omit"`이며 호스트 입력값, 요청/응답 헤더·본문, 저장소, 클릭 기록을 수집하지 않습니다.
페이지 URL의 쿼리/fragment를 제거하고, 신고 텍스트의 이메일/명시적 인증 정보와 URL 쿼리를 가립니다.
오류 메시지는 오류 종류만 사용하고 HTTP는 method/path/status만 기록합니다.

스크린샷은 입력/편집 영역과 `mask_selectors`를 가린 복제 DOM만 렌더링하며 SDK UI는 제외합니다.
외부 리소스를 가져오지 않으므로 이미지, 영상, iframe, canvas, SVG 및 shadow 콘텐츠는 검게 표시됩니다.
외부 배경 이미지와 의사 요소, 사용자 글꼴은 원본과 다를 수 있습니다. 사용자 추가 마스킹 박스 편집은 제공하지 않습니다.
이미지는 각 변 4096px/800만 픽셀 이내로 축소하고 설정된 바이트 제한을 초과하면 전송하지 않습니다.
잘못된 선택자, CSP 차단, 렌더링 실패 시 스크린샷 전송을 중단하며 동의를 해제한 텍스트 신고를 안내합니다.

CSP의 `script-src`에는 SDK origin, `connect-src`에는 API origin이 필요합니다. 캡처를 사용하려면 `img-src data:`도 허용해야 합니다.
위젯은 constructable stylesheet를 사용합니다. 지원하지 않는 브라우저에서는 위젯을 활성화하지 않습니다.
신고 화면에서 개인정보나 인증 정보를 직접 쓰지 마세요. 텍스트 가림은 알려진 패턴을 처리하며 임의의 비밀값을 판별할 수는 없습니다.

네트워크/5xx 실패는 사용자 재시도로만 다시 보내며 같은 내용과 PNG에는 동일한 Idempotency-Key를 사용합니다.
재시도 간격은 지터를 더한 30초부터 증가하고 같은 제출은 최대 세 번 시도합니다. 내용이 바뀌면 새 키를 사용합니다.
실제 backend와의 통합 테스트는 실행하지 않았으며 테스트는 `e2e/mock.ts`의 서로 다른 origin으로 수행합니다.
