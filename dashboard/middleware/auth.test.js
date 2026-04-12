/**
 * middleware/auth.test.js
 *
 * 인증 미들웨어 단위 테스트.
 * 실행: node middleware/auth.test.js
 */

'use strict';

const {
  authMiddleware,
  createLoginHandler,
  logoutHandler,
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
    isPublicPath,
    SESSION_TTL_MS,
    COOKIE_NAME,
    HEADER_NAME,
  },
} = require('./auth');

// ── Test helpers ───────────────────────────────────────────
let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  testCount++;
  if (condition) {
    passCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failCount++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  testCount++;
  if (actual === expected) {
    passCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failCount++;
    console.error(`  ✗ ${message} — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`);
  }
}

function mockReq(overrides = {}) {
  return {
    path: overrides.path || '/',
    headers: overrides.headers || {},
    body: overrides.body || {},
    ip: overrides.ip || '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    _redirect: null,
    _headers: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; },
    redirect(url) { res._redirect = url; return res; },
    setHeader(key, value) { res._headers[key] = value; return res; },
  };
  return res;
}

function cleanup() {
  sessions.clear();
  loginAttempts.clear();
}

// ── Tests ──────────────────────────────────────────────────

console.log('\n=== parseCookie ===');
(() => {
  const req = { headers: { cookie: 'dashboard_token=abc123; other=xyz' } };
  assertEqual(parseCookie(req, 'dashboard_token'), 'abc123', 'dashboard_token 쿠키 파싱');
  assertEqual(parseCookie(req, 'other'), 'xyz', 'other 쿠키 파싱');
  assertEqual(parseCookie(req, 'missing'), null, '없는 쿠키는 null');
  assertEqual(parseCookie({ headers: {} }, 'dashboard_token'), null, '쿠키 헤더 없으면 null');
})();

console.log('\n=== isPublicPath ===');
(() => {
  assert(isPublicPath('/api/login'), '/api/login은 공개');
  assert(isPublicPath('/login.html'), '/login.html은 공개');
  assert(isPublicPath('/style.css'), '/style.css는 공개');
  assert(isPublicPath('/favicon.ico'), '/favicon.ico는 공개');
  assert(!isPublicPath('/api/status'), '/api/status는 비공개');
  assert(!isPublicPath('/'), '/은 비공개');
  assert(!isPublicPath('/index.html'), '/index.html은 비공개');
})();

console.log('\n=== createSession / validateSession / destroySession ===');
(() => {
  cleanup();

  const token = createSession();
  assert(typeof token === 'string' && token.length === 64, '토큰은 64자 hex 문자열');
  assert(sessions.has(token), '세션 맵에 저장됨');
  assert(validateSession(token), '유효한 세션 검증 통과');
  assert(!validateSession('invalid-token'), '잘못된 토큰은 실패');
  assert(!validateSession(null), 'null 토큰은 실패');
  assert(!validateSession(''), '빈 문자열 토큰은 실패');

  destroySession(token);
  assert(!sessions.has(token), '세션 삭제됨');
  assert(!validateSession(token), '삭제된 세션 검증 실패');

  cleanup();
})();

console.log('\n=== Session TTL expiry ===');
(() => {
  cleanup();

  const token = createSession();
  // 세션의 created 시간을 TTL 이전으로 조작
  sessions.get(token).created = Date.now() - SESSION_TTL_MS - 1000;
  assert(!validateSession(token), '만료된 세션은 검증 실패');
  assert(!sessions.has(token), '만료된 세션은 자동 삭제됨');

  cleanup();
})();

console.log('\n=== authMiddleware — 공개 경로 ===');
(() => {
  cleanup();

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  // /api/login은 통과
  nextCalled = false;
  authMiddleware(mockReq({ path: '/api/login' }), mockRes(), next);
  assert(nextCalled, '/api/login은 next() 호출');

  // /login.html은 통과
  nextCalled = false;
  authMiddleware(mockReq({ path: '/login.html' }), mockRes(), next);
  assert(nextCalled, '/login.html은 next() 호출');

  cleanup();
})();

console.log('\n=== authMiddleware — 미인증 API 요청 차단 ===');
(() => {
  cleanup();

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const res = mockRes();
  authMiddleware(mockReq({ path: '/api/status' }), res, next);
  assert(!nextCalled, '미인증 API 요청은 next() 미호출');
  assertEqual(res._status, 401, '401 상태코드');
  assertEqual(res._json?.error, 'Unauthorized', 'Unauthorized 에러 메시지');

  cleanup();
})();

console.log('\n=== authMiddleware — 미인증 페이지 요청 리다이렉트 ===');
(() => {
  cleanup();

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const res = mockRes();
  authMiddleware(mockReq({ path: '/' }), res, next);
  assert(!nextCalled, '미인증 페이지 요청은 next() 미호출');
  assertEqual(res._redirect, '/login.html', '/login.html로 리다이렉트');

  cleanup();
})();

