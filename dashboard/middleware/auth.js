/**
 * middleware/auth.js
 *
 * 단일 공유 비밀번호 인증 미들웨어.
 *
 * 설계 원칙:
 * - 환경변수(DASHBOARD_PASSWORD)에서 비밀번호를 읽음
 * - 인메모리 세션 스토어 (Map 기반, 별도 DB 불필요)
 * - HttpOnly + SameSite=Strict 쿠키로 세션 토큰 전달
 * - API 요청은 x-auth-token 헤더로도 인증 가능
 * - 로그인 시도 횟수 제한으로 brute-force 방지
 * - NAS 내부 네트워크 전용 (외부 접속 불필요)
 */

'use strict';

const crypto = require('crypto');

// ── Constants ──────────────────────────────────────────────
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1시간마다 만료 세션 정리
const COOKIE_NAME = 'dashboard_token';
const HEADER_NAME = 'x-auth-token';

// Brute-force 보호
const MAX_LOGIN_ATTEMPTS = 10;        // 윈도우 내 최대 시도 횟수
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15분 윈도우
const LOCKOUT_MS = 15 * 60 * 1000;      // 잠금 시간

// 인증 없이 접근 가능한 경로 패턴
const PUBLIC_PATHS = [
  '/api/login',
  '/login.html',
  '/style.css',
  '/favicon.ico',
];

// ── Session Store ──────────────────────────────────────────
/**
 * 인메모리 세션 저장소.
 * Map<token: string, { created: number, lastAccess: number }>
 */
const sessions = new Map();

/**
 * 로그인 시도 추적 (IP별).
 * Map<ip: string, { attempts: number, firstAttempt: number, lockedUntil: number }>
 */
const loginAttempts = new Map();

// ── 주기적 세션 정리 ────────────────────────────────────────
let cleanupTimer = null;

function startSessionCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (now - session.created > SESSION_TTL_MS) {
        sessions.delete(token);
      }
    }
    // 만료된 로그인 시도 기록도 정리
    for (const [ip, record] of loginAttempts) {
      if (now > record.lockedUntil && now - record.firstAttempt > LOGIN_WINDOW_MS) {
        loginAttempts.delete(ip);
      }
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
  // 프로세스 종료 시 타이머가 프로세스를 잡아두지 않도록
  cleanupTimer.unref();
}

function stopSessionCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// ── Token 생성 ─────────────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Cookie 파싱 ────────────────────────────────────────────
function parseCookie(req, name) {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  const match = cookies.split(';').find(c => c.trim().startsWith(name + '='));
  return match ? match.split('=')[1].trim() : null;
}

// ── IP 추출 ────────────────────────────────────────────────
function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ── Brute-force 보호 ──────────────────────────────────────
/**
 * 로그인 시도가 허용되는지 확인.
 * @param {string} ip
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
function checkLoginAllowed(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record) {
    return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS, retryAfterMs: 0 };
  }

  // 잠금 상태 확인
  if (record.lockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: record.lockedUntil - now,
    };
  }

  // 윈도우 만료 시 초기화
  if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS, retryAfterMs: 0 };
  }

  const remaining = MAX_LOGIN_ATTEMPTS - record.attempts;
  return { allowed: remaining > 0, remaining: Math.max(0, remaining), retryAfterMs: 0 };
}

/**
 * 실패한 로그인 시도를 기록.
 * @param {string} ip
 */
function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { attempts: 1, firstAttempt: now, lockedUntil: 0 });
    return;
  }

  record.attempts++;
  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    console.warn(`[auth] IP ${ip} locked out for ${LOCKOUT_MS / 1000}s after ${record.attempts} failed attempts`);
  }
}

/**
 * 성공 시 시도 기록 초기화.
 * @param {string} ip
 */
function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

// ── 세션 검증 ──────────────────────────────────────────────
/**
 * 토큰으로 유효한 세션이 있는지 확인.
 * @param {string} token
 * @returns {boolean}
 */
