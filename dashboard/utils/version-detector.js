/**
 * version-detector.js
 *
 * Sub-project version detection utility.
 * Detects and parses version from package.json, pyproject.toml,
 * version.py, or version.json — with per-project fallback chains.
 */

const fs = require('fs');
const path = require('path');

// ── Version source parsers ─────────────────────────────

/**
 * Parse version from package.json
 * @param {string} filePath - Absolute path to package.json
 * @returns {string|null} Version string or null
 */
function parsePackageJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const pkg = JSON.parse(content);
    return pkg.version || null;
  } catch {
    return null;
  }
}

/**
 * Parse version from pyproject.toml
 * Matches: version = "X.Y.Z" in [project] section
 * @param {string} filePath - Absolute path to pyproject.toml
 * @returns {string|null} Version string or null
 */
function parsePyprojectToml(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Match version = "..." under [project] section
    // Simple line-based approach: find version = "..." after [project]
    const lines = content.split('\n');
    let inProjectSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect section headers
      if (/^\[.+\]$/.test(trimmed)) {
        inProjectSection = trimmed === '[project]';
        continue;
      }

      if (inProjectSection) {
        const match = trimmed.match(/^version\s*=\s*"([^"]+)"/);
        if (match) return match[1];
      }
    }

    // Fallback: match anywhere (for simpler toml files)
    const globalMatch = content.match(/^version\s*=\s*"([^"]+)"/m);
    return globalMatch ? globalMatch[1] : null;
  } catch {
    return null;
  }
}

/**
 * Parse version from Python version.py file
 * Matches patterns like: AGENT_VERSION = "1.0.0" or __version__ = "1.0.0"
 * @param {string} filePath - Absolute path to version.py
 * @returns {string|null} Version string or null
 */
function parseVersionPy(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Match: SOME_VERSION = "X.Y.Z" or __version__ = 'X.Y.Z'
    const match = content.match(/(?:__version__|[A-Z_]*VERSION)\s*=\s*["']([^"']+)["']/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Parse version from version.json
 * @param {string} filePath - Absolute path to version.json
 * @returns {string|null} Version string or null
 */
function parseVersionJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.version || null;
  } catch {
    return null;
  }
}

/**
 * Parse version from Python constants.py (APP_VERSION pattern)
 * Matches: APP_VERSION = "X.Y.Z"
 * @param {string} filePath - Absolute path to constants.py
 * @returns {string|null} Version string or null
 */
function parseConstantsPy(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── Per-project version detection strategies ────────────

/**
 * @typedef {Object} VersionSearchPath
 * @property {string} relativePath - Path relative to project root
 * @property {function(string): string|null} parser - Parser function
 * @property {string} source - Human-readable source name
 */

/**
 * Project definitions with version detection strategies.
 * Each project defines an ordered list of paths to check (first match wins).
 */
const PROJECT_DEFINITIONS = [
  {
    name: 'yjlaser_website',
    folder: 'yjlaser_website',
    stack: 'Node.js',
    searchPaths: [
      { relativePath: 'package.json', parser: parsePackageJson, source: 'package.json' },
    ],
  },
  {
    name: '외부웹하드동기화프로그램',
    folder: '외부웹하드동기화프로그램',
    stack: 'Electron',
    searchPaths: [
      { relativePath: 'package.json', parser: parsePackageJson, source: 'package.json' },
    ],
  },
  {
    name: '유진레이저목형 관리프로그램',
    folder: '유진레이저목형 관리프로그램',
    stack: 'Python',
    searchPaths: [
      // Primary: pyproject.toml inside invoice_manager subdirectory
      { relativePath: 'invoice_manager/pyproject.toml', parser: parsePyprojectToml, source: 'invoice_manager/pyproject.toml' },
      // Fallback: APP_VERSION in constants.py
      { relativePath: 'invoice_manager/config/constants.py', parser: parseConstantsPy, source: 'config/constants.py (APP_VERSION)' },
      // Fallback: pyproject.toml at root
      { relativePath: 'pyproject.toml', parser: parsePyprojectToml, source: 'pyproject.toml' },
    ],
  },
  {
    name: '레이저네스팅프로그램',
    folder: '레이저네스팅프로그램',
    stack: 'Python',
    searchPaths: [
      { relativePath: 'pyproject.toml', parser: parsePyprojectToml, source: 'pyproject.toml' },
    ],
  },
  {
    name: 'computeroff',
    folder: 'computeroff',
    stack: 'Python',
    searchPaths: [
      // Primary: version.json in dist/
      { relativePath: 'dist/version.json', parser: parseVersionJson, source: 'dist/version.json' },
      // Fallback: version.py in agent/
      { relativePath: 'agent/version.py', parser: parseVersionPy, source: 'agent/version.py' },
    ],
  },
];

// ── Main detection function ────────────────────────────

/**
 * Detect version for a single project by trying each search path in order.
 * @param {string} repoRoot - Absolute path to the monorepo root
 * @param {Object} projectDef - Project definition from PROJECT_DEFINITIONS
 * @returns {{ version: string, source: string }} Detected version and source file
 */
function detectProjectVersion(repoRoot, projectDef) {
  const projectDir = path.join(repoRoot, projectDef.folder);

  for (const searchPath of projectDef.searchPaths) {
    const filePath = path.join(projectDir, searchPath.relativePath);

    if (fs.existsSync(filePath)) {
      const version = searchPath.parser(filePath);
      if (version) {
        return { version, source: searchPath.source };
      }
    }
  }

  return { version: 'unknown', source: 'not found' };
}

/**
 * Detect versions for all defined sub-projects.
 * @param {string} repoRoot - Absolute path to the monorepo root
 * @returns {Array<{ name: string, folder: string, stack: string, version: string, source: string }>}
 */
function detectAllVersions(repoRoot) {
  return PROJECT_DEFINITIONS.map((def) => {
    const { version, source } = detectProjectVersion(repoRoot, def);
    return {
      name: def.name,
      folder: def.folder,
      stack: def.stack,
      version,
      source,
    };
  });
}

// ── Exports ────────────────────────────────────────────

module.exports = {
  // Main API
  detectAllVersions,
  detectProjectVersion,

  // Individual parsers (for testing/reuse)
  parsePackageJson,
  parsePyprojectToml,
  parseVersionPy,
  parseVersionJson,
  parseConstantsPy,

  // Project definitions (for extension)
  PROJECT_DEFINITIONS,
};
