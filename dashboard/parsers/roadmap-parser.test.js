/**
 * roadmap-parser.test.js — 단위 테스트
 *
 * 실행: node dashboard/parsers/roadmap-parser.test.js
 */

'use strict';

const { parseRoadmapContent, parseRoadmap } = require('./roadmap-parser');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  assert(
    actual === expected,
    `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// --- Test 1: 빈 문자열 ---
console.log('\nTest 1: 빈 문자열');
{
  const result = parseRoadmapContent('');
  assertEqual(result.projects.length, 0, 'projects 비어있음');
  assertEqual(result.overall.total, 0, 'overall total 0');
  assertEqual(result.overall.percent, 0, 'overall percent 0');
}

// --- Test 2: 단일 프로젝트 ---
console.log('\nTest 2: 단일 프로젝트, 혼합 체크박스');
{
  const md = `# 개발 로드맵

## yjlaser_website

- [x] 웹사이트 기본 UI 구축
- [x] 거래처 관리 시스템
- [ ] Worker 작업관리 시스템 고도화
- [ ] 웹하드 통합 완성
`;
  const result = parseRoadmapContent(md);
  assertEqual(result.projects.length, 1, '프로젝트 1개');
  assertEqual(result.projects[0].name, 'yjlaser_website', '프로젝트명');
  assertEqual(result.projects[0].total, 4, 'total 4');
  assertEqual(result.projects[0].done, 2, 'done 2');
  assertEqual(result.projects[0].percent, 50, 'percent 50%');
}

// --- Test 3: 복수 프로젝트 ---
console.log('\nTest 3: 복수 프로젝트');
{
  const md = `# 로드맵

## projectA

- [x] task1
- [x] task2
- [x] task3

## projectB

- [ ] task1
- [ ] task2
`;
  const result = parseRoadmapContent(md);
  assertEqual(result.projects.length, 2, '프로젝트 2개');
  assertEqual(result.projects[0].percent, 100, 'projectA 100%');
  assertEqual(result.projects[1].percent, 0, 'projectB 0%');
  assertEqual(result.overall.total, 5, 'overall total 5');
  assertEqual(result.overall.done, 3, 'overall done 3');
  assertEqual(result.overall.percent, 60, 'overall 60%');
}

// --- Test 4: 들여쓰기된 하위 태스크 ---
console.log('\nTest 4: 하위 태스크 (들여쓰기)');
{
  const md = `## myProject

- [x] 상위 태스크
  - [x] 하위 태스크 1
  - [ ] 하위 태스크 2
`;
  const result = parseRoadmapContent(md);
  assertEqual(result.projects[0].total, 3, 'total 3 (상위+하위)');
  assertEqual(result.projects[0].done, 2, 'done 2');
  assertEqual(result.projects[0].percent, 67, 'percent 67%');
}

// --- Test 5: 대소문자 X 처리 ---
console.log('\nTest 5: 대문자 X도 체크로 인식');
{
  const md = `## test

- [X] uppercase X
- [x] lowercase x
- [ ] unchecked
`;
  const result = parseRoadmapContent(md);
  assertEqual(result.projects[0].done, 2, '대소문자 X 모두 done');
}

// --- Test 6: 체크박스 없는 프로젝트 ---
console.log('\nTest 6: 체크박스 없는 프로젝트');
{
  const md = `## emptyProject

설명만 있는 섹션
`;
  const result = parseRoadmapContent(md);
  assertEqual(result.projects[0].total, 0, 'total 0');
  assertEqual(result.projects[0].percent, 0, 'percent 0');
}

// --- Test 7: 현재 실제 roadmap.md 파싱 ---
console.log('\nTest 7: 실제 docs/roadmap.md 파싱');
{
  const repoRoot = path.resolve(__dirname, '..', '..');
  const roadmapPath = path.join(repoRoot, 'docs', 'roadmap.md');
  const result = parseRoadmap(roadmapPath);
  assert(result.projects.length >= 0, `파싱 성공 — ${result.projects.length}개 프로젝트`);
  assert(typeof result.overall.percent === 'number', 'overall percent는 숫자');
  console.log(`  📊 전체 진행률: ${result.overall.percent}% (${result.overall.done}/${result.overall.total})`);
  for (const p of result.projects) {
    console.log(`     - ${p.name}: ${p.percent}% (${p.done}/${p.total})`);
  }
}

// --- Test 8: 존재하지 않는 파일 ---
console.log('\nTest 8: 파일이 없을 때');
{
  const result = parseRoadmap('/nonexistent/roadmap.md');
  assertEqual(result.projects.length, 0, 'projects 비어있음');
  assertEqual(result.overall.percent, 0, 'percent 0');
}

// --- Test 9: tasks 배열 내용 확인 ---
console.log('\nTest 9: tasks 배열 내용');
{
  const md = `## proj

- [x] done task
- [ ] pending task
`;
  const result = parseRoadmapContent(md);
  assertEqual(result.projects[0].tasks.length, 2, 'tasks 2개');
  assertEqual(result.projects[0].tasks[0].text, 'done task', '첫 번째 task text');
  assertEqual(result.projects[0].tasks[0].done, true, '첫 번째 task done=true');
  assertEqual(result.projects[0].tasks[1].text, 'pending task', '두 번째 task text');
  assertEqual(result.projects[0].tasks[1].done, false, '두 번째 task done=false');
}

// --- 결과 ---
console.log(`\n${'='.repeat(40)}`);
console.log(`결과: ${passed} 통과, ${failed} 실패`);
process.exit(failed > 0 ? 1 : 0);
