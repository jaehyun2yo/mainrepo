/**
 * roadmap-parser.js
 *
 * docs/roadmap.md 파서 — 프로젝트별 체크박스 완료/미완료를 카운트하고
 * 완료율(%)을 계산한다.
 *
 * roadmap.md 포맷 규칙:
 *   # 개발 로드맵              ← 문서 제목 (무시)
 *   ## 프로젝트명              ← H2 헤딩 = 프로젝트 섹션 시작
 *   - [x] 완료된 태스크        ← 체크된 항목
 *   - [ ] 미완료 태스크        ← 미체크 항목
 *     - [x] 하위 태스크        ← 들여쓰기된 하위 항목도 카운트
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Regex patterns
const H2_RE = /^##\s+(.+)$/;                       // ## 프로젝트명
const CHECKED_RE = /^\s*-\s*\[x\]\s+(.+)$/i;       // - [x] task  (case-insensitive x)
const UNCHECKED_RE = /^\s*-\s*\[\s\]\s+(.+)$/;     // - [ ] task

/**
 * roadmap.md 파일을 파싱하여 프로젝트별 진행상황을 반환한다.
 *
 * @param {string} filePath  roadmap.md 절대 경로
 * @returns {{ projects: Array<{ name: string, total: number, done: number, percent: number, tasks: Array<{ text: string, done: boolean }> }>, overall: { total: number, done: number, percent: number } }}
 */
function parseRoadmap(filePath) {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return { projects: [], overall: { total: 0, done: 0, percent: 0 } };
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  return parseRoadmapContent(content);
}

/**
 * roadmap.md 문자열 내용을 파싱한다. (테스트 용이성을 위해 분리)
 *
 * @param {string} content  roadmap.md 원문
 * @returns {{ projects: Array, overall: object }}
 */
function parseRoadmapContent(content) {
  const lines = content.split(/\r?\n/);
  const projects = [];
  let current = null;

  for (const line of lines) {
    // H2 헤딩 감지 → 새 프로젝트 섹션 시작
    const h2Match = line.match(H2_RE);
    if (h2Match) {
      current = {
        name: h2Match[1].trim(),
        total: 0,
        done: 0,
        percent: 0,
        tasks: [],
      };
      projects.push(current);
      continue;
    }

    // 프로젝트 섹션 밖의 체크박스는 무시
    if (!current) continue;

    // 완료 체크박스
    const checkedMatch = line.match(CHECKED_RE);
    if (checkedMatch) {
      current.total += 1;
      current.done += 1;
      current.tasks.push({ text: checkedMatch[1].trim(), done: true });
      continue;
    }

    // 미완료 체크박스
    const uncheckedMatch = line.match(UNCHECKED_RE);
    if (uncheckedMatch) {
      current.total += 1;
      current.tasks.push({ text: uncheckedMatch[1].trim(), done: false });
      continue;
    }
  }

  // 각 프로젝트 완료율 계산
  for (const proj of projects) {
    proj.percent = proj.total > 0
      ? Math.round((proj.done / proj.total) * 100)
      : 0;
  }

  // 전체 집계
  const overallTotal = projects.reduce((s, p) => s + p.total, 0);
  const overallDone = projects.reduce((s, p) => s + p.done, 0);
  const overall = {
    total: overallTotal,
    done: overallDone,
    percent: overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0,
  };

  return { projects, overall };
}

module.exports = { parseRoadmap, parseRoadmapContent };
