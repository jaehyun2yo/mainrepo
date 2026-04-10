# YJLaser 프로젝트 지침

## 기본 규칙

- 모든 답변은 **한글**로 작성한다.
- 코드 주석, 변수명, 기술 용어는 영어 허용.
- 커밋 메시지는 **한글**로 작성한다.

---

## 회사 개요

유진레이저목형 — 도무송 목형 제작 전문 B2B 제조업체.
거래처로부터 도면을 받아 목형을 제작·납품. 업무 흐름 상세는 → [docs/workflow.md](docs/workflow.md)

---

## 활성 프로젝트

| 프로젝트 | 폴더 | 역할 | 스택 | 배포 |
|---------|------|------|------|------|
| yjlaser_website | `./yjlaser_website/` | 웹사이트·Worker 작업관리·웹하드·API | Next.js 15, NestJS, Prisma | Vercel + Railway |
| 외부웹하드동기화프로그램 | `./외부웹하드동기화프로그램/` | LGU+ → 자체 웹하드 동기화 | Electron, TS, React, SQLite | NAS 자동 업데이트 |
| 유진레이저목형 관리프로그램 | `./유진레이저목형 관리프로그램/` | DXF 분류·청구서 생성·발송 | Python, PyQt5, Popbill API | PyInstaller EXE |
| 레이저네스팅프로그램 | `./레이저네스팅프로그램/` | DXF 합판 배치 최적화 | Python 3.8, PyQt6, ezdxf | PyInstaller EXE |
| computeroff | `./computeroff/` | PC 부팅/종료 모니터링 | Python, FastAPI, SQLite | Railway + Inno Setup |

> `./현재 아직 사용안하는것들/` — 아카이브 프로젝트 보관

프로젝트 간 연동·인증·DB 상세 → [docs/architecture.md](docs/architecture.md)

---

## 개발 컨벤션 (요약)

### 브랜치
- 기본: `main` 단일 브랜치
- 큰 기능: `feat/{프로젝트약칭}/{설명}` → 머지

### 커밋 메시지
`{타입}: {한글 설명}` — feat / fix / refactor / docs / chore / perf / test

### 테스트
- Python: pytest, TDD 권장
- Electron: Vitest + Playwright
- 웹사이트: 핵심 API 테스트 필수
- **"깨지면 안 되는 것"** 위주 실용적 접근

### 문서화
- 코드 변경 → docs/specs/ 동기화 (spec-code-sync)
- 데스크톱 앱: CHANGELOG.md + SemVer 유지
- 웹사이트: 커밋 기반 버전

컨벤션 상세 → [docs/conventions.md](docs/conventions.md)

---

## 로드맵

> 추후 작성. → [docs/roadmap.md](docs/roadmap.md)

## TODO

> 추후 작성. → [docs/todo.md](docs/todo.md)

---

## 참조 문서

| 문서 | 내용 |
|------|------|
| [docs/workflow.md](docs/workflow.md) | 업무 워크플로우 상세 (접수~납품 8단계) |
| [docs/architecture.md](docs/architecture.md) | 프로젝트 간 연동, 데이터 흐름, 인증, DB |
| [docs/conventions.md](docs/conventions.md) | 개발 컨벤션 상세 (브랜치, 커밋, 테스트, 코드 스타일) |
| [docs/roadmap.md](docs/roadmap.md) | 프로젝트별 개발 로드맵 |
| [docs/todo.md](docs/todo.md) | 할일 리스트 (우선순위별) |

각 프로젝트 내부의 `CLAUDE.md`, `README.md`, `.claude/rules/`에 프로젝트별 상세 규칙 있음.

<!-- ooo:START -->
<!-- ooo:VERSION:0.28.2 -->
# Ouroboros — Specification-First AI Development

> Before telling AI what to build, define what should be built.
> As Socrates asked 2,500 years ago — "What do you truly know?"
> Ouroboros turns that question into an evolutionary AI workflow engine.

Most AI coding fails at the input, not the output. Ouroboros fixes this by
**exposing hidden assumptions before any code is written**.

1. **Socratic Clarity** — Question until ambiguity ≤ 0.2
2. **Ontological Precision** — Solve the root problem, not symptoms
3. **Evolutionary Loops** — Each evaluation cycle feeds back into better specs

```
Interview → Seed → Execute → Evaluate
    ↑                           ↓
    └─── Evolutionary Loop ─────┘
```

## ooo Commands

Each command loads its agent/MCP on-demand. Details in each skill file.

| Command | Loads |
|---------|-------|
| `ooo` | — |
| `ooo interview` | `ouroboros:socratic-interviewer` |
| `ooo seed` | `ouroboros:seed-architect` |
| `ooo run` | MCP required |
| `ooo evolve` | MCP: `evolve_step` |
| `ooo evaluate` | `ouroboros:evaluator` |
| `ooo unstuck` | `ouroboros:{persona}` |
| `ooo status` | MCP: `session_status` |
| `ooo setup` | — |
| `ooo help` | — |

## Agents

Loaded on-demand — not preloaded.

**Core**: socratic-interviewer, ontologist, seed-architect, evaluator,
wonder, reflect, advocate, contrarian, judge
**Support**: hacker, simplifier, researcher, architect
<!-- ooo:END -->
