/**
 * routes/health.js
 *
 * GET /api/health — config.json의 healthcheck URL 목록에 HTTP ping을 수행하여
 * 각 서비스의 상태(up/down/timeout)와 응답시간(ms)을 반환한다.
 *
 * 응답 형태:
 * {
 *   services: [
 *     {
 *       name: "yjlaser_website (Vercel)",
 *       url: "https://yjlaser.com",
 *       project: "yjlaser_website",
 *       type: "frontend" | "backend" | null,
 *       description: "Next.js 15 웹사이트 — Vercel 배포" | null,
 *       status: "up" | "down" | "timeout",
 *       statusCode: 200 | null,
 *       latency: 123,
 *       error: null | "error message",
 *       checkedAt: "2026-04-10T12:00:00.000Z"
 *     }
 *   ],
 *   cached: true | false,
 *   checkedAt: "2026-04-10T12:00:00.000Z"
 * }
 *
 * config.json 포맷:
 * {
 *   "healthcheck": [
 *     {
 *       "name": "서비스명",
 *       "url": "https://...",
 *       "project": "프로젝트폴더명",
 *       "type": "frontend" | "backend",
 *       "description": "서비스 설명",
 *       "timeout": 10000
 *     }
 *   ]
 * }
 *
 * 설계 원칙:
 * - URL 하드코딩 금지 — 모든 대상은 config.json에서 읽음
 * - 30초 캐시로 과도한 외부 요청 방지
 * - config.json 변경 시 자동 반영 (매 요청마다 re-read)
 * - 타임아웃/에러 시에도 서비스 정보 반환 (Promise.all 실패 방지)
 */

'use strict';

const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const router = Router();

// ── Config ─────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * config.json을 디스크에서 다시 읽는다.
 * 서버 재시작 없이 URL 추가/제거 반영을 위해 매 요청마다 호출.
 */
function loadHealthcheckTargets() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    return config.healthcheck || [];
  } catch (err) {
    console.error('[health] config.json 로드 실패:', err.message);
    return [];
  }
}

// ── In-memory cache ────────────────────────────────────────
let cachedResults = [];
let lastCheckTime = 0;

/**
 * 캐시된 결과를 외부에서 참조할 수 있도록 노출.
 * /api/status 등 통합 엔드포인트에서 사용.
 */
function getCachedHealth() {
  return cachedResults;
}

// ── Single-target health check ─────────────────────────────
/**
 * 단일 URL에 HTTP GET을 수행하여 상태를 확인한다.
 *
 * @param {{ name: string, url: string, project: string, type?: string, description?: string, timeout?: number }} target
 * @returns {Promise<{
 *   name: string,
 *   url: string,
 *   project: string,
 *   type: string | null,
 *   description: string | null,
 *   status: 'up' | 'down' | 'timeout',
 *   statusCode: number | null,
 *   latency: number,
 *   error: string | null,
 *   checkedAt: string
 * }>}
 */
function checkHealth(target) {
  return new Promise(resolve => {
    const timeout = target.timeout || 10000;
    const startTime = Date.now();
    const client = target.url.startsWith('https') ? https : http;

    const req = client.get(target.url, { timeout }, (response) => {
      const latency = Date.now() - startTime;
      // 2xx, 3xx → up / 4xx, 5xx → down
      const status = response.statusCode >= 200 && response.statusCode < 400 ? 'up' : 'down';

      resolve({
        name: target.name,
        url: target.url,
        project: target.project,
        type: target.type || null,
        description: target.description || null,
        status,
        statusCode: response.statusCode,
        latency,
        error: null,
        checkedAt: new Date().toISOString(),
      });

      // response body를 소비해야 소켓이 재사용됨
      response.resume();
    });

    req.on('error', (err) => {
      resolve({
        name: target.name,
        url: target.url,
        project: target.project,
        type: target.type || null,
        description: target.description || null,
        status: 'down',
        statusCode: null,
        latency: Date.now() - startTime,
        error: err.message,
        checkedAt: new Date().toISOString(),
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        name: target.name,
        url: target.url,
        project: target.project,
        type: target.type || null,
        description: target.description || null,
        status: 'timeout',
        statusCode: null,
        latency: timeout,
        error: 'Request timed out',
        checkedAt: new Date().toISOString(),
      });
    });
  });
}

// ── Route handler ──────────────────────────────────────────
router.get('/api/health', async (_req, res) => {
  try {
    // 캐시 유효 시 즉시 반환 (30초 이내 재요청)
    const now = Date.now();
    if (now - lastCheckTime < CACHE_TTL_MS && cachedResults.length > 0) {
      return res.json({
        services: cachedResults,
        cached: true,
        checkedAt: new Date(lastCheckTime).toISOString(),
      });
    }

    // config.json에서 대상 목록을 매번 다시 읽음
    const targets = loadHealthcheckTargets();

    if (targets.length === 0) {
      return res.json({
        services: [],
        cached: false,
        checkedAt: new Date().toISOString(),
        warning: 'config.json에 healthcheck 대상이 없습니다',
      });
    }

    // 모든 대상에 병렬 ping
    const results = await Promise.all(targets.map(t => checkHealth(t)));

    // 캐시 갱신
    cachedResults = results;
    lastCheckTime = Date.now();

    res.json({
      services: results,
      cached: false,
      checkedAt: new Date(lastCheckTime).toISOString(),
    });
  } catch (err) {
    console.error('[health] 헬스체크 오류:', err.message);
    res.status(500).json({ error: '헬스체크 실패', detail: err.message });
  }
});

module.exports = { router, checkHealth, getCachedHealth };
