# 개발 컨벤션

## 브랜치 전략

- **기본**: `main` 단일 브랜치에서 작업
- **큰 기능/리팩토링**: `feat/{프로젝트약칭}/{설명}` 브랜치 생성 후 머지
  - 예: `feat/website/erp-kanban`, `feat/sync/discord-webhook`
  - 프로젝트 약칭: website, sync, invoice, nesting, computeroff
- **핫픽스**: `main`에 직접 커밋 허용

## 커밋 메시지

**형식:** `{타입}: {한글 설명}`

| 타입 | 용도 | 예시 |
|------|------|------|
| `feat` | 새 기능 | `feat: Discord 웹훅 알림 추가` |
| `fix` | 버그 수정 | `fix: DXF 중복 분류 버그 수정` |
| `refactor` | 리팩토링 (동작 변화 없음) | `refactor: SyncEngine 3클래스 분리` |
| `docs` | 문서 변경 | `docs: 세션 #014 완료 기록` |
| `chore` | 빌드, 설정, 의존성 | `chore: 버전 v1.30.1 업데이트` |
| `perf` | 성능 개선 | `perf: framer-motion CSS 전환 최적화` |
| `test` | 테스트 추가/수정 | `test: DetectionService 유닛 테스트 43개 추가` |
| `style` | 코드 포맷, 공백 등 | `style: ESLint 자동 수정 적용` |

## 테스트 정책

### Python 프로젝트 (관리프로그램, 네스팅)
- **pytest** 기반
- TDD 권장: Red → Green → Refactor
- 마커: `unit`, `integration`, `e2e`, `real_api`
- 실제 API 테스트는 `@pytest.mark.real_api`로 분리

### Electron (외부웹하드동기화)
- **Vitest** 유닛 테스트
- **Playwright** E2E 테스트
- **MSW** mock API

### 웹사이트
- 핵심 API 엔드포인트 테스트 필수
- 프론트엔드 컴포넌트 테스트는 선택

### 공통 원칙
- 전체 커버리지 강제 없음
- **"깨지면 안 되는 것"** 위주 실용적 접근
- CI에서 테스트 실패 시 머지 차단 (향후 도입)

## 문서화 규칙

### spec-code-sync (전 프로젝트 공통)
- 코드 변경 시 관련 `docs/specs/` 문서 반드시 업데이트
- 스펙과 코드의 불일치는 기술 부채로 간주

### 버전 관리
- **데스크톱 앱**: SemVer (`MAJOR.MINOR.PATCH`) + CHANGELOG.md 유지
- **웹사이트**: 커밋 해시 기반 버전

### 세션 기록
- 개발 세션 작업 내역을 `docs/sessions/` 또는 `docs/devlog/`에 기록
- 형식: `세션 #{번호} — {날짜} — {요약}`

## 코드 스타일

### TypeScript / JavaScript
- ESLint + Prettier (프로젝트별 설정 따름)
- strict mode 사용
- 타입 any 최소화

### Python
- 기존 프로젝트 코드 스타일 유지
- 타입 힌트 권장 (Pydantic 모델 활용)
- docstring: 공개 함수/클래스에 필수

### 공통
- 함수/클래스명은 용도를 알 수 있는 명확한 이름
- 매직 넘버 대신 상수/설정값 사용
- 주석은 "왜(why)"를 설명, "무엇(what)"은 코드가 설명
