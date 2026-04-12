/**
 * git-activity.js
 *
 * Sub-project git activity detection utility.
 * Queries the most recent git commit date for each sub-project directory
 * using `git log` with path filtering (monorepo-aware).
 */

const { execSync } = require('child_process');
const path = require('path');

// ── Project directories (must match version-detector.js) ──

const PROJECT_FOLDERS = [
  { name: 'yjlaser_website', folder: 'yjlaser_website' },
  { name: '외부웹하드동기화프로그램', folder: '외부웹하드동기화프로그램' },
  { name: '유진레이저목형 관리프로그램', folder: '유진레이저목형 관리프로그램' },
  { name: '레이저네스팅프로그램', folder: '레이저네스팅프로그램' },
  { name: 'computeroff', folder: 'computeroff' },
];

// ── Core git query functions ──────────────────────────

/**
 * Get the most recent git commit info for a specific directory path.
 * Uses `git log -1` with `--` path filter so it works in a monorepo.
 *
 * @param {string} repoRoot - Absolute path to the monorepo root
 * @param {string} relativePath - Directory path relative to repoRoot
 * @returns {{ date: string|null, message: string|null, author: string|null, hash: string|null }}
 */
function getLastCommitForPath(repoRoot, relativePath) {
  try {
    // Format: ISO date | subject | author name | short hash
    const format = '%aI|%s|%an|%h';
    const targetPath = path.join(repoRoot, relativePath);

    const result = execSync(
      `git log -1 --format="${format}" -- "${relativePath}"`,
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        timeout: 10000,
        // Suppress stderr to avoid noise on clean repos
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    ).trim();

    if (!result) {
      return { date: null, message: null, author: null, hash: null };
    }

    // Split on first 3 pipes only (commit message may contain |)
    const parts = result.split('|');
    const date = parts[0] || null;
    const hash = parts.length >= 4 ? parts[parts.length - 1] : null;
    const author = parts.length >= 4 ? parts[parts.length - 2] : null;
    // Message is everything between date and author (handles | in messages)
    const message = parts.length >= 4
      ? parts.slice(1, parts.length - 2).join('|')
      : (parts[1] || null);

    return { date, message, author, hash };
  } catch {
    return { date: null, message: null, author: null, hash: null };
  }
}

/**
 * Get the most recent commit date for each defined sub-project.
 *
 * @param {string} repoRoot - Absolute path to the monorepo root
 * @returns {Array<{ name: string, folder: string, lastCommit: { date: string|null, message: string|null, author: string|null, hash: string|null }, daysAgo: number|null }>}
 */
function getAllProjectActivity(repoRoot) {
  return PROJECT_FOLDERS.map((project) => {
    const lastCommit = getLastCommitForPath(repoRoot, project.folder);

    let daysAgo = null;
    if (lastCommit.date) {
      const commitDate = new Date(lastCommit.date);
      const now = new Date();
      daysAgo = Math.floor((now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      name: project.name,
      folder: project.folder,
      lastCommit,
      daysAgo,
    };
  });
}

/**
 * Get the most recent commit date for the entire repository.
 *
 * @param {string} repoRoot - Absolute path to the monorepo root
 * @returns {{ date: string|null, message: string|null, author: string|null, hash: string|null }}
 */
function getRepoLastCommit(repoRoot) {
  try {
    const format = '%aI|%s|%an|%h';
    const result = execSync(
      `git log -1 --format="${format}"`,
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    ).trim();

    if (!result) {
      return { date: null, message: null, author: null, hash: null };
    }

    const parts = result.split('|');
    const date = parts[0] || null;
    const hash = parts.length >= 4 ? parts[parts.length - 1] : null;
    const author = parts.length >= 4 ? parts[parts.length - 2] : null;
    const message = parts.length >= 4
      ? parts.slice(1, parts.length - 2).join('|')
      : (parts[1] || null);

    return { date, message, author, hash };
  } catch {
    return { date: null, message: null, author: null, hash: null };
  }
}

// ── Exports ──────────────────────────────────────────

module.exports = {
  // Main API
  getAllProjectActivity,
  getLastCommitForPath,
  getRepoLastCommit,

  // Project definitions (for testing/extension)
  PROJECT_FOLDERS,
};
