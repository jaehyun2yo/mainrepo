/**
 * progress-section.js
 *
 * 로드맵 진행상황 섹션 — /api/roadmap 데이터를 폴링하여
 * 프로젝트별 프로그레스 바 + 퍼센트를 렌더링한다.
 *
 * 의존성: 없음 (Vanilla JS)
 * 사용법: <script src="/progress-section.js"></script>
 *         <div id="progress-section"></div>
 */

(function () {
  'use strict';

  const CONTAINER_ID = 'progress-section';
  const POLL_INTERVAL = 45_000; // 45초 폴링

  let pollTimer = null;

  /**
   * 퍼센트에 따른 색상 클래스 반환
   */
  function getProgressColor(percent) {
    if (percent >= 80) return '#22c55e'; // green
    if (percent >= 50) return '#eab308'; // yellow
    if (percent >= 20) return '#f97316'; // orange
    return '#ef4444'; // red
  }

  /**
   * 단일 프로젝트 카드 HTML 생성
   */
  function renderProjectCard(project) {
    const color = getProgressColor(project.percent);
    const taskListHtml = project.tasks
      .map(t => {
        const icon = t.done ? '✅' : '⬜';
        const cls = t.done ? 'task-done' : 'task-pending';
        return `<li class="task-item ${cls}">${icon} ${escapeHtml(t.text)}</li>`;
      })
      .join('');

    return `
      <div class="project-card">
        <div class="project-header">
          <span class="project-name">${escapeHtml(project.name)}</span>
          <span class="project-percent" style="color: ${color}">${project.percent}%</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${project.percent}%; background: ${color}"></div>
        </div>
        <div class="project-stats">${project.done} / ${project.total} 완료</div>
        <details class="task-details">
          <summary>태스크 목록 (${project.tasks.length})</summary>
          <ul class="task-list">${taskListHtml}</ul>
        </details>
      </div>
    `;
  }

  /**
   * 전체 진행상황 섹션 렌더링
   */
  function renderProgressSection(data) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    if (!data || !data.projects || data.projects.length === 0) {
      container.innerHTML = `
        <div class="section-header">
          <h2>📊 프로젝트 진행상황</h2>
        </div>
        <div class="empty-state">roadmap.md에 데이터가 없습니다.</div>
      `;
      return;
    }

    const overallColor = getProgressColor(data.overall.percent);
    const projectCardsHtml = data.projects.map(renderProjectCard).join('');

    container.innerHTML = `
      <div class="section-header">
        <h2>📊 프로젝트 진행상황</h2>
        <span class="overall-badge" style="background: ${overallColor}">
          전체 ${data.overall.percent}% (${data.overall.done}/${data.overall.total})
        </span>
      </div>
      <div class="overall-progress">
        <div class="progress-bar-container overall">
          <div class="progress-bar-fill" style="width: ${data.overall.percent}%; background: ${overallColor}"></div>
        </div>
      </div>
      <div class="project-grid">
        ${projectCardsHtml}
      </div>
    `;
  }

  /**
   * HTML 이스케이프
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * /api/roadmap 데이터 조회
   */
  async function fetchRoadmapData() {
    try {
      const res = await fetch('/api/roadmap');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('[progress] 데이터 조회 실패:', err);
      return null;
    }
  }

  /**
   * 데이터 새로고침 및 렌더링
   */
  async function refresh() {
    const data = await fetchRoadmapData();
    if (data) {
      renderProgressSection(data);
    }
  }

  /**
   * 자동 폴링 시작
   */
  function startPolling() {
    refresh(); // 즉시 1회 실행
    pollTimer = setInterval(refresh, POLL_INTERVAL);
  }

  /**
   * 폴링 중지
   */
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // 전역 노출 (다른 섹션에서 수동 새로고침 가능)
  window.ProgressSection = { refresh, startPolling, stopPolling };

  // DOM 로드 시 자동 시작
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPolling);
  } else {
    startPolling();
  }
})();
