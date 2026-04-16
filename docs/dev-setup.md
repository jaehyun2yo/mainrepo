# 새 데스크탑 개발환경 셋업 가이드

> 최종 업데이트: 2026-04-16

새 PC에서 yjlaser 프로젝트 개발환경을 처음부터 설정하는 가이드.

## 필수 프로그램 설치

### 1. 기본 도구

```powershell
# winget으로 일괄 설치 (PowerShell 관리자 권한)
winget install Git.Git
winget install OpenJS.NodeJS.LTS          # Node.js 20+
winget install CoreyButler.NVMforWindows  # (선택) Node 버전 관리
winget install pnpm.pnpm
winget install Microsoft.VisualStudioCode
winget install Doppler.CLI
```

설치 후 터미널을 재시작하여 PATH 반영.

### 2. 설치 확인

```bash
node -v       # v20 이상
pnpm -v       # v9 이상
git --version
doppler -v
```

## 레포지토리 클론

```bash
cd ~/Desktop/dev/projects  # 원하는 위치
git clone https://github.com/jaehyun2yo/yjlaser.git
cd yjlaser/yjlaser_website
```

## Doppler 연결

```bash
# 1. Doppler 로그인 (브라우저가 열림)
doppler login

# 2. 프로젝트 연결
cd yjlaser_website
doppler setup --project yjlaser --config dev

# 3. 연결 확인
doppler run -- node -e "console.log('DB:', process.env.DATABASE_URL?.substring(0,30))"
```

> Doppler 계정이 없으면 기존 관리자에게 workspace 초대를 요청하세요.
> Workspace: `yjlaser_web` (dashboard.doppler.com)

## 의존성 설치 + DB 셋업

```bash
# 루트 + 백엔드 의존성 설치
pnpm install
cd webhard-api && pnpm install && cd ..

# Prisma 클라이언트 생성
cd webhard-api && npx prisma generate && cd ..

# DB 마이그레이션 적용 (Doppler에서 DATABASE_URL 주입)
cd webhard-api && doppler run -- npx prisma migrate deploy && cd ..

# 시드 데이터 삽입
cd webhard-api && doppler run -- npx prisma db seed && cd ..
```

또는 셋업 스크립트 사용 (Doppler로 .env.local 먼저 생성):

```bash
pnpm doppler:pull         # Doppler → .env.local 생성
bash scripts/setup-dev.sh # 의존성 + Prisma + 마이그레이션 + 시드
```

## 개발 서버 실행

```bash
# 둘 다 실행
pnpm dev:all

# 또는 개별 실행
pnpm dev          # Next.js  → http://localhost:3000
pnpm webhard:dev  # NestJS   → http://localhost:4000
```

정상 작동 확인:
- http://localhost:3000 — 메인 페이지 로드
- http://localhost:4000/api/v1/health — `{"status":"ok"}` 응답

## IDE 설정

### VS Code 권장 확장

```
ESLint
Prettier - Code formatter
Tailwind CSS IntelliSense
Prisma
```

### VS Code 설정 (선택)

```jsonc
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

## Claude Code 설정 (선택)

```bash
# Claude Code CLI 설치
npm install -g @anthropic-ai/claude-code

# 프로젝트 디렉토리에서 실행
cd yjlaser_website
claude
```

프로젝트 규칙은 `CLAUDE.md` 파일에 정의되어 있어 자동으로 로드됨.

## 트러블슈팅

### Doppler 관련

| 증상 | 해결 |
|------|------|
| `doppler: command not found` | 터미널 재시작 또는 `winget install Doppler.CLI` |
| `Error: authentication required` | `doppler login` 재실행 |
| `Error: project not found` | workspace 초대 확인 → `doppler me`로 workspace 확인 |
| `ECONNREFUSED` (DB 연결 실패) | `doppler run -- node -e "console.log(process.env.DATABASE_URL)"` 로 URL 확인 |

### Doppler 없이 개발해야 하는 경우

기존 환경의 `.env.local`을 복사하거나, `.env.example`을 참조하여 수동 작성:

```bash
cp .env.example .env.local
# .env.local을 열어서 값 채우기 (기존 개발자에게 값 요청)
pnpm dev:env  # Doppler 없이 .env.local 직접 사용
```

### Prisma 관련

| 증상 | 해결 |
|------|------|
| `prisma generate` 실패 | `cd webhard-api && pnpm install` 후 재시도 |
| 마이그레이션 에러 | `doppler run -- npx prisma migrate status`로 상태 확인 |
| `P1001: connection refused` | DATABASE_URL 값 확인, VPN/방화벽 확인 |

### 포트 충돌

```bash
# 3000 또는 4000 포트가 사용 중인 경우
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

## 요약 체크리스트

```
[ ] Git, Node.js 20+, pnpm 설치
[ ] Doppler CLI 설치 + 로그인
[ ] 레포 클론
[ ] doppler setup --project yjlaser --config dev
[ ] pnpm install + webhard-api pnpm install
[ ] Prisma generate + migrate deploy + db seed
[ ] pnpm dev:all → localhost:3000, :4000 동작 확인
```
