/**
 * Git Pull API Routes
 *
 * GET  /api/git-pull        — 최근 git pull 상태 및 히스토리 조회
 * POST /api/git-pull        — 수동 git pull 트리거
 * GET  /api/git-pull/status — 스케줄러 상태 조회
 */

const express = require('express');
const router = express.Router();

/**
 * Git pull 라우트 생성
 * @param {import('../utils/git-pull-scheduler').GitPullScheduler} scheduler
 */
function createGitPullRoutes(scheduler) {
  // GET /api/git-pull — 최근 결과 + 히스토리
  router.get('/api/git-pull', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    res.json({
      lastResult: scheduler.getLastResult(),
      history: scheduler.getHistory(limit),
    });
  });

  // POST /api/git-pull — 수동 트리거
  router.post('/api/git-pull', async (req, res) => {
    try {
      const result = await scheduler.execute();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/git-pull/status — 스케줄러 상태
  router.get('/api/git-pull/status', (req, res) => {
    res.json(scheduler.getStatus());
  });

  return router;
}

module.exports = { createGitPullRoutes };
