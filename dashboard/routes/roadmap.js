/**
 * routes/roadmap.js
 *
 * GET /api/roadmap — 프로젝트별 로드맵 진행상황을 JSON으로 반환.
 *
 * 응답 형태:
 * {
 *   projects: [{ name, total, done, percent, tasks: [{ text, done }] }],
 *   overall:  { total, done, percent }
 * }
 */

'use strict';

const { Router } = require('express');
const path = require('path');
const { parseRoadmap } = require('../parsers/roadmap-parser');

const router = Router();

// 모노레포 루트 기준 docs/roadmap.md 경로
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ROADMAP_PATH = path.join(REPO_ROOT, 'docs', 'roadmap.md');

router.get('/api/roadmap', (_req, res) => {
  try {
    const data = parseRoadmap(ROADMAP_PATH);
    res.json(data);
  } catch (err) {
    console.error('[roadmap] 파싱 오류:', err.message);
    res.status(500).json({ error: 'roadmap.md 파싱 실패', detail: err.message });
  }
});

module.exports = router;
