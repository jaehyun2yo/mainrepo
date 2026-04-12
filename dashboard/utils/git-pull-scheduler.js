/**
 * Git Pull Scheduler
 *
 * 5분 주기로 git pull을 자동 실행하여 최신 데이터(roadmap.md, todo.md 등)를 유지한다.
 *
 * 기능:
 * - 서버 시작 후 초기 git pull 실행 (5초 딜레이)
 * - 설정된 주기(기본 5분)로 자동 git pull 반복
 * - 최근 실행 히스토리 유지 (최대 20건)
 * - git pull 성공 시 config 리로드 콜백 호출
 * - 수동 트리거 지원
 * - 동시 실행 방지 (lock 메커니즘)
 */

const { exec } = require('child_process');

const MAX_HISTORY = 20;

class GitPullScheduler {
  /**
   * @param {Object} options
   * @param {string} options.repoRoot - 모노레포 루트 경로
   * @param {number} [options.intervalMs=300000] - git pull 주기 (밀리초, 기본 5분)
   * @param {number} [options.startupDelayMs=5000] - 서버 시작 후 최초 실행 딜레이
   * @param {Function} [options.onSuccess] - git pull 성공 시 콜백
   * @param {Function} [options.onError] - git pull 실패 시 콜백
   */
  constructor(options) {
    this.repoRoot = options.repoRoot;
    this.intervalMs = options.intervalMs || 300000;
    this.startupDelayMs = options.startupDelayMs || 5000;
    this.onSuccess = options.onSuccess || null;
    this.onError = options.onError || null;

    this.lastResult = {
      status: 'pending',
      message: '아직 실행되지 않음',
      timestamp: null,
    };
    this.history = [];
    this.isRunning = false;
    this._startupTimer = null;
    this._intervalTimer = null;
    this._consecutiveErrors = 0;
  }

  /**
   * 스케줄러 시작
   * 서버 시작 후 startupDelayMs 뒤 최초 실행, 이후 intervalMs 주기로 반복
   */
  start() {
    console.log(`[git-pull] 스케줄러 시작 — 주기: ${this.intervalMs / 1000}초, 초기 딜레이: ${this.startupDelayMs / 1000}초`);

    // 서버 시작 직후 약간의 딜레이 후 최초 실행
    this._startupTimer = setTimeout(() => {
      this.execute();
    }, this.startupDelayMs);

    // 주기적 실행
    this._intervalTimer = setInterval(() => {
      this.execute();
    }, this.intervalMs);
  }

  /**
   * 스케줄러 중지
   */
  stop() {
    if (this._startupTimer) {
      clearTimeout(this._startupTimer);
      this._startupTimer = null;
    }
    if (this._intervalTimer) {
      clearInterval(this._intervalTimer);
      this._intervalTimer = null;
    }
    console.log('[git-pull] 스케줄러 중지됨');
  }

  /**
   * git pull 실행 (수동 또는 자동)
   * @returns {Promise<Object>} 실행 결과
   */
  execute() {
    return new Promise((resolve) => {
      // 동시 실행 방지
      if (this.isRunning) {
        const skipped = {
          status: 'skipped',
          message: '이전 git pull이 아직 실행 중',
          timestamp: new Date().toISOString(),
        };
        console.log('[git-pull] 이전 작업 실행 중 — 건너뜀');
        resolve(skipped);
        return;
      }

      this.isRunning = true;
      const startTime = Date.now();

      exec('git pull', { cwd: this.repoRoot, timeout: 30000 }, (err, stdout, stderr) => {
        const timestamp = new Date().toISOString();
        const durationMs = Date.now() - startTime;
        let result;

        if (err) {
          this._consecutiveErrors++;
          result = {
            status: 'error',
            message: stderr ? stderr.trim() : err.message,
            timestamp,
            durationMs,
            consecutiveErrors: this._consecutiveErrors,
          };
          console.error(`[git-pull] 오류 (연속 ${this._consecutiveErrors}회): ${result.message}`);

          if (this.onError) {
            try { this.onError(result); } catch (e) { /* ignore callback error */ }
          }
        } else {
          this._consecutiveErrors = 0;
          const output = stdout.trim();
          const hasChanges = output !== 'Already up to date.' && output !== 'Already up-to-date.';

          result = {
            status: 'success',
            message: output,
            timestamp,
            durationMs,
            hasChanges,
          };

          if (hasChanges) {
            console.log(`[git-pull] 업데이트 반영됨: ${output}`);
          } else {
            console.log(`[git-pull] 최신 상태 (${durationMs}ms)`);
          }

          if (this.onSuccess) {
            try { this.onSuccess(result); } catch (e) { /* ignore callback error */ }
          }
        }

        // 결과 저장
        this.lastResult = result;
        this.history.unshift(result);
        if (this.history.length > MAX_HISTORY) {
          this.history.pop();
        }

        this.isRunning = false;
        resolve(result);
      });
    });
  }

  /**
   * 최근 git pull 결과 조회
   */
  getLastResult() {
    return this.lastResult;
  }

  /**
   * git pull 히스토리 조회
   * @param {number} [limit=10] - 최대 반환 건수
   */
  getHistory(limit = 10) {
    return this.history.slice(0, limit);
  }

  /**
   * 스케줄러 상태 요약
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      intervalSec: this.intervalMs / 1000,
      consecutiveErrors: this._consecutiveErrors,
      lastResult: this.lastResult,
      historyCount: this.history.length,
      nextPullApprox: this.lastResult.timestamp
        ? new Date(new Date(this.lastResult.timestamp).getTime() + this.intervalMs).toISOString()
        : null,
    };
  }
}

module.exports = { GitPullScheduler };
