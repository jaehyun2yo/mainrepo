/**
 * git-activity.test.js
 *
 * Tests for sub-project git activity detection utility.
 * Run: node dashboard/utils/git-activity.test.js
 */

const path = require('path');
const {
  getAllProjectActivity,
  getLastCommitForPath,
  getRepoLastCommit,
  PROJECT_FOLDERS,
} = require('./git-activity');

// ── Test helpers ──────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${testName}`);
  }
}

function assertEqual(actual, expected, testName) {
  if (actual === expected) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${testName} — expected "${expected}", got "${actual}"`);
  }
}

// ── Tests: PROJECT_FOLDERS ───────────────────────────

console.log('\n=== PROJECT_FOLDERS ===');

assertEqual(PROJECT_FOLDERS.length, 5, 'Defines 5 sub-projects');

const expectedFolders = [
  'yjlaser_website',
  '외부웹하드동기화프로그램',
  '유진레이저목형 관리프로그램',
  '레이저네스팅프로그램',
  'computeroff',
];

for (const folder of expectedFolders) {
  const found = PROJECT_FOLDERS.find((p) => p.folder === folder);
  assert(found !== undefined, `Has project folder: ${folder}`);
}

// ── Tests: getLastCommitForPath (real repo) ──────────

console.log('\n=== getLastCommitForPath (real repo) ===');

const repoRoot = path.resolve(__dirname, '../..');

(() => {
  // Use docs/ which is a committed directory (dashboard/ may not be committed yet)
  const result = getLastCommitForPath(repoRoot, 'docs');
  assert(typeof result === 'object', 'Returns an object for docs/');
  assert(result.date !== null, 'docs/ has a commit date');
  assert(result.hash !== null, 'docs/ has a commit hash');
  assert(typeof result.message === 'string', 'docs/ has a commit message');
  assert(typeof result.author === 'string', 'docs/ has an author');

  if (result.date) {
    // Validate ISO date format
    const parsed = new Date(result.date);
    assert(!isNaN(parsed.getTime()), 'Commit date is a valid ISO date');
    console.log(`    -> docs/: ${result.date} (${result.hash}) "${result.message}"`);
  }
})();

(() => {
  // Non-existent path should return null values
  const result = getLastCommitForPath(repoRoot, 'nonexistent-directory-xyz');
  assertEqual(result.date, null, 'Returns null date for nonexistent directory');
  assertEqual(result.hash, null, 'Returns null hash for nonexistent directory');
})();

// ── Tests: getRepoLastCommit (real repo) ─────────────

console.log('\n=== getRepoLastCommit (real repo) ===');

(() => {
  const result = getRepoLastCommit(repoRoot);
  assert(result.date !== null, 'Repo has a last commit date');
  assert(result.hash !== null, 'Repo has a last commit hash');
  assert(result.message !== null, 'Repo has a last commit message');
  assert(result.author !== null, 'Repo has a last commit author');

  if (result.date) {
    const parsed = new Date(result.date);
    assert(!isNaN(parsed.getTime()), 'Repo commit date is a valid ISO date');
    console.log(`    -> repo: ${result.date} (${result.hash}) "${result.message}"`);
  }
})();

// ── Tests: getAllProjectActivity (real repo) ──────────

console.log('\n=== getAllProjectActivity (real repo) ===');

const activities = getAllProjectActivity(repoRoot);

assert(Array.isArray(activities), 'Returns an array');
assertEqual(activities.length, 5, 'Returns 5 projects');

for (const activity of activities) {
  assert(typeof activity.name === 'string' && activity.name.length > 0, `"${activity.name}" has name`);
  assert(typeof activity.folder === 'string' && activity.folder.length > 0, `"${activity.name}" has folder`);
  assert(typeof activity.lastCommit === 'object', `"${activity.name}" has lastCommit object`);

  if (activity.lastCommit.date) {
    assert(typeof activity.daysAgo === 'number', `"${activity.name}" has daysAgo as number`);
    assert(activity.daysAgo >= 0, `"${activity.name}" daysAgo is non-negative`);
    console.log(`    -> ${activity.name}: ${activity.daysAgo} days ago (${activity.lastCommit.date})`);
  } else {
    console.log(`    -> ${activity.name}: no commits found`);
  }
}

// ── Tests: error resilience ──────────────────────────

console.log('\n=== Error resilience ===');

(() => {
  // Invalid repo root should not throw, just return nulls
  const result = getLastCommitForPath('/nonexistent/repo', 'any-path');
  assertEqual(result.date, null, 'Gracefully handles invalid repo root');
})();

(() => {
  const result = getRepoLastCommit('/nonexistent/repo');
  assertEqual(result.date, null, 'getRepoLastCommit handles invalid repo root');
})();

(() => {
  const results = getAllProjectActivity('/nonexistent/repo');
  assert(Array.isArray(results), 'getAllProjectActivity returns array even with invalid root');
  assertEqual(results.length, 5, 'Still returns 5 projects');
  for (const r of results) {
    assertEqual(r.lastCommit.date, null, `"${r.name}" returns null date for invalid root`);
    assertEqual(r.daysAgo, null, `"${r.name}" returns null daysAgo for invalid root`);
  }
})();

// ── Results ──────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
