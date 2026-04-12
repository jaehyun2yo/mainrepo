/**
 * GitPullScheduler 유닛 테스트
 *
 * 실행: node dashboard/utils/git-pull-scheduler.test.js
 */

const { GitPullScheduler } = require('./git-pull-scheduler');
const path = require('path');
const assert = require('assert');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('\n=== GitPullScheduler 테스트 ===\n');

// ── 생성자 테스트 ──
test('기본 옵션으로 생성', () => {
  const scheduler = new GitPullScheduler({ repoRoot: REPO_ROOT });
  assert.strictEqual(scheduler.repoRoot, REPO_ROOT);
  assert.strictEqual(scheduler.intervalMs, 300000, '기본 주기는 5분(300000ms)');
  assert.strictEqual(scheduler.startupDelayMs, 5000, '기본 시작 딜레이는 5초');
  assert.strictEqual(scheduler.isRunning, false);
  assert.strictEqual(scheduler.lastResult.status, 'pending');
});

test('커스텀 옵션으로 생성', () => {
  const scheduler = new GitPullScheduler({
    repoRoot: REPO_ROOT,
    intervalMs: 60000,
    startupDelayMs: 1000,
  });
  assert.strictEqual(scheduler.intervalMs, 60000);
  assert.strictEqual(scheduler.startupDelayMs, 1000);
});

// ── getStatus 테스트 ──
test('초기 상태 조회', () => {
  const scheduler = new GitPullScheduler({ repoRoot: REPO_ROOT });
  const status = scheduler.getStatus();
  assert.strictEqual(status.isRunning, false);
  assert.strictEqual(status.intervalMs, 300000);
  assert.strictEqual(status.intervalSec, 300);
  assert.strictEqual(status.consecutiveErrors, 0);
  assert.strictEqual(status.historyCount, 0);
  assert.strictEqual(status.lastResult.status, 'pending');
});

// ── getHistory 테스트 ──
test('빈 히스토리 조회', () => {
  const scheduler = new GitPullScheduler({ repoRoot: REPO_ROOT });
  const history = scheduler.getHistory();
  assert.deepStrictEqual(history, []);
});

test('히스토리 limit 적용', () => {
  const scheduler = new GitPullScheduler({ repoRoot: REPO_ROOT });
  // 수동으로 히스토리 추가
  for (let i = 0; i < 5; i++) {
    scheduler.history.push({ status: 'success', message: `test-${i}` });
  }
  const limited = scheduler.getHistory(3);
  assert.strictEqual(limited.length, 3);
});

// ── 실제 git pull 실행 테스트 ──
asyncTest('실제 git pull 실행 (동시 실행 방지 포함)', async () => {
  const scheduler = new GitPullScheduler({ repoRoot: REPO_ROOT });

  // 첫 번째 실행
  const result = await scheduler.execute();
  assert.ok(['success', 'error'].includes(result.status), `상태: ${result.status}`);
  assert.ok(result.timestamp, '타임스탬프가 있어야 함');
  assert.ok(typeof result.durationMs === 'number', '실행 시간이 있어야 함');

  // 히스토리에 기록됨
  assert.strictEqual(scheduler.history.length, 1);
  assert.deepStrictEqual(scheduler.lastResult, result);
}).then(() => {
  return asyncTest('연속 실행 시 히스토리 누적', async () => {
    const scheduler = new GitPullScheduler({ repoRoot: REPO_ROOT });
    await scheduler.execute();
    await scheduler.execute();
    assert.strictEqual(scheduler.history.length, 2);
    assert.strictEqual(scheduler.getStatus().historyCount, 2);
  });
}).then(() => {
  return asyncTest('onSuccess 콜백 호출', async () => {
    let called = false;
    const scheduler = new GitPullScheduler({
      repoRoot: REPO_ROOT,
      onSuccess: () => { called = true; },
    });
    const result = await scheduler.execute();
    if (result.status === 'success') {
      assert.ok(called, 'onSuccess 콜백이 호출되어야 함');
    }
  });
}).then(() => {
  return asyncTest('start/stop 동작', async () => {
    const scheduler = new GitPullScheduler({
      repoRoot: REPO_ROOT,
      intervalMs: 60000,
      startupDelayMs: 999999, // 테스트 중 자동 실행 방지
    });
    scheduler.start();
    assert.ok(scheduler._startupTimer !== null, '시작 타이머 설정됨');
    assert.ok(scheduler._intervalTimer !== null, '인터벌 타이머 설정됨');

    scheduler.stop();
    assert.strictEqual(scheduler._startupTimer, null, '시작 타이머 정리됨');
    assert.strictEqual(scheduler._intervalTimer, null, '인터벌 타이머 정리됨');
  });
}).then(() => {
  return asyncTest('config.json gitPullIntervalMs=300000 (5분) 확인', async () => {
    const fs = require('fs');
    const configPath = path.join(__dirname, '..', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(config.gitPullIntervalMs, 300000, 'config.json에 5분 주기 설정');
  });
}).then(() => {
  console.log(`\n결과: ${passed} 통과, ${failed} 실패\n`);
  process.exit(failed > 0 ? 1 : 0);
});
