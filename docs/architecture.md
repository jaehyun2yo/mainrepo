# 아키텍처 — 프로젝트 간 연동

> 최종 업데이트: 2026-04-09

## 데이터 흐름

```
[거래처]
   ├─ 웹사이트 문의 ──→ [yjlaser_website] ──→ 자체 웹하드 (Cloudflare R2)
   └─ LGU+ 웹하드 ──→ [외부웹하드동기화프로그램] ──→ 자체 웹하드 (R2)
                                                        │
                                                        ↓
                                             DXF 작업폴더 (네트워크 공유)
                                                  │          │
                                                  ↓          ↓
                                        [관리프로그램]   [네스팅프로그램]
                                        파일분류/청구서   합판 최적화
                                                              │
                                                              ↓
                                                    네트워크 공유 Excel
                                                    (레이저가공 작업목록)

[yjlaser_website] ──→ Worker 작업관리 (사무실/현장/납품 통합)
[computeroff] ──→ 독립 인프라 (PC 부팅/종료 모니터링)
```

## 공유 자원

| 자원 | 경로/주소 | 사용 프로그램 |
|------|---------|-------------|
| DXF 작업폴더 | `\\192.168.0.6\home\데이터\유진MAIN\dxf\` | 관리프로그램, 네스팅프로그램 |
| 자체 웹하드 | Cloudflare R2 (`yjlaser` 버킷) | 웹사이트, 동기화프로그램 |
| 외부 웹하드 | `only.webhard.co.kr` (LGU+) | 동기화프로그램 |
| 레이저가공 Excel | 네트워크 공유 | 네스팅프로그램 |

## 인증 방식

| 프로그램 | 인증 |
|---------|------|
| 웹 API | X-API-Key 헤더 (`ApiKeyGuard`) |
| 웹 거래처 | bcrypt + 커스텀 세션 토큰 (httpOnly 쿠키, 4시간 만료) |
| 웹 관리자 | 환경변수 기반 정적 인증 |
| 외부웹하드 동기화 | Playwright 쿠키 (LGU+) + X-API-Key (자체 웹하드) |
| 데스크톱 앱 (네스팅, 관리프로그램) | SQLite 기반 암호화 자격증명 |
| computeroff 대시보드 | bcrypt + 세션/CSRF |

## 데이터베이스

| 프로그램 | DB | 주요 모델/테이블 |
|---------|----|----|
| yjlaser_website | PostgreSQL (Prisma ORM) | Company, WebhardFile, WebhardFolder, Order, Task, ErpWorker, ApiKey 등 |
| 관리프로그램 | SQLite | transmission_history, failed_queue, invoice_work_status |
| 외부웹하드 동기화 | SQLite (WAL 모드) | sync_events, event_log, checkpoints, dead_letter_queue |
| 레이저네스팅 | SQLite | 네스팅 결과, 설정 |
| computeroff | SQLite | events, heartbeats, computers |

## 기술 스택 상세

| 프로그램 | 핵심 기술 | 주요 의존성 |
|---------|---------|-----------|
| yjlaser_website | Next.js 15, NestJS 10, Prisma | React 19, TypeScript 5, Tailwind CSS 4, R2, Redis (Upstash) |
| 외부웹하드동기화 | Electron 40, React 19, TypeScript 5.9 | better-sqlite3, electron-builder, Zustand 5 |
| 관리프로그램 | Python ≥3.8, PyQt5 ≥5.15 | Popbill SDK, openpyxl, ezdxf, Pydantic |
| 네스팅프로그램 | Python ≥3.8, PyQt6 ≥6.5 | ezdxf ≥1.1, Shapely ≥2.0, NumPy, SciPy |
| computeroff | Python, FastAPI 0.104 | uvicorn, bcrypt, slowapi (레이트 제한) |

## 배포 환경

| 프로그램 | 배포 방식 | 환경 | 비고 |
|---------|---------|------|------|
| yjlaser_website (프론트) | Vercel | 클라우드 (ICN1 리전) | — |
| yjlaser_website (백엔드) | Railway (Docker) | 클라우드 | node:20-alpine 멀티스테이지 |
| 외부웹하드동기화 | NSIS 설치파일 + GitHub Release | Windows x64 | NAS 자동 업데이트 |
| 관리프로그램 | Inno Setup + PyInstaller | Windows | — |
| 네스팅프로그램 | PyInstaller → Nasting.exe | Windows | — |
| computeroff (서버) | Railway (NIXPACKS) | 클라우드 | — |
| computeroff (에이전트) | Inno Setup + PyInstaller | Windows (7+) | x64/x86 지원 |
