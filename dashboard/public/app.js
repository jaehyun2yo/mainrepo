// ── YJLaser Dashboard — Frontend ─────────────────────────
(function () {
  'use strict';

  // ── Polling configuration ──────────────────────────────
  const POLL_INTERVAL = 45000;          // 45초 (30s~1m 범위)
  const HEALTH_POLL_INTERVAL = 60000;   // 60초 (1분)
  const MAX_BACKOFF_MULTIPLIER = 4;     // 최대 백오프 배수 (45s × 4 = 3분)
  const MAX_CONSECUTIVE_FAILURES = 10;  // 이 횟수 초과 시 폴링 일시 정지

  let pollTimer = null;
  let healthTimer = null;
  let countdownTimer = null;
  let consecutiveFailures = 0;
  let currentBackoffMultiplier = 1;
  let nextPollTime = null;
  let isPaused = false;               // Page Visibility로 일시 정지 여부
  let isManuallyPaused = false;       // 사용자 수동 일시 정지

  // ── Fetch helper ──────────────────────────────────────
  async function apiFetch(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('Unauthorized');
    }
    return res.json();
  }

  // ── Render: Roadmap progress ──────────────────────────
  function renderRoadmap(projects, overall) {
    const container = document.getElementById('roadmapBody');
    const badge = document.getElementById('roadmapBadge');

    if (!projects || projects.length === 0) {
      container.innerHTML = '<div class="empty-state">roadmap.md data not available</div>';
      badge.textContent = '0 projects';
      return;
    }

    // overall 통계 — 서버에서 제공하거나 로컬 계산
    const totalDone = overall ? overall.done : projects.reduce((s, p) => s + p.done, 0);
    const totalAll = overall ? overall.total : projects.reduce((s, p) => s + p.total, 0);
    const overallPercent = overall ? overall.percent : (totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0);
    const overallClass = overallPercent >= 70 ? 'high' : overallPercent >= 40 ? 'mid' : 'low';
    badge.textContent = overallPercent + '% overall';

    // overall 프로그레스 바 + 프로젝트별 카드
    container.innerHTML =
      `<div class="progress-item overall-progress">
        <div class="progress-head">
          <span class="progress-name" style="font-weight:700">전체 진행률</span>
          <span class="progress-stat">${totalDone}/${totalAll} (${overallPercent}%)</span>
        </div>
        <div class="progress-bar-bg" style="height:10px">
          <div class="progress-bar-fill ${overallClass}" style="width:${overallPercent}%"></div>
        </div>
      </div>` +
      projects.map(p => {
        const levelClass = p.percent >= 70 ? 'high' : p.percent >= 40 ? 'mid' : 'low';
        const taskList = (p.tasks || []).map(t => {
          const icon = t.done ? '✓' : '○';
          const cls = t.done ? 'done' : '';
          return `<div class="roadmap-task ${cls}"><span class="roadmap-task-icon">${icon}</span><span class="roadmap-task-text ${cls}">${esc(t.text)}</span></div>`;
        }).join('');
        const hasSubtasks = p.tasks && p.tasks.length > 0;
        return `
          <div class="progress-item">
            <div class="progress-head">
              <span class="progress-name">${esc(p.name)}</span>
              <span class="progress-stat">${p.done}/${p.total} (${p.percent}%)</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill ${levelClass}" style="width:${p.percent}%"></div>
            </div>
            ${hasSubtasks ? `<details class="roadmap-tasks"><summary class="roadmap-tasks-toggle">태스크 ${p.tasks.length}개</summary>${taskList}</details>` : ''}
          </div>`;
      }).join('');
  }

  // ── Render: Healthcheck ───────────────────────────────
  function renderHealth(services, checkedAt) {
    const container = document.getElementById('healthBody');
    const badge = document.getElementById('healthBadge');

    if (!services || services.length === 0) {
      container.innerHTML = '<div class="empty-state">헬스체크 대상이 설정되지 않았습니다</div>';
      badge.textContent = 'N/A';
      return;
    }

    const upCount = services.filter(s => s.status === 'up').length;
    const downCount = services.filter(s => s.status === 'down').length;
    const timeoutCount = services.filter(s => s.status === 'timeout').length;

    // Badge: all-up → green, some-down → red, mixed → yellow
    badge.textContent = upCount + '/' + services.length + ' up';
    if (upCount === services.length) {
      badge.style.background = 'var(--green-soft)';
      badge.style.color = 'var(--green)';
    } else if (downCount === services.length) {
      badge.style.background = 'var(--red-soft)';
      badge.style.color = 'var(--red)';
    } else {
      badge.style.background = 'var(--yellow-soft)';
      badge.style.color = 'var(--yellow)';
    }

    // Build service cards
    const serviceCards = services.map(s => {
      const statusClass = s.status || 'unknown';

      // Status icon (up/down/timeout)
      let statusIcon, statusLabel;
      if (s.status === 'up') {
        statusIcon = '✅';
        statusLabel = 'UP';
      } else if (s.status === 'down') {
        statusIcon = '❌';
        statusLabel = 'DOWN';
      } else if (s.status === 'timeout') {
        statusIcon = '⏱️';
        statusLabel = 'TIMEOUT';
      } else {
        statusIcon = '❓';
        statusLabel = 'UNKNOWN';
      }

      // Latency with color coding
      const latencyMs = s.latency != null ? s.latency : null;
      let latencyText, latencyClass;
      if (latencyMs != null) {
        latencyText = latencyMs + 'ms';
        latencyClass = latencyMs < 500 ? 'fast' : latencyMs < 2000 ? 'moderate' : 'slow';
      } else {
        latencyText = '-';
        latencyClass = '';
      }

      // Last check time (relative + absolute tooltip)
      const checkedTime = s.checkedAt ? formatCheckedAt(s.checkedAt) : null;
      const checkedAbsolute = s.checkedAt ? new Date(s.checkedAt).toLocaleString('ko-KR') : '';

      // Error info (shown when down)
      const errorInfo = s.error ? `<div class="health-error" title="${esc(s.error)}">${esc(truncate(s.error, 60))}</div>` : '';

      // HTTP status code
      const statusCodeText = s.statusCode ? `HTTP ${s.statusCode}` : '';

      return `
        <div class="health-item ${statusClass}">
          <div class="health-row-main">
            <div class="health-info">
              <span class="health-icon">${statusIcon}</span>
              <span class="health-dot ${statusClass}"></span>
              <div class="health-name-group">
                <span class="health-name">${esc(s.name)}</span>
                <span class="health-url">${esc(s.url)}</span>
              </div>
            </div>
            <div class="health-meta">
              <span class="health-status-label ${statusClass}">${statusLabel}</span>
              ${statusCodeText ? `<span class="health-status-code">${statusCodeText}</span>` : ''}
              <span class="health-latency ${latencyClass}">${latencyText}</span>
            </div>
          </div>
          <div class="health-row-sub">
            ${checkedTime ? `<span class="health-checked" title="${esc(checkedAbsolute)}">마지막 체크: ${checkedTime}</span>` : ''}
            ${errorInfo}
          </div>
        </div>`;
    }).join('');

    // Overall last check timestamp
    const overallCheckedHtml = checkedAt
      ? `<div class="health-overall-time">전체 체크 시각: ${new Date(checkedAt).toLocaleString('ko-KR')}</div>`
      : '';

    container.innerHTML =
      '<div class="health-list">' +
        serviceCards +
      '</div>' +
      overallCheckedHtml;
  }

  /**
   * checkedAt ISO 문자열을 상대 시간으로 변환
   */
  function formatCheckedAt(isoString) {
    const date = new Date(isoString);
    const now = Date.now();
    const diffSec = Math.floor((now - date.getTime()) / 1000);

    if (diffSec < 5) return '방금 전';
    if (diffSec < 60) return diffSec + '초 전';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + '분 전';
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return diffHour + '시간 전';
    // 24h+ → absolute
    return date.toLocaleString('ko-KR');
  }

  /**
   * 문자열 자르기 (긴 에러 메시지 대비)
   */
  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  // ── Render: TODO ──────────────────────────────────────
  function renderTodo(priorities) {
    const container = document.getElementById('todoBody');
    const badge = document.getElementById('todoBadge');

    if (!priorities || priorities.length === 0) {
      container.innerHTML = '<div class="empty-state">todo.md data not available</div>';
      badge.textContent = '0 items';
      return;
    }

    let totalItems = 0;
    let doneItems = 0;
    priorities.forEach(pr => {
      pr.projects.forEach(proj => {
        proj.items.forEach(item => {
          totalItems++;
          if (item.done) doneItems++;
        });
      });
    });
    badge.textContent = doneItems + '/' + totalItems + ' done';

    container.innerHTML = priorities.map(pr => {
      const levelClass = pr.level.toLowerCase();
      const label = pr.label ? pr.level + ' — ' + pr.label : pr.level;
      const projectsHtml = pr.projects.map(proj => {
        const itemsHtml = proj.items.map(item => `
          <div class="todo-item">
            <span class="todo-check ${item.done ? 'done' : ''}"></span>
            <span class="todo-text ${item.done ? 'done' : ''}">${esc(item.text)}</span>
          </div>`).join('');
        return `<div class="todo-project-name">${esc(proj.name)}</div>${itemsHtml}`;
      }).join('');
      return `<div class="priority-group"><div class="priority-label ${levelClass}">${esc(label)}</div>${projectsHtml}</div>`;
    }).join('');
  }

  // ── Render: Projects (버전 + 최근 커밋 통합) ──────────
  function renderProjects(projects) {
    const container = document.getElementById('projectsBody');
    const badge = document.getElementById('projectsBadge');

    if (!container) return; // 요소가 없으면 무시

    if (!projects || projects.length === 0) {
      container.innerHTML = '<div class="empty-state">프로젝트 정보를 불러올 수 없습니다</div>';
      if (badge) badge.textContent = '0 projects';
      return;
    }

    if (badge) badge.textContent = projects.length + '개 프로젝트';

    container.innerHTML = projects.map(function(p) {
      // 스택 뱃지 색상
      var stackClass = (p.stack || '').toLowerCase().replace(/[^a-z]/g, '');

      // 버전 표시
      var versionText = p.version && p.version !== 'unknown' ? 'v' + p.version : '버전 미감지';
      var versionClass = p.version && p.version !== 'unknown' ? 'detected' : 'unknown';

      // 버전 소스 정보 (툴팁)
      var versionTooltip = p.source && p.source !== 'not found'
        ? '소스: ' + p.source
        : '버전 파일을 찾을 수 없습니다';

      // 최근 커밋 정보
      var commitInfo = '';
      if (p.lastCommit && p.lastCommit.date) {
        var daysText = p.daysAgo === 0 ? '오늘' : p.daysAgo === 1 ? '어제' : p.daysAgo + '일 전';
        var freshClass = p.daysAgo <= 3 ? 'fresh' : p.daysAgo <= 14 ? 'recent' : 'stale';
        var commitMsg = p.lastCommit.message ? esc(truncate(p.lastCommit.message, 50)) : '';
        var commitHash = p.lastCommit.hash ? p.lastCommit.hash : '';
        var commitAuthor = p.lastCommit.author ? esc(p.lastCommit.author) : '';

        // 절대 날짜 포맷 (툴팁용)
        var absoluteDate = formatAbsoluteDate(p.lastCommit.date);

        // 활동 상태 아이콘
        var activityIcon = p.daysAgo <= 3 ? '🟢' : p.daysAgo <= 14 ? '🟡' : '🔴';

        commitInfo =
          '<div class="project-commit ' + freshClass + '">' +
            '<span class="project-commit-activity">' + activityIcon + '</span>' +
            '<span class="project-commit-time" title="' + esc(absoluteDate) + '">' + daysText + '</span>' +
            (commitHash ? '<span class="project-commit-hash">' + esc(commitHash) + '</span>' : '') +
            (commitAuthor ? '<span class="project-commit-author">' + commitAuthor + '</span>' : '') +
          '</div>' +
          (commitMsg ? '<div class="project-commit-message" title="' + commitMsg + '">' + commitMsg + '</div>' : '');
      } else {
        commitInfo = '<div class="project-commit stale"><span class="project-commit-activity">⚪</span><span class="project-commit-time">커밋 기록 없음</span></div>';
      }

      return (
        '<div class="project-item">' +
          '<div class="project-row-main">' +
            '<div class="project-name-group">' +
              '<span class="project-name">' + esc(p.name) + '</span>' +
              '<span class="project-stack stack-' + stackClass + '">' + esc(p.stack || '') + '</span>' +
            '</div>' +
            '<div class="project-version ' + versionClass + '" title="' + esc(versionTooltip) + '">' + esc(versionText) + '</div>' +
          '</div>' +
          commitInfo +
        '</div>'
      );
    }).join('');
  }

  /**
   * ISO 날짜 문자열을 한국어 절대 날짜 포맷으로 변환
   * @param {string} isoString - ISO 8601 date string
   * @returns {string} 예: "2026-04-10 (금) 15:30"
   */
  function formatAbsoluteDate(isoString) {
    try {
      var date = new Date(isoString);
      var dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      var y = date.getFullYear();
      var m = String(date.getMonth() + 1).padStart(2, '0');
      var d = String(date.getDate()).padStart(2, '0');
      var dayName = dayNames[date.getDay()];
      var h = String(date.getHours()).padStart(2, '0');
      var min = String(date.getMinutes()).padStart(2, '0');
      return y + '-' + m + '-' + d + ' (' + dayName + ') ' + h + ':' + min;
    } catch (e) {
      return isoString || '';
    }
  }

  // ── Render: Git status ────────────────────────────────
  function renderGitStatus(gitPull) {
    const el = document.getElementById('gitStatusText');
    if (!gitPull || !gitPull.timestamp) {
      el.textContent = 'pending';
      return;
    }
    const timeAgo = getTimeAgo(new Date(gitPull.timestamp));
    el.textContent = gitPull.status + ' (' + timeAgo + ')';
  }

  // ── Render: Summary bar ────────────────────────────────
  function updateSummaryBar(data) {
    const progressEl = document.getElementById('summaryProgress');
    const todoEl = document.getElementById('summaryTodo');
    const healthEl = document.getElementById('summaryHealth');

    // Progress summary
    if (data.roadmapOverall) {
      progressEl.textContent = data.roadmapOverall.percent + '%';
      progressEl.style.color = data.roadmapOverall.percent >= 70 ? 'var(--green)' : data.roadmapOverall.percent >= 40 ? 'var(--yellow)' : 'var(--red)';
    } else {
      progressEl.textContent = '---';
    }

    // TODO summary — count pending items
    if (data.todo && data.todo.length > 0) {
      let pending = 0;
      data.todo.forEach(function(pr) {
        pr.projects.forEach(function(proj) {
          proj.items.forEach(function(item) {
            if (!item.done) pending++;
          });
        });
      });
      todoEl.textContent = pending + '건';
      todoEl.style.color = pending > 10 ? 'var(--yellow)' : 'var(--green)';
    } else {
      todoEl.textContent = '---';
    }

    // Health summary
    if (data.health && data.health.length > 0) {
      var upCount = data.health.filter(function(s) { return s.status === 'up'; }).length;
      healthEl.textContent = upCount + '/' + data.health.length;
      healthEl.style.color = upCount === data.health.length ? 'var(--green)' : 'var(--red)';
    } else {
      healthEl.textContent = '---';
    }
  }

  // ── Render: Last updated timestamp ────────────────────
  function updateLastUpdated() {
    var el = document.getElementById('lastUpdated');
    if (el) {
      var now = new Date();
      el.textContent = now.toLocaleTimeString('ko-KR') + ' 갱신';
    }
  }

  // ── Polling core ───────────────────────────────────────
  async function fetchStatus() {
    try {
      const data = await apiFetch('/api/status');

      // 성공 시 백오프 리셋
      consecutiveFailures = 0;
      currentBackoffMultiplier = 1;

      renderRoadmap(data.roadmap, data.roadmapOverall);
      renderTodo(data.todo);
      renderProjects(data.projects);
      renderGitStatus(data.lastGitPull);
      if (data.health && data.health.length > 0) {
        renderHealth(data.health, data.timestamp);
      }
      updateSummaryBar(data);
      updateLastUpdated();
      updatePollBadge('live');
    } catch (err) {
      if (err.message !== 'Unauthorized') {
        consecutiveFailures++;
        console.error('[poll] Status fetch failed (연속 ' + consecutiveFailures + '회):', err);

        // Exponential backoff 적용
        currentBackoffMultiplier = Math.min(
          Math.pow(2, Math.min(consecutiveFailures - 1, 3)),
          MAX_BACKOFF_MULTIPLIER
        );

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          updatePollBadge('stopped');
        } else {
          updatePollBadge('disconnected');
        }
      }
    }
  }

  async function fetchHealth() {
    try {
      const data = await apiFetch('/api/health');
      renderHealth(data.services, data.checkedAt);
    } catch (err) {
      if (err.message !== 'Unauthorized') {
        console.error('[poll] Health fetch failed:', err);
      }
    }
  }

  /**
   * 폴링 상태 배지 업데이트
   * @param {'live'|'disconnected'|'stopped'|'paused'} state
   */
  function updatePollBadge(state) {
    const badge = document.getElementById('pollBadge');
    const text = document.getElementById('pollText');
    if (!badge || !text) return;

    // 기존 인라인 스타일 제거 (클래스로 관리)
    badge.removeAttribute('style');

    switch (state) {
      case 'live':
        badge.className = 'status-badge live';
        text.textContent = 'Live';
        break;
      case 'disconnected':
        badge.className = 'status-badge poll-disconnected';
        text.textContent = '재연결 중...';
        break;
      case 'stopped':
        badge.className = 'status-badge poll-stopped';
        text.textContent = '연결 끊김';
        break;
      case 'paused':
        badge.className = 'status-badge poll-paused';
        text.textContent = '일시 정지';
        break;
    }
  }

  /**
   * 다음 갱신까지 남은 시간 카운트다운 표시
   */
  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);

    countdownTimer = setInterval(function () {
      var el = document.getElementById('nextRefresh');
      if (!el || !nextPollTime) return;

      var remaining = Math.max(0, Math.ceil((nextPollTime - Date.now()) / 1000));
      if (remaining > 0) {
        el.textContent = remaining + '초 후 갱신';
      } else {
        el.textContent = '갱신 중...';
      }
    }, 1000);
  }

  /**
   * 다음 폴링 예약 (backoff 적용)
   */
  function scheduleNextPoll() {
    if (pollTimer) clearTimeout(pollTimer);

    var interval = POLL_INTERVAL * currentBackoffMultiplier;
    nextPollTime = Date.now() + interval;

    pollTimer = setTimeout(function () {
      if (!isPaused && !isManuallyPaused) {
        fetchStatus().then(function () {
          // 연속 실패 MAX 초과 시 자동 중지
          if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
            scheduleNextPoll();
          } else {
            console.warn('[poll] 연속 ' + MAX_CONSECUTIVE_FAILURES + '회 실패 — 자동 폴링 중지. 수동 새로고침 사용.');
          }
        });
      }
    }, interval);
  }

  function scheduleNextHealthPoll() {
    if (healthTimer) clearTimeout(healthTimer);

    healthTimer = setTimeout(function () {
      if (!isPaused && !isManuallyPaused) {
        fetchHealth().then(function () {
          scheduleNextHealthPoll();
        });
      }
    }, HEALTH_POLL_INTERVAL);
  }

  /**
   * 수동 새로고침 (즉시 모든 데이터 갱신)
   */
  window.manualRefresh = function () {
    var btn = document.getElementById('refreshBtn');
    if (btn) {
      btn.classList.add('spinning');
      setTimeout(function () { btn.classList.remove('spinning'); }, 1000);
    }

    // 연속 실패 카운터 리셋 (수동 갱신은 복구 시도)
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      consecutiveFailures = 0;
      currentBackoffMultiplier = 1;
    }

    fetchStatus().then(function () {
      fetchHealth();
      scheduleNextPoll();
      scheduleNextHealthPoll();
    });
  };

  /**
   * 폴링 시작 (초기 로드 + 주기적 폴링 예약)
   */
  function startPolling() {
    // 즉시 첫 번째 데이터 로드
    fetchStatus().then(function () {
      scheduleNextPoll();
    });
    fetchHealth().then(function () {
      scheduleNextHealthPoll();
    });

    // 카운트다운 타이머 시작
    startCountdown();
  }

  /**
   * 폴링 일시 정지
   */
  function pausePolling() {
    isPaused = true;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (healthTimer) { clearTimeout(healthTimer); healthTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    nextPollTime = null;
    updatePollBadge('paused');

    var el = document.getElementById('nextRefresh');
    if (el) el.textContent = '탭 비활성 — 일시 정지';
  }

  /**
   * 폴링 재개 (탭 복귀 시 즉시 갱신 후 스케줄 재시작)
   */
  function resumePolling() {
    isPaused = false;
    // 탭 복귀 시 즉시 갱신
    fetchStatus().then(function () {
      scheduleNextPoll();
    });
    fetchHealth().then(function () {
      scheduleNextHealthPoll();
    });
    startCountdown();
  }

  // ── Page Visibility API ──────────────────────────────
  // 탭이 비활성(최소화, 다른 탭)일 때 폴링 중지 → 리소스 절약
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      console.log('[poll] 탭 비활성 → 폴링 일시 정지');
      pausePolling();
    } else {
      console.log('[poll] 탭 활성 → 폴링 재개');
      resumePolling();
    }
  });

  // ── Online/Offline 감지 ──────────────────────────────
  // 네트워크 복구 시 즉시 갱신
  window.addEventListener('online', function () {
    console.log('[poll] 네트워크 복구 감지 → 즉시 갱신');
    consecutiveFailures = 0;
    currentBackoffMultiplier = 1;
    resumePolling();
  });
  window.addEventListener('offline', function () {
    console.log('[poll] 네트워크 끊김 감지');
    updatePollBadge('disconnected');
  });

  // ── Logout ────────────────────────────────────────────
  window.logout = async function () {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_) {}
    window.location.href = '/login.html';
  };

  // ── Utils ─────────────────────────────────────────────
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return seconds + 's ago';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    return hours + 'h ago';
  }

  // ── Init ──────────────────────────────────────────────
  startPolling();

})();