function validateSession(token) {
  if (!token || !sessions.has(token)) return false;

  const session = sessions.get(token);
  if (Date.now() - session.created > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }

  session.lastAccess = Date.now();
  return true;
}

// ── 세션 생성/삭제 ─────────────────────────────────────────
function createSession() {
  const token = generateToken();
  sessions.set(token, { created: Date.now(), lastAccess: Date.now() });
  return token;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

// ── 경로가 public인지 확인 ─────────────────────────────────
function isPublicPath(reqPath) {
  return PUBLIC_PATHS.some(p => reqPath === p);
}

// ── Auth Middleware ─────────────────────────────────────────
/**
 * Express 미들웨어: 인증 상태를 확인하여 미인증 요청을 차단한다.
 *
 * - PUBLIC_PATHS에 포함된 경로는 인증 없이 통과
 * - 쿠키(dashboard_token) 또는 x-auth-token 헤더로 세션 확인
 * - API 요청(/api/*)은 401 JSON 응답
 * - 페이지 요청은 /login.html로 리다이렉트
 */
function authMiddleware(req, res, next) {
  // 공개 경로는 인증 없이 통과
  if (isPublicPath(req.path)) return next();

  // 토큰 추출: 쿠키 우선, 헤더 폴백
  const token = parseCookie(req, COOKIE_NAME) || req.headers[HEADER_NAME];

  if (!validateSession(token)) {
    // API 요청은 401 JSON
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // 페이지 요청은 로그인으로 리다이렉트
    return res.redirect('/login.html');
  }

  next();
}

// ── Login Route Handler ────────────────────────────────────
/**
 * POST /api/login 핸들러.
 *
 * @param {string} password - 환경변수 DASHBOARD_PASSWORD와 비교할 비밀번호
 * @returns {Function} Express route handler
 */
function createLoginHandler(password) {
  return (req, res) => {
    const ip = getClientIp(req);

    // Brute-force 체크
    const rateCheck = checkLoginAllowed(ip);
    if (!rateCheck.allowed) {
      const retryAfterSec = Math.ceil(rateCheck.retryAfterMs / 1000);
      return res.status(429).json({
        error: '너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요.',
        retryAfterSec,
      });
    }

    const { password: inputPassword } = req.body || {};

    if (!inputPassword) {
      return res.status(400).json({ error: '비밀번호를 입력해주세요.' });
    }

    // 타이밍 공격 방지를 위한 상수 시간 비교
    const inputBuf = Buffer.from(String(inputPassword));
    const correctBuf = Buffer.from(String(password));

    // 길이가 다르면 어차피 불일치지만, 상수 시간 비교를 위해 동일 길이로 맞춤
    const isMatch = inputBuf.length === correctBuf.length &&
      crypto.timingSafeEqual(inputBuf, correctBuf);

    if (isMatch) {
      const token = createSession();
      clearAttempts(ip);

      res.setHeader('Set-Cookie',
        `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`
      );
      return res.json({ success: true, token });
    }

    recordFailedAttempt(ip);
    return res.status(401).json({
      error: '비밀번호가 올바르지 않습니다.',
      remaining: checkLoginAllowed(ip).remaining,
    });
  };
}

// ── Logout Route Handler ───────────────────────────────────
function logoutHandler(req, res) {
  const token = parseCookie(req, COOKIE_NAME) || req.headers[HEADER_NAME];
  destroySession(token);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ success: true });
}

// ── Module Exports ─────────────────────────────────────────
module.exports = {
  authMiddleware,
  createLoginHandler,
  logoutHandler,
  startSessionCleanup,
  stopSessionCleanup,

  // 테스트용 내부 접근
  _internal: {
    sessions,
    loginAttempts,
    createSession,
    destroySession,
    validateSession,
    parseCookie,
    checkLoginAllowed,
    recordFailedAttempt,
    clearAttempts,
    generateToken,
    isPublicPath,
    getClientIp,
    SESSION_TTL_MS,
    COOKIE_NAME,
    HEADER_NAME,
    PUBLIC_PATHS,
  },
};
