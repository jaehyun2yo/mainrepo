# Doppler 환경변수 관리

> 최종 업데이트: 2026-04-15

## 개요

모든 환경변수를 [Doppler](https://dashboard.doppler.com)에서 중앙 관리한다.
기존 `.env.local` 파일 기반 관리에서 Doppler 단일 소스로 전환.

```
Doppler (단일 소스)
├── dev config ──→ 로컬 개발 (doppler run)
│                  Vercel Preview (자동 sync)
├── prd config ──→ Vercel Production (자동 sync)
│                  Railway (DOPPLER_TOKEN + Dockerfile)
└── stg config ──→ (미사용, 필요시 설정)
```

## 프로젝트 정보

| 항목 | 값 |
|------|-----|
| Doppler Workspace | `yjlaser_web` |
| Doppler Project | `yjlaser` |
| Config (개발) | `dev` — 43개 키 |
| Config (프로덕션) | `prd` — 42개 키 |
| Config (스테이징) | `stg` — 미설정 |

## 로컬 개발

### 기본 (Doppler 주입)

```bash
pnpm dev          # Next.js — doppler run으로 env 자동 주입
pnpm webhard:dev  # NestJS — doppler run으로 env 자동 주입
pnpm dev:all      # 둘 다 실행
```

### Doppler 없이 사용

```bash
pnpm doppler:pull  # Doppler → .env.local 다운로드
pnpm dev:env       # .env.local 직접 사용 (doppler 없이)
```

### 초기 셋업

```bash
# 1. Doppler CLI 설치 (Windows)
winget install doppler.cli

# 2. 로그인
doppler login

# 3. 프로젝트 연결 (yjlaser_website/ 디렉토리에서)
doppler setup --project yjlaser --config dev
```

## 배포 연동

### Vercel (Next.js 프론트엔드)

Doppler → Vercel 자동 sync 설정 완료.

| Doppler Config | Vercel Environment | 상태 |
|---|---|---|
| `dev` | Preview | In Sync |
| `prd` | Production | In Sync |

Doppler에서 값 변경 시 Vercel에 자동 반영된다.
Vercel 대시보드에서 직접 환경변수를 수정하지 말 것 — Doppler가 덮어쓴다.

### Railway (NestJS 백엔드)

Dockerfile에 Doppler CLI가 포함되어 있고, `DOPPLER_TOKEN` 환경변수로 시크릿을 주입한다.

```dockerfile
# Dockerfile 내부 로직
if [ -n "$DOPPLER_TOKEN" ]; then
    doppler run -- sh -c 'npx prisma migrate deploy && node dist/main'
else
    npx prisma migrate deploy && node dist/main
fi
```

- `DOPPLER_TOKEN`이 있으면 → Doppler에서 시크릿 주입
- `DOPPLER_TOKEN`이 없으면 → Railway 환경변수 직접 사용 (fallback)

Railway에 설정된 서비스 토큰: `railway-webhard-api` (prd config, read-only)

## 환경변수 추가/수정 방법

### 1. Doppler 대시보드에서 추가

```
dashboard.doppler.com → yjlaser → dev 또는 prd → 변수 추가
```

### 2. CLI로 추가

```bash
# dev에 추가
doppler secrets set NEW_VAR=value --project yjlaser --config dev

# prd에 추가
doppler secrets set NEW_VAR=value --project yjlaser --config prd
```

### 3. 확인

```bash
# 전체 목록
doppler secrets --project yjlaser --config dev

# 특정 값 확인
doppler secrets get NEW_VAR --project yjlaser --config dev
```

## 환경별 차이점

| 변수 | dev | prd |
|------|-----|-----|
| `DATABASE_URL` | `fbtkoikwsytoamlddpms` (dev DB) | `ibsbcuumkdhwesrpaqeb` (prod DB) |
| `R2_BUCKET_NAME` | `yjlaser-dev` | `yjlaser` |
| `NODE_ENV` | `development` | `production` |
| `NEXT_PUBLIC_WEBHARD_API_URL` | `http://localhost:4000` | `https://webhard-api-production.up.railway.app` |
| `NEXT_PUBLIC_SITE_URL` | `https://www.yjlaser.net` | `https://www.yjlaser.net` |
| `SESSION_SECRET` | dev용 | prod용 (별도 값) |
| `SMTP_PASSWORD` | dev용 앱 비밀번호 | prod용 앱 비밀번호 |
| `INNGEST_*` | 없음 | prod 키 설정됨 |

## 파일 구조

```
yjlaser_website/
├── doppler.yaml              # Doppler 프로젝트/config 연결 설정
├── .env.local                # (선택) doppler:pull로 생성, gitignore됨
├── .env.example              # 변수 목록 참조용
├── package.json              # dev/webhard:dev에 doppler run 연동
└── webhard-api/
    └── Dockerfile            # Doppler CLI 설치 + DOPPLER_TOKEN 기반 주입
```

## 주의사항

- **Vercel 대시보드에서 환경변수 직접 수정 금지** — Doppler sync가 덮어씀
- **Railway 환경변수 추가 시** Doppler `prd`에도 동일하게 추가할 것
- **`.env.local`은 백업용** — Doppler CLI가 없는 환경에서만 사용
- **서비스 토큰 노출 주의** — `DOPPLER_TOKEN`은 Railway 환경변수에만 보관
