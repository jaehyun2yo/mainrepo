const express = require('express');
const fs = require('fs');
const path = require('path');
const { detectAllVersions } = require('./utils/version-detector');
const { getAllProjectActivity, getRepoLastCommit } = require('./utils/git-activity');
const { GitPullScheduler } = require('./utils/git-pull-scheduler');
const { createGitPullRoutes } = require('./routes/git-pull');
const { parseRoadmapContent } = require('./parsers/roadmap-parser');
const { parseTodoContent } = require('./parsers/todo-parser');
const {
  authMiddleware,
  createLoginHandler,
  logoutHandler,
  startSessionCleanup,
} = require('./middleware/auth');

// ── Config ──────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');
const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (err) {
    console.error('[config] config.json 로드 실패:', err.message);
    return { healthcheck: [], gitPullIntervalMs: 300000, port: 3333 };
  }
}

let config = loadConfig();
const PORT = process.env.DASHBOARD_PORT || config.port || 3333;
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'yjlaser2024';

// ── 세션 정리 스케줄러 시작 ──────────────────────────────
startSessionCleanup();

// ── Express app ─────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Auth routes (미들웨어 적용 전에 등록) ────────────────
app.post('/api/login', createLoginHandler(PASSWORD));
app.post('/api/logout', logoutHandler);

// Apply auth to everything below
app.use(authMiddleware);

// ── Static files ────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Root redirect
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── API: Roadmap & TODO (modular routes) ────────────────
app.use(require('./routes/roadmap'));
app.use(require('./routes/todo'));

// ── API: Healthcheck (modular route) ────────────────────
const { router: healthRouter, getCachedHealth } = require('./routes/health');
app.use(healthRouter);

// ── API: Project versions (uses version-detector utility) ──
app.get('/api/projects', (req, res) => {
  try {
    const projects = detectAllVersions(REPO_ROOT);
    const activities = getAllProjectActivity(REPO_ROOT);

    // Merge version info with git activity
    const merged = projects.map((proj) => {
      const activity = activities.find((a) => a.folder === proj.folder);
      return {
        ...proj,
        lastCommit: activity ? activity.lastCommit : null,
        daysAgo: activity ? activity.daysAgo : null,
      };
    });

    res.json({ projects: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Git activity (per-project last commit dates) ──
app.get('/api/activity', (req, res) => {
  try {
    const projects = getAllProjectActivity(REPO_ROOT);
    const repo = getRepoLastCommit(REPO_ROOT);
    res.json({ projects, repo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Status (combined endpoint for polling) ─────────
app.get('/api/status', async (req, res) => {
  try {
    const roadmapPath = path.join(DOCS_DIR, 'roadmap.md');
    const todoPath = path.join(DOCS_DIR, 'todo.md');

    const roadmapData = fs.existsSync(roadmapPath)
      ? parseRoadmapContent(fs.readFileSync(roadmapPath, 'utf-8'))
      : { projects: [], overall: { total: 0, done: 0, percent: 0 } };

    const roadmapProjects = roadmapData.projects;
    const roadmapOverall = roadmapData.overall;

    const todoData = fs.existsSync(todoPath)
      ? parseTodoContent(fs.readFileSync(todoPath, 'utf-8'))
      : { priorities: [], summary: { total: 0, done: 0, pending: 0, byPriority: {} } };

    const todo = todoData.priorities;

    // 프로젝트 버전 + 최근 커밋 날짜 통합 정보
    const versionInfo = detectAllVersions(REPO_ROOT);
    const activity = getAllProjectActivity(REPO_ROOT);
    const repoLastCommit = getRepoLastCommit(REPO_ROOT);

    // 버전 정보와 git 활동 정보를 통합 (프로젝트별 버전 + 최근 커밋)
    const projects = versionInfo.map((proj) => {
      const act = activity.find((a) => a.folder === proj.folder);
      return {
        ...proj,
        lastCommit: act ? act.lastCommit : null,
        daysAgo: act ? act.daysAgo : null,
      };
    });

    res.json({
      roadmap: roadmapProjects,
      roadmapOverall,
      todo,
      health: getCachedHealth(),
      projects,
      activity,
      repoLastCommit,
      lastGitPull: getLastGitPullResult(),
      gitPullScheduler: gitPullScheduler.getStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Git pull scheduler (모듈화) ─────────────────────────
const GIT_PULL_INTERVAL = config.gitPullIntervalMs || 300000;

const gitPullScheduler = new GitPullScheduler({
  repoRoot: REPO_ROOT,
  intervalMs: GIT_PULL_INTERVAL,
  startupDelayMs: 5000,
  onSuccess: (result) => {
    // git pull로 변경사항이 있으면 config 리로드
    if (result.hasChanges) {
      config = loadConfig();
    }
  },
  onError: (result) => {
    // 연속 에러 3회 이상이면 경고 로그
    if (result.consecutiveErrors >= 3) {
      console.warn(`[git-pull] ⚠ 연속 ${result.consecutiveErrors}회 실패 — 네트워크 또는 git 상태 확인 필요`);
    }
  },
});

gitPullScheduler.start();

// Git pull API 라우트 등록
app.use(createGitPullRoutes(gitPullScheduler));

// 하위 호환: lastGitPullResult 참조를 scheduler에서 가져옴
const getLastGitPullResult = () => gitPullScheduler.getLastResult();

// ── Start server ────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║  YJLaser Dashboard Server                 ║');
  console.log(`  ║  http://localhost:${PORT}                    ║`);
  console.log('  ║  Press Ctrl+C to stop                     ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
  console.log(`  [config] Port: ${PORT}`);
  console.log(`  [config] Healthcheck targets: ${(config.healthcheck || []).length}`);
  console.log(`  [config] Git pull interval: ${GIT_PULL_INTERVAL / 1000}s`);
  console.log(`  [config] Auth: ${PASSWORD === 'yjlaser2024' ? 'default password (set DASHBOARD_PASSWORD to change)' : 'custom password set'}`);
  console.log('');
});