console.log('\n=== authMiddleware — 유효한 토큰 (쿠키) ===');
(() => {
  cleanup();

  const token = createSession();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const req = mockReq({
    path: '/api/status',
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  });
  const res = mockRes();
  authMiddleware(req, res, next);
  assert(nextCalled, '유효한 쿠키 토큰으로 next() 호출');

  cleanup();
})();

console.log('\n=== authMiddleware — 유효한 토큰 (헤더) ===');
(() => {
  cleanup();

  const token = createSession();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const req = mockReq({
    path: '/api/status',
    headers: { [HEADER_NAME]: token },
  });
  const res = mockRes();
  authMiddleware(req, res, next);
  assert(nextCalled, '유효한 헤더 토큰으로 next() 호출');

  cleanup();
})();

console.log('\n=== createLoginHandler — 정상 로그인 ===');
(() => {
  cleanup();

  const handler = createLoginHandler('test-password');
  const req = mockReq({ body: { password: 'test-password' }, ip: '10.0.0.1' });
  const res = mockRes();

  handler(req, res);
  assertEqual(res._json?.success, true, '로그인 성공');
  assert(typeof res._json?.token === 'string', '토큰 반환됨');
  assert(res._headers['Set-Cookie']?.includes(COOKIE_NAME), '쿠키 설정됨');

  cleanup();
})();

console.log('\n=== createLoginHandler — 잘못된 비밀번호 ===');
(() => {
  cleanup();

  const handler = createLoginHandler('correct-password');
  const req = mockReq({ body: { password: 'wrong' }, ip: '10.0.0.2' });
  const res = mockRes();

  handler(req, res);
  assertEqual(res._status, 401, '401 상태코드');
  assert(res._json?.error?.length > 0, '에러 메시지 있음');

  cleanup();
})();

console.log('\n=== createLoginHandler — 비밀번호 미입력 ===');
(() => {
  cleanup();

  const handler = createLoginHandler('test-password');
  const req = mockReq({ body: {}, ip: '10.0.0.3' });
  const res = mockRes();

  handler(req, res);
  assertEqual(res._status, 400, '400 상태코드');

  cleanup();
})();

console.log('\n=== Brute-force protection ===');
(() => {
  cleanup();

  const ip = '192.168.1.100';

  // 초기 상태
  let check = checkLoginAllowed(ip);
  assert(check.allowed, '초기: 로그인 허용');
  assertEqual(check.remaining, 10, '초기: 10회 남음');

  // 9회 실패 기록
  for (let i = 0; i < 9; i++) {
    recordFailedAttempt(ip);
  }
  check = checkLoginAllowed(ip);
  assert(check.allowed, '9회 실패 후: 아직 허용');
  assertEqual(check.remaining, 1, '9회 실패 후: 1회 남음');

  // 10회 실패 → 잠금
  recordFailedAttempt(ip);
  check = checkLoginAllowed(ip);
  assert(!check.allowed, '10회 실패 후: 잠금');
  assert(check.retryAfterMs > 0, '잠금 해제까지 시간 있음');

  // 잠금 상태에서 로그인 시도
  const handler = createLoginHandler('correct-password');
  const req = mockReq({ body: { password: 'correct-password' }, ip });
  const res = mockRes();
  handler(req, res);
  assertEqual(res._status, 429, '잠금 상태에서 429 응답');

  cleanup();
})();

console.log('\n=== Brute-force protection — clearAttempts ===');
(() => {
  cleanup();

  const ip = '192.168.1.200';
  for (let i = 0; i < 5; i++) {
    recordFailedAttempt(ip);
  }
  clearAttempts(ip);
  const check = checkLoginAllowed(ip);
  assert(check.allowed, '초기화 후: 로그인 허용');
  assertEqual(check.remaining, 10, '초기화 후: 10회 남음');

  cleanup();
})();

console.log('\n=== logoutHandler ===');
(() => {
  cleanup();

  const token = createSession();
  assert(sessions.has(token), '로그아웃 전: 세션 존재');

  const req = mockReq({ headers: { cookie: `${COOKIE_NAME}=${token}` } });
  const res = mockRes();
  logoutHandler(req, res);

  assert(!sessions.has(token), '로그아웃 후: 세션 삭제됨');
  assertEqual(res._json?.success, true, '로그아웃 성공 응답');
  assert(res._headers['Set-Cookie']?.includes('Max-Age=0'), '쿠키 만료 설정됨');

  cleanup();
})();

// ── Summary ────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`  Total: ${testCount} | Pass: ${passCount} | Fail: ${failCount}`);
console.log('='.repeat(50));

process.exit(failCount > 0 ? 1 : 0);
