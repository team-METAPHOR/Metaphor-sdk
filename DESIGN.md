# 신고 위젯

고객 사이트 방문자가 오류를 설명하고, 선택한 정보만 보내는 독립적인 Shadow DOM 패널입니다.
주요 동작은 `신고 보내기`입니다. 읽기 순서는 제목/설명, 전송 동의, 접수 상태와 동작입니다.
필수 요소는 신고 버튼, 제목, 설명, 환경/스크린샷 동의, 전송, 취소, 접수 번호 및 오류 상태입니다.
장식, 분석 대시보드, 계정 기능은 포함하지 않습니다.

Layout: 고정 우하단 버튼과 안내 버튼 → 중앙 native dialog. dialog가 최대 viewport 높이 안에서 스크롤합니다. 호스트 페이지의 스크롤과 스타일은 변경하지 않습니다.

## 토큰

| 역할    | 밝은 테마 | 어두운 테마 |
| ------- | --------- | ----------- |
| surface | #ffffff   | #111827     |
| ink     | #172033   | #f1f5f9     |
| edge    | #64748b   | #94a3b8     |
| focus   | #2563eb   | #60a5fa     |

글꼴은 system-ui, 본문 16px/1.5, 제목 22px입니다. 간격은 8/16/24px, 모서리는 8/10/16px입니다.
모든 색상·간격·모서리·글자 크기·geometry는 Shadow host의 CSS custom property로 선언합니다.
추가 geometry 토큰은 float-gap 20px, control-height 44px, field-padding 10px, panel-width 440px, viewport-gap 32px,
focus-width/offset 3px, border-width 1px, textarea-height 120px, checkbox-size 18px입니다.
disabled 버튼은 edge 배경과 surface 글자로 표시하며 opacity를 낮추지 않습니다.
버튼과 체크박스 라벨의 터치 높이는 44px 이상입니다. 취소와 전송은 같은 높이를 사용합니다.
native dialog의 focus 이동/Tab 제한/Escape 닫기를 사용하며, 모든 입력에 명시적인 라벨을 연결합니다.
주요 버튼, 보조 버튼, 입력, 체크박스, 상태 영역을 기본 요소로 사용합니다.
로딩/완료 시 버튼 문구와 크기를 유지하고 별도 live status 영역에서 상태를 알립니다.
테마는 prefers-color-scheme을 따르고, 동작을 지연시키는 애니메이션은 사용하지 않습니다.

## 확인

`e2e/visual.spec.ts`에서 320/390/1440px, 밝은/어두운 테마, 키보드 focus, 전송 전후 크기, 패널 스크롤/overflow와 스크린샷을 검사합니다.
반응 없는 버튼 안내는 위치와 시간만 메모리에 유지하며 세 번째 pointerdown에서 판단합니다. 네트워크로 클릭 정보를 보내지 않습니다.
