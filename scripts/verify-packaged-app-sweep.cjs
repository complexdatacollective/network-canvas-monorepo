// Exhaustive module-resolution sweep over a packaged Electron app's asar.
//
// Runs INSIDE the packaged app's own binary via ELECTRON_RUN_AS_NODE=1, which
// matters twice over: Electron patches fs and Module._resolveFilename with
// asar support (so the archive reads like a directory tree with no extra
// dependencies), and resolution follows exactly the semantics the app uses at
// runtime. Spawned by scripts/verify-packaged-app.mjs.
//
// Every statically-written require()/import specifier in the asar must
// resolve within the packed tree. Failures are classified by reachability:
//
//   errors   — the failing specifier sits in a file reachable from the app's
//              entry points (package.json main + preload scripts) through the
//              static require graph. These can break the app and fail the
//              verification. This is laziness-proof: a require buried in a
//              rarely-used feature path is still reachable.
//   warnings — the failing file is not reachable from any entry point
//              (packages' own test files, browser/react-native bundles, CLI
//              entries nothing requires). Reported for visibility only;
//              packages routinely ship such files with unresolvable requires.
//
// This is the check that would have caught both 6.6.0 classic-app launch
// crashes, where electron-builder `files` exclusions deleted lazystream's
// nested readable-stream@2 (Architect) and lodash (Interviewer) from the
// asar: the failing requires sit directly on the require graph of each app's
// main entry.
//
// Usage: ELECTRON_RUN_AS_NODE=1 <app-binary> verify-packaged-app-sweep.cjs \
//          <path-to-app.asar>
// Prints a JSON report to stdout; exit code 0 iff no errors (warnings allowed).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { builtinModules, createRequire } = require('node:module');

const BUILTINS = new Set(builtinModules);

// Specifiers that legitimately do not resolve inside the asar, even from
// reachable files.
const ALLOWED_MISSING = new Map([
  // Provided by the Electron runtime, not node_modules.
  ['electron', 'provided by the Electron runtime'],
  // Dev-only devDependency; the requiring code returns early unless
  // NODE_ENV === 'development' (see architect-classic loadDevTools.js).
  ['electron-devtools-installer', 'dev-gated devDependency'],
]);

// App renderer bundles are produced by Vite, which resolves every import at
// build time; bare specifiers matched there are strings inside minified
// output, not runtime requires. node_modules is never skipped.
const SKIPPED_APP_DIRS = new Set(['dist/renderer', 'out/renderer']);

const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);

function isBuiltin(specifier) {
  if (specifier.startsWith('node:')) return true;
  const bare = specifier.split('/', 1)[0];
  return BUILTINS.has(bare) && BUILTINS.has(specifier);
}

