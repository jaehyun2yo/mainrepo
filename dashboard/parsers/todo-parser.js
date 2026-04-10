/**
 * todo-parser.js
 *
 * docs/todo.md 파서 — P0/P1/P2 우선순위 > 프로젝트별 계층으로 파싱하여
 * TODO 항목을 구조화된 JSON으로 반환한다.
 *
 * todo.md 포맷 규칙:
 *   # TODO                      ← 문서 제목 (무시)
 *   ## 우선순위 기준             ← P{n} 패턴이 아닌 H2는 무시
 *   ## P0 — 긴급               ← H2 + P{n} = 우선순위 섹션 시작
 *   ### yjlaser_website         ← H3 = 프로젝트 섹션 (우선순위 하위)
 *   - [ ] 미완료 할일           ← 미체크 항목
 *   - [x] 완료된 할일           ← 체크 항목
 *   ## 완료 항목                ← P{n} 패턴 아닌 H2 → 우선순위 섹션 종료
 *
 * 계층 구조: 우선순위(P0>P1>P2) > 프로젝트명 > 할일 항목
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Regex patterns ────────────────────────────────────────
const PRIORITY_RE = /^##\s+(P\d)\s*(?:[—\-:]+\s*)?(.*)$/;  // ## P0 — 긴급
const PROJECT_RE = /^###\s+(.+)$/;                           // ### 프로젝트명
const H2_RE = /^##\s+/;                                      // any ## heading
const CHECKED_RE = /^\s*-\s*\[x\]\s+(.+)$/i;                // - [x] done
const UNCHECKED_RE = /^\s*-\s*\[\s\]\s+(.+)$/;              // - [ ] todo

/**
 * todo.md 파일을 파싱하여 우선순위별 > 프로젝트별 TODO 목록을 반환한다.
 *
 * @param {string} filePath  todo.md 절대 경로
 * @returns {TodoResult}
 *
 * @typedef {Object} TodoResult
 * @property {Priority[]} priorities  우선순위별 할일 목록
 * @property {Summary}    summary     전체 요약 통계
 *
 * @typedef {Object} Priority
 * @property {string}    level     'P0' | 'P1' | 'P2'
 * @property {string}    label     우선순위 설명 (e.g. '긴급')
 * @property {Project[]} projects  프로젝트별 할일 목록
 * @property {number}    total     이 우선순위의 전체 항목 수
 * @property {number}    done      이 우선순위의 완료 항목 수
 *
 * @typedef {Object} Project
 * @property {string}    name   프로젝트명
 * @property {Item[]}    items  할일 항목들
 * @property {number}    total  이 프로젝트의 전체 항목 수
 * @property {number}    done   이 프로젝트의 완료 항목 수
 *
 * @typedef {Object} Item
 * @property {string}  text  할일 내용
 * @property {boolean} done  완료 여부
 *
 * @typedef {Object} Summary
 * @property {number} total     전체 항목 수
 * @property {number} done      완료 항목 수
 * @property {number} pending   미완료 항목 수
 * @property {Object} byPriority  우선순위별 카운트 { P0: { total, done }, ... }
 */
function parseTodo(filePath) {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      priorities: [],
      summary: { total: 0, done: 0, pending: 0, byPriority: {} },
    };
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  return parseTodoContent(content);
}

/**
 * todo.md 문자열 내용을 파싱한다. (테스트 용이성을 위해 분리)
 *
 * @param {string} content  todo.md 원문
 * @returns {TodoResult}
 */
function parseTodoContent(content) {
  const lines = content.split(/\r?\n/);
  const priorities = [];
  let currentPriority = null;
  let currentProject = null;

  for (const line of lines) {
    // ── 우선순위 섹션 감지: ## P0 — 긴급 ──
    const priorityMatch = line.match(PRIORITY_RE);
    if (priorityMatch) {
      // 이전 프로젝트/우선순위 저장
      if (currentPriority) {
        if (currentProject) {
          finishProject(currentProject);
          currentPriority.projects.push(currentProject);
        }
        finishPriority(currentPriority);
        priorities.push(currentPriority);
      }

      currentPriority = {
        level: priorityMatch[1],
        label: priorityMatch[2].trim(),
        projects: [],
        total: 0,
        done: 0,
      };
      currentProject = null;
      continue;
    }

    // ── 비-우선순위 H2 감지: ## 완료 항목, ## 우선순위 기준 등 ──
    // P{n} 패턴이 아닌 ## 헤딩은 현재 우선순위 섹션을 종료시킴
    if (H2_RE.test(line) && !priorityMatch) {
      if (currentPriority) {
        if (currentProject) {
          finishProject(currentProject);
          currentPriority.projects.push(currentProject);
        }
        finishPriority(currentPriority);
        priorities.push(currentPriority);
        currentPriority = null;
        currentProject = null;
      }
      continue;
    }

    // ── 프로젝트 섹션 감지: ### yjlaser_website ──
    const projectMatch = line.match(PROJECT_RE);
    if (projectMatch && currentPriority) {
      // 이전 프로젝트 저장
      if (currentProject) {
        finishProject(currentProject);
        currentPriority.projects.push(currentProject);
      }
      currentProject = {
        name: projectMatch[1].trim(),
        items: [],
        total: 0,
        done: 0,
      };
      continue;
    }

    // ── 할일 항목 감지 ──
    if (!currentProject) continue;

    const checkedMatch = line.match(CHECKED_RE);
    if (checkedMatch) {
      currentProject.items.push({ text: checkedMatch[1].trim(), done: true });
      continue;
    }

    const uncheckedMatch = line.match(UNCHECKED_RE);
    if (uncheckedMatch) {
      currentProject.items.push({ text: uncheckedMatch[1].trim(), done: false });
      continue;
    }
  }

  // 마지막 우선순위/프로젝트 마무리
  if (currentPriority) {
    if (currentProject) {
      finishProject(currentProject);
      currentPriority.projects.push(currentProject);
    }
    finishPriority(currentPriority);
    priorities.push(currentPriority);
  }

  // 전체 요약 통계
  const summary = buildSummary(priorities);

  return { priorities, summary };
}

/**
 * 프로젝트 통계 계산
 */
function finishProject(project) {
  project.total = project.items.length;
  project.done = project.items.filter(i => i.done).length;
}

/**
 * 우선순위 통계 계산
 */
function finishPriority(priority) {
  priority.total = priority.projects.reduce((s, p) => s + p.total, 0);
  priority.done = priority.projects.reduce((s, p) => s + p.done, 0);
}

/**
 * 전체 요약 통계 생성
 */
function buildSummary(priorities) {
  const total = priorities.reduce((s, p) => s + p.total, 0);
  const done = priorities.reduce((s, p) => s + p.done, 0);

  const byPriority = {};
  for (const p of priorities) {
    byPriority[p.level] = { total: p.total, done: p.done };
  }

  return { total, done, pending: total - done, byPriority };
}

module.exports = { parseTodo, parseTodoContent };
