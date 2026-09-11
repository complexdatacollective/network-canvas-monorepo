#!/usr/bin/env node
// CI guard: "are we past hydration?" has exactly one implementation.
//
// The shape is `useSyncExternalStore` with a constant `true` client snapshot
// and a constant `false` server snapshot. It is three lines, it looks trivial,
// and by September 2026 the repository held eight independent copies of it —
// six in networkcanvas.com alone, plus one inlined in fresco-ui's
// NoSSRWrapper. Nothing was wrong with any single copy; the cost is that a
// correction to the shape (or a migration off it, when React ships something
// better) has to find all eight, and the ninth author copies whichever one they
// happen to open.
//
// The single implementation is `useHasHydrated` in
// packages/fresco-ui/src/hooks/useHasHydrated.ts, published as
// `@codaco/fresco-ui/hooks/useHasHydrated`. Both apps that need it already
// depend on the package.
//
// SCOPE, stated plainly so the next reader does not over-trust this: it catches
// the `useSyncExternalStore` constant-snapshot shape and nothing else. It does
// NOT catch the older `useState(false)` + `useEffect(() => setMounted(true), [])`
// mount-flag idiom, because `useState(false)` with a mount effect is a
// perfectly ordinary thing to write for reasons that have nothing to do with
// hydration, and a matcher loose enough to find the hydration ones would flag
// those too. `react(set-state-in-effect)` is the lint rule that surfaces that
// idiom; this guard covers what a lint rule cannot see.
//
// This is a repository-wide check rather than a package test on purpose, for
// the same reason as check-mapbox-tokens.mjs: turbo selects a package's tests
// by that package's declared inputs, so a guard living inside fresco-ui would
// not run for a copy added to an app, and a full run could reuse an earlier
// green.
//
// Usage: node scripts/build/check-hydration-flag.mjs   (from anywhere inside the repo)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CANONICAL = 'packages/fresco-ui/src/hooks/useHasHydrated.ts';
const IMPORT_PATH = '@codaco/fresco-ui/hooks/useHasHydrated';

const repoRoot = (cwd) =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();

/**
 * Block comments and line comments go before matching, so a file that merely
 * discusses the shape in prose — this script's own header, for one — is not an
 * offender. `//` is only treated as a comment where it does not follow a `:` or
 * a quote, so a URL inside a string cannot truncate the code after it.
 */
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * `const NAME = () => true;` and friends, so an argument passed by name
 * resolves the same as one written inline. Only literal `true`/`false` bodies
 * are recorded; anything with real work in it is not this shape.
 */
const constantArrows = (source) => {
  const bindings = new Map();
  const pattern =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*\)\s*=>\s*(true|false)\s*[;\n]/g;
  for (const [, name, value] of source.matchAll(pattern)) {
    bindings.set(name, value === 'true');
  }
  return bindings;
};

/** The comma-separated top-level arguments of the call starting at `open`. */
const callArguments = (source, open) => {
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) {
        args.push(source.slice(start, index));
        return args;
      }
    } else if (char === ',' && depth === 1) {
      args.push(source.slice(start, index));
      start = index + 1;
    }
  }
  return null;
};

/** `true`, `false`, or null when the argument is not a constant snapshot. */
const resolveConstant = (argument, bindings) => {
  const text = argument.trim();
  const inline = /^\(\s*\)\s*=>\s*(true|false)$/.exec(text);
  if (inline) return inline[1] === 'true';
  return bindings.get(text) ?? null;
};

/**
 * True when the file calls `useSyncExternalStore` with a constant `true`
 * client snapshot and a constant `false` server snapshot — the hydration flag.
 */
export const hasHydrationFlagShape = (rawSource) => {
  const source = stripComments(rawSource);
  const bindings = constantArrows(source);

  let searchFrom = 0;
  for (;;) {
    const found = source.indexOf('useSyncExternalStore', searchFrom);
    if (found === -1) return false;
    searchFrom = found + 1;

    const open = source.indexOf('(', found + 'useSyncExternalStore'.length);
    if (open === -1) continue;
    // Anything but whitespace between the name and its parenthesis means this
    // is not the call (an import specifier, a property access, prose).
    if (
      source.slice(found + 'useSyncExternalStore'.length, open).trim() !== ''
    ) {
      continue;
    }

    const args = callArguments(source, open);
    if (!args || args.length < 3) continue;
    if (
      resolveConstant(args[1], bindings) === true &&
      resolveConstant(args[2], bindings) === false
    ) {
      return true;
    }
  }
};

const main = () => {
  // Discovered from the working directory, not from this file's location, so
  // the scan covers the repository the guard was invoked in. Resolving it from
  // `import.meta.url` would make every run scan this repository, including the
  // throwaway fixtures the guard's own tests build — which would have made
  // those tests agree with whatever this tree happened to contain.
  const root = repoRoot(process.cwd());

  const tracked = execFileSync(
    'git',
    [
      'ls-files',
      '--',
      'apps/*.ts',
      'apps/*.tsx',
      'packages/*.ts',
      'packages/*.tsx',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
    .split('\n')
    .filter(Boolean)
    .filter(
      (file) => !file.includes('/node_modules/') && !file.includes('/dist/'),
    );

  const offenders = [];
  let canonicalMatched = false;

  for (const file of tracked) {
    let source;
    try {
      source = readFileSync(join(root, file), 'utf8');
    } catch (error) {
      throw new Error(`could not read ${file}: ${error.message}`, {
        cause: error,
      });
    }
    if (!source.includes('useSyncExternalStore')) continue;
    if (!hasHydrationFlagShape(source)) continue;

    if (file === CANONICAL) canonicalMatched = true;
    else offenders.push(file);
  }

  const problems = [];
  if (offenders.length > 0) {
    problems.push(
      'Hand-rolled hydration flags (useSyncExternalStore with constant true/false snapshots):\n  ' +
        offenders.join('\n  ') +
        `\n\nUse the shared hook instead:\n  import useHasHydrated from '${IMPORT_PATH}';\n\n` +
        `It lives in ${CANONICAL} and is covered by its own SSR/hydration test. ` +
        'If a call site genuinely needs different snapshots, it is not this shape ' +
        'and should not read as though it were — give it names that say what it tracks.',
    );
  }
  if (!canonicalMatched) {
    // Non-vacuity: the canonical hook is known to have the shape. Finding it
    // nowhere means the matcher stopped recognising what it is looking for, and
    // a clean report would be meaningless.
    problems.push(
      `The shape was not detected in ${CANONICAL}; the matcher is not reading what it should.`,
    );
  }

  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    process.exit(1);
  }

  console.log(
    `Hydration flag check passed: ${tracked.length} tracked source files scanned; ` +
      `the only constant-snapshot useSyncExternalStore is ${CANONICAL}.`,
  );
};

// Importable for the test; only runs the scan when executed directly.
if (
  resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
