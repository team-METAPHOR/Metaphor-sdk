# 변경 이력

이 프로젝트는 [유의적 버전](https://semver.org/lang/ko/)을 따릅니다.

## 0.1.1 - 2026-11-05

### 추가

- `data-metaphor-show-launcher="false"`로 상시 신고 버튼만 숨길 수 있습니다. 자동 오류·레이지클릭 안내와 안내를 통한 신고는 유지합니다.

### 수정

- 버전이 포함된 SDK 스크립트 경로도 자체 요청 필터에 포함해 SDK의 오류를 다시 신고하지 않습니다.

## 0.1.0 - 2026-11-05

첫 릴리스입니다.

### 추가

- `<script>` 태그의 `data-metaphor-project-key`, `data-metaphor-api-base` 속성으로 초기화하고 위젯 설정을 불러옵니다.
- Shadow DOM 신고 패널: 설명 입력, 동의 기반 환경 정보와 스크린샷 첨부, 접수/중복/오류 상태 표시.
- 마스킹 스크린샷: 입력/편집 영역과 `mask_selectors`를 가린 복제 DOM만 PNG로 렌더링합니다.
- multipart 전송과 `Idempotency-Key`. 네트워크/5xx 실패는 사용자 재시도로만 다시 보냅니다.
- 오류 감지: JavaScript 오류, unhandledrejection, fetch/XHR 5xx를 신고 안내로 표시합니다. 사용자가 제출해야 전송합니다.
- 1초/30px 안의 pointerdown 3회(rage click)를 감지해 수동 신고를 안내합니다. 자동 안내는 60초 간격이며 429 이후 해당 페이지 세션에서 중단합니다.
- 백엔드의 origin 검증 실패와 위젯 일일 한도 오류 코드를 처리합니다.
- 빌드 결과물 첫 줄에 SDK 버전 주석을 넣고, 태그 push 시 번들과 SRI 해시를 GitHub Release에 올립니다.

### 수정

- 신고 payload의 URL 경로에 있는 인증 정보로 보이는 세그먼트를 가립니다.
