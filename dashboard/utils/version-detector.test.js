/**
 * version-detector.test.js
 *
 * Tests for sub-project version detection utility.
 * Run: node dashboard/utils/version-detector.test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  parsePackageJson,
  parsePyprojectToml,
  parseVersionPy,
  parseVersionJson,
  parseConstantsPy,
  detectAllVersions,
  detectProjectVersion,
  PROJECT_DEFINITIONS,
} = require('./version-detector');

// ── Test helpers ──────────────────────────────────────

let passed = 0;
let failed = 0;
let tmpDir;

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

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-detector-test-'));
}

function cleanup() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function writeFile(relativePath, content) {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

// ── Tests: parsePackageJson ───────────────────────────

console.log('\n=== parsePackageJson ===');

setup();

(() => {
  const filePath = writeFile('pkg/package.json', JSON.stringify({ name: 'test', version: '1.2.3' }));
  assertEqual(parsePackageJson(filePath), '1.2.3', 'Parses version from valid package.json');
})();

(() => {
  const filePath = writeFile('pkg2/package.json', JSON.stringify({ name: 'no-version' }));
  assertEqual(parsePackageJson(filePath), null, 'Returns null when version field missing');
})();

(() => {
  assertEqual(parsePackageJson('/nonexistent/package.json'), null, 'Returns null for nonexistent file');
})();

(() => {
  const filePath = writeFile('pkg3/package.json', '{invalid json}');
  assertEqual(parsePackageJson(filePath), null, 'Returns null for invalid JSON');
})();

cleanup();

// ── Tests: parsePyprojectToml ─────────────────────────

console.log('\n=== parsePyprojectToml ===');

setup();

(() => {
  const content = `[build-system]
requires = ["setuptools"]

[project]
name = "test"
version = "2.0.1"
description = "Test project"
`;
  const filePath = writeFile('py/pyproject.toml', content);
  assertEqual(parsePyprojectToml(filePath), '2.0.1', 'Parses version from [project] section');
})();

(() => {
  const content = `[tool.poetry]
version = "0.9.0"

[project]
name = "real"
version = "1.5.0"
`;
  const filePath = writeFile('py2/pyproject.toml', content);
  assertEqual(parsePyprojectToml(filePath), '1.5.0', 'Prefers [project] section over [tool.poetry]');
})();

(() => {
  const content = `[build-system]
requires = ["setuptools"]
`;
  const filePath = writeFile('py3/pyproject.toml', content);
  assertEqual(parsePyprojectToml(filePath), null, 'Returns null when no version found');
})();

(() => {
  assertEqual(parsePyprojectToml('/nonexistent/pyproject.toml'), null, 'Returns null for nonexistent file');
})();

cleanup();

// ── Tests: parseVersionPy ─────────────────────────────

console.log('\n=== parseVersionPy ===');

setup();

(() => {
  const filePath = writeFile('ver/version.py', '"""Version"""\n\nAGENT_VERSION = "1.0.0"\n');
  assertEqual(parseVersionPy(filePath), '1.0.0', 'Parses AGENT_VERSION');
})();

(() => {
  const filePath = writeFile('ver2/version.py', "__version__ = '3.2.1'\n");
  assertEqual(parseVersionPy(filePath), '3.2.1', 'Parses __version__ with single quotes');
})();

(() => {
  const filePath = writeFile('ver3/version.py', 'APP_VERSION = "2.5.0"\n');
  assertEqual(parseVersionPy(filePath), '2.5.0', 'Parses APP_VERSION');
})();

(() => {
  const filePath = writeFile('ver4/version.py', '# just a comment\n');
  assertEqual(parseVersionPy(filePath), null, 'Returns null when no version pattern found');
})();

cleanup();

// ── Tests: parseVersionJson ───────────────────────────

console.log('\n=== parseVersionJson ===');

setup();

(() => {
  const filePath = writeFile('vj/version.json', JSON.stringify({ version: '1.0.0', variants: {} }));
  assertEqual(parseVersionJson(filePath), '1.0.0', 'Parses version from version.json');
})();

(() => {
  const filePath = writeFile('vj2/version.json', JSON.stringify({ name: 'no-version' }));
  assertEqual(parseVersionJson(filePath), null, 'Returns null when version field missing');
})();

cleanup();

// ── Tests: parseConstantsPy ───────────────────────────

console.log('\n=== parseConstantsPy ===');

setup();

(() => {
  const filePath = writeFile('const/constants.py', `
# Config constants
APP_NAME = "Test"
APP_VERSION = "1.11.3"
MAX_RETRY = 3
`);
  assertEqual(parseConstantsPy(filePath), '1.11.3', 'Parses APP_VERSION from constants.py');
})();

(() => {
  const filePath = writeFile('const2/constants.py', '# no version here\nFOO = "bar"\n');
  assertEqual(parseConstantsPy(filePath), null, 'Returns null when APP_VERSION not found');
})();

cleanup();

// ── Tests: detectProjectVersion ───────────────────────

console.log('\n=== detectProjectVersion ===');

setup();

(() => {
  // Simulate a Node.js project
  writeFile('myproject/package.json', JSON.stringify({ version: '4.0.0' }));
  const def = {
    name: 'myproject',
    folder: 'myproject',
    stack: 'Node.js',
    searchPaths: [
      { relativePath: 'package.json', parser: parsePackageJson, source: 'package.json' },
    ],
  };
  const result = detectProjectVersion(tmpDir, def);
  assertEqual(result.version, '4.0.0', 'Detects version from Node.js project');
  assertEqual(result.source, 'package.json', 'Reports correct source');
})();

(() => {
  // Simulate a project with fallback chain
  writeFile('fallback-project/agent/version.py', 'AGENT_VERSION = "2.0.0"\n');
  const def = {
    name: 'fallback',
    folder: 'fallback-project',
    stack: 'Python',
    searchPaths: [
      { relativePath: 'dist/version.json', parser: parseVersionJson, source: 'dist/version.json' },
      { relativePath: 'agent/version.py', parser: parseVersionPy, source: 'agent/version.py' },
    ],
  };
  const result = detectProjectVersion(tmpDir, def);
  assertEqual(result.version, '2.0.0', 'Falls back to second search path when first missing');
  assertEqual(result.source, 'agent/version.py', 'Reports fallback source');
})();

(() => {
  // Simulate no version file at all
  fs.mkdirSync(path.join(tmpDir, 'empty-project'), { recursive: true });
  const def = {
    name: 'empty',
    folder: 'empty-project',
    stack: 'Unknown',
    searchPaths: [
      { relativePath: 'package.json', parser: parsePackageJson, source: 'package.json' },
    ],
  };
  const result = detectProjectVersion(tmpDir, def);
  assertEqual(result.version, 'unknown', 'Returns "unknown" when no version file exists');
  assertEqual(result.source, 'not found', 'Reports "not found" as source');
})();

cleanup();

// ── Tests: detectAllVersions (against real repo) ──────

console.log('\n=== detectAllVersions (real repo) ===');

const repoRoot = path.resolve(__dirname, '../..');
const results = detectAllVersions(repoRoot);

assert(Array.isArray(results), 'Returns an array');
assertEqual(results.length, 5, 'Returns 5 projects');

for (const project of results) {
  assert(typeof project.name === 'string' && project.name.length > 0, `Project "${project.name}" has name`);
  assert(typeof project.folder === 'string' && project.folder.length > 0, `Project "${project.name}" has folder`);
  assert(typeof project.version === 'string', `Project "${project.name}" has version string`);
  assert(typeof project.source === 'string', `Project "${project.name}" has source string`);

  // All projects should have a detected version (not 'unknown')
  if (project.version !== 'unknown') {
    console.log(`    -> ${project.name}: v${project.version} (from ${project.source})`);
  } else {
    console.log(`    -> ${project.name}: version not detected`);
  }
}

// ── Results ───────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
