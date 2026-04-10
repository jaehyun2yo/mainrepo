/**
 * routes/todo.js
 *
 * GET /api/todo — P0/P1/P2 우선순위별 > 프로젝트별 TODO 목록을 JSON으로 반환.
 *
 * 응답 형태:
 * {
 *   priorities: [
 *     {
 *       level: 'P0',
 *       label: '긴급',
 *       projects: [
 *         {
 *           name: 'yjlaser_website',
 *           items: [{ text: '할일 내용', done: false }],
 *           total: 2,
 *           done: 0
 *         }
 *       ],
 *       total: 3,
 *       done: 0
 *     }
 *   ],
 *   summary: { total: 40, done: 5, pending: 35, byPriority: { P0: { total: 3, done: 0 }, ... } }
 * }
 *
 * 쿼리 파라미터:
 *   ?priority=P0       특정 우선순위만 필터
 *   ?project=computeroff  특정 프로젝트만 필터
 *   ?pending=true      미완료 항목만 표시
 */

'use strict';

const { Router } = require('express');
const path = require('path');
const { parseTodo } = require('../parsers/todo-parser');

const router = Router();

// 모노레포 루트 기준 docs/todo.md 경로
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TODO_PATH = path.join(REPO_ROOT, 'docs', 'todo.md');

router.get('/api/todo', (req, res) => {
  try {
    const data = parseTodo(TODO_PATH);

    // 선택적 필터링
    const { priority, project, pending } = req.query;
    let { priorities } = data;

    // 우선순위 필터
    if (priority) {
      const levels = priority.toUpperCase().split(',');
      priorities = priorities.filter(p => levels.includes(p.level));
    }

    // 프로젝트 필터
    if (project) {
      const names = project.split(',').map(n => n.trim().toLowerCase());
      priorities = priorities.map(p => ({
        ...p,
        projects: p.projects.filter(proj =>
          names.some(n => proj.name.toLowerCase().includes(n))
        ),
      })).filter(p => p.projects.length > 0);
    }

    // 미완료만 필터
    if (pending === 'true') {
      priorities = priorities.map(p => ({
        ...p,
        projects: p.projects.map(proj => ({
          ...proj,
          items: proj.items.filter(i => !i.done),
        })).filter(proj => proj.items.length > 0),
      })).filter(p => p.projects.length > 0);
    }

    // 필터 적용 후 통계 재계산
    const filteredTotal = priorities.reduce(
      (s, p) => s + p.projects.reduce((s2, proj) => s2 + proj.items.length, 0), 0
    );
    const filteredDone = priorities.reduce(
      (s, p) => s + p.projects.reduce((s2, proj) => s2 + proj.items.filter(i => i.done).length, 0), 0
    );

    res.json({
      priorities,
      summary: {
        ...data.summary,
        filtered: { total: filteredTotal, done: filteredDone, pending: filteredTotal - filteredDone },
      },
    });
  } catch (err) {
    console.error('[todo] 파싱 오류:', err.message);
    res.status(500).json({ error: 'todo.md 파싱 실패', detail: err.message });
  }
});

module.exports = router;