// Drop comments so JSDoc content is not treated as real requires: full-line
// `//` and `*` (JSDoc continuation) comments, plus single-line `/* ... */`
// block comments — the latter catches type-only imports like
// `/** @type {import('./types').Cache} */`, including inline casts.
// Lines starting with `//` or `*` are never executable code, so this cannot
// hide a genuine require.
function stripCommentLines(source) {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .map((line) => line.replace(/\/\*.*?\*\//g, ''))
    .join('\n');
}

const REQUIRE_RE = /(?<![\w.$])require\s*\(\s*(['"])((?:(?!\1).)+)\1\s*\)/g;
const IMPORT_FROM_RE =
  /(?:^|[;\n{}])\s*(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])((?:(?!\1).)+)\1/g;
const BARE_IMPORT_RE = /(?:^|[;\n{}])\s*import\s*(['"])((?:(?!\1).)+)\1/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(['"])((?:(?!\1).)+)\1\s*\)/g;

function extractSpecifiers(source) {
  const stripped = stripCommentLines(source);
  const specifiers = new Set();
  for (const re of [
    REQUIRE_RE,
    IMPORT_FROM_RE,
    BARE_IMPORT_RE,
    DYNAMIC_IMPORT_RE,
  ]) {
    re.lastIndex = 0;
    let match = re.exec(stripped);
    while (match !== null) {
      specifiers.add(match[2]);
      match = re.exec(stripped);
    }
  }
  return specifiers;
}

function shouldCheckSpecifier(specifier) {
  if (isBuiltin(specifier)) return false;
  if (specifier === 'electron' || specifier.startsWith('electron/')) {
    return false;
  }
  if (ALLOWED_MISSING.has(specifier)) return false;
  // Not statically checkable / not module resolution.
  if (specifier.startsWith('data:')) return false;
  if (specifier.includes('${')) return false;
  return true;
}

function walkSourceFiles(root, relative = '') {
  const results = [];
  const entries = fs.readdirSync(path.join(root, relative), {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const relPath = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIPPED_APP_DIRS.has(relPath)) continue;
      results.push(...walkSourceFiles(root, relPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(relPath);
    }
  }
  return results;
}

// Entry points of the packaged app: the main-process entry from package.json
// plus every preload script (loaded by BrowserWindow, not required by main).
function discoverEntryFiles(asarRoot, manifest) {
  const entries = [];
  if (manifest.main) {
    entries.push(path.join(asarRoot, manifest.main));
  }
  for (const preloadDir of ['dist/preload', 'out/preload']) {
    const absDir = path.join(asarRoot, preloadDir);
    if (!fs.existsSync(absDir)) continue;
    for (const relPath of walkSourceFiles(asarRoot, preloadDir)) {
      entries.push(path.join(asarRoot, relPath));
    }
  }
  return entries;
}

// A resolution only counts if it lands inside the packaged app: the asar
// itself, or its app.asar.unpacked sibling (where asarUnpack places native
// modules). Node's resolver walks ancestor node_modules directories, so on a
// developer machine or CI runner a module MISSING from the asar can still
// resolve from the source checkout sitting above release-builds/ — which
// would mask exactly the packaging bugs this sweep exists to catch.
function isInsideAppPackage(asarRoot, resolvedPath) {
  const unpackedRoot = `${asarRoot}.unpacked`;
  return (
    resolvedPath.startsWith(asarRoot + path.sep) ||
    resolvedPath.startsWith(unpackedRoot + path.sep)
  );
}

// Check one file's specifiers; returns failures and, for the reachability
// walk, the set of in-asar JS files its specifiers resolve to.
function checkFile(asarRoot, absPath) {
  const failures = [];
  const resolvedFiles = [];
  let checkedSpecifiers = 0;
  let source;
  try {
    source = fs.readFileSync(absPath, 'utf8');
  } catch (readError) {
    return {
      failures: [
        {
          file: path.relative(asarRoot, absPath),
          specifier: null,
          message: `unreadable: ${readError.message}`,
        },
      ],
      resolvedFiles,
      checkedSpecifiers,
    };
  }
  const resolver = createRequire(absPath);
  for (const specifier of extractSpecifiers(source)) {
    if (!shouldCheckSpecifier(specifier)) continue;
    checkedSpecifiers += 1;
    try {
      const resolved = resolver.resolve(specifier);
      if (typeof resolved === 'string' && path.isAbsolute(resolved)) {
        if (!isInsideAppPackage(asarRoot, resolved)) {
          failures.push({
            file: path.relative(asarRoot, absPath),
            specifier,
            message: `resolves outside the packaged app (missing from the asar, found at ${resolved})`,
          });
        } else if (SOURCE_EXTENSIONS.has(path.extname(resolved))) {
          resolvedFiles.push(resolved);
        }
      }
    } catch (resolveError) {
      failures.push({
        file: path.relative(asarRoot, absPath),
        specifier,
        message: resolveError.message.split('\n')[0],
      });
    }
  }
  return { failures, resolvedFiles, checkedSpecifiers };
}

function sweep(asarRoot) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(asarRoot, 'package.json'), 'utf8'),
  );

  // Phase 1: walk the static require graph from the entry points. Failures
  // found here are in reachable files — they can break the running app.
  const errors = [];
  const reachable = new Set();
  let checkedSpecifiers = 0;
  const queue = discoverEntryFiles(asarRoot, manifest);
  while (queue.length > 0) {
    const absPath = queue.shift();
    if (reachable.has(absPath)) continue;
    reachable.add(absPath);
    const result = checkFile(asarRoot, absPath);
    errors.push(...result.failures);
    checkedSpecifiers += result.checkedSpecifiers;
    queue.push(...result.resolvedFiles);
  }

  // Phase 2: check every remaining JS file in the asar. Failures here are in
  // files nothing statically requires — report as warnings only.
  const warnings = [];
  const allFiles = walkSourceFiles(asarRoot);
  for (const relPath of allFiles) {
    const absPath = path.join(asarRoot, relPath);
    if (reachable.has(absPath)) continue;
    const result = checkFile(asarRoot, absPath);
    warnings.push(...result.failures);
    checkedSpecifiers += result.checkedSpecifiers;
  }

  return {
    name: manifest.name,
    version: manifest.version,
    entryFiles: discoverEntryFiles(asarRoot, manifest).map((f) =>
      path.relative(asarRoot, f),
    ),
    reachableFiles: reachable.size,
    scannedFiles: allFiles.length,
    checkedSpecifiers,
    errors,
    warnings,
  };
}

if (require.main === module) {
  const asarPath = process.argv[2];
  if (!asarPath) {
    process.stderr.write('usage: verify-packaged-app-sweep.cjs <app.asar>\n');
    process.exit(2);
  }
  const report = sweep(asarPath);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.errors.length === 0 ? 0 : 1);
}

module.exports = {
  extractSpecifiers,
  isInsideAppPackage,
  shouldCheckSpecifier,
  stripCommentLines,
};
