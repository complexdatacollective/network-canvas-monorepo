#!/usr/bin/env node
// CI guard: reduced motion is decided in one place.
//
// `AnimationProvider` (packages/fresco-ui/src/AnimationProvider.tsx) owns the
// decision. It follows the operating system's `prefers-reduced-motion` unless a
// host sets `reducedMotion="always"` or `"never"`, and it publishes the answer
// three ways: React context (`usePrefersReducedMotion`), and a
// `data-reduced-motion` attribute on the document root that code outside React
// (`prefersReducedMotion`) and CSS read. Anything that asks the operating
// system directly ignores an override, which is how a Storybook control or a
// host setting ends up reducing some motion and not the rest.
//
// The oxlint `no-restricted-imports` rule bans Motion's `useReducedMotion`.
// This guard covers what an import rule cannot see: the media query itself, in
// a `matchMedia` call, a CSS file, an inline `<style>` or an HTML boot screen.
//
// A `prefers-reduced-motion` media query passes when its block keys off
// `data-reduced-motion`, i.e. it is written as the system fallback that defers
// to an override. Any other mention in code fails, except in the files listed
// in ALLOWED with the reason they are exempt.
//
// SCOPE, stated plainly: comments are stripped before matching, test files are
// skipped (they emulate the system preference on purpose), and the check does
// not prove that a media block's `data-reduced-motion` selector is the right
// one, only that the block defers to the attribute at all. The classic apps are
// out of scope: they have no AnimationProvider.
//
// Repository-wide rather than a package test for the same reason as
// check-hydration-flag.mjs: turbo selects a package's tests by that package's
// inputs, so a guard inside fresco-ui would not run for an app.
//
// Usage: node scripts/buildtime/check-reduced-motion.mjs   (from anywhere inside the repo)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUERY = 'prefers-reduced-motion';
const ATTRIBUTE = 'data-reduced-motion';
const CANONICAL = 'packages/fresco-ui/src/reducedMotion.ts';

const ALLOWED = new Map([
  [
    CANONICAL,
    'the resolution itself: its fallback when no provider overrides the system',
  ],
  [
    'apps/networkcanvas.com/app/[locale]/layout.tsx',
    'its entrance-motion head script runs before React, so before any AnimationProvider exists',
  ],
]);

const repoRoot = (cwd) =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();

/**
 * Block, line and HTML comments go before matching, so prose that discusses the
 * query is not an offender. Comments are blanked rather than removed, keeping
 * their line breaks, so the line numbers reported afterwards are the file's
 * own. `//` counts as a comment only where it does not follow a `:` or a quote,
 * so a URL inside a string cannot truncate the code after it.
 */
const blank = (comment) => comment.replace(/[^\n]/g, ' ');
const stripComments = (text) =>
  text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** The text of the `{ … }` block that opens at or after `from`, or null. */
const blockAfter = (source, from) => {
  const open = source.indexOf('{', from);
  if (open === -1) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return null;
};

/**
 * Each mention of the query that does not defer to the provider's attribute,
 * as a 1-based line number.
 */
export const directReads = (rawSource) => {
  const source = stripComments(rawSource);
  const lines = [];

  for (
    let found = source.indexOf(QUERY);
    found !== -1;
    found = source.indexOf(QUERY, found + QUERY.length)
  ) {
    const media = source.lastIndexOf('@media', found);
    const isMediaQuery =
      media !== -1 && !/[{};]/.test(source.slice(media, found));
    if (isMediaQuery && blockAfter(source, found)?.includes(ATTRIBUTE)) {
      continue;
    }
    lines.push(source.slice(0, found).split('\n').length);
  }

  return lines;
};

const isTestFile = (file) =>
  /(^|\/)(__tests__|__mocks__|e2e)\//.test(file) ||
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);

const main = () => {
  // Discovered from the working directory, not from this file's location, so
  // the guard's own tests can point it at a throwaway fixture repository.
  const root = repoRoot(process.cwd());

  const tracked = execFileSync(
    'git',
    [
      'ls-files',
      '--',
      ...['apps', 'packages', 'tooling'].flatMap((area) =>
        ['ts', 'tsx', 'js', 'jsx', 'mjs', 'css', 'html'].map(
          (extension) => `${area}/*.${extension}`,
        ),
      ),
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
    .split('\n')
    .filter(Boolean)
    .filter(
      (file) =>
        !file.includes('/node_modules/') &&
        !file.includes('/dist/') &&
        !/^apps\/[^/]*-classic\//.test(file) &&
        !isTestFile(file),
    );

  const offenders = [];
  let canonicalMatched = false;

  for (const file of tracked) {
    const source = readFileSync(join(root, file), 'utf8');
    if (!source.includes(QUERY)) continue;
    const lines = directReads(source);
    if (lines.length === 0) continue;

    if (file === CANONICAL) canonicalMatched = true;
    if (ALLOWED.has(file)) continue;
    offenders.push(...lines.map((line) => `${file}:${line}`));
  }

  const problems = [];
  if (offenders.length > 0) {
    problems.push(
      'Reads of the operating system’s reduced-motion preference that bypass AnimationProvider:\n  ' +
        offenders.join('\n  ') +
        '\n\nIn React, use `usePrefersReducedMotion` from ' +
        "'@codaco/fresco-ui/reducedMotion'; outside React, its `prefersReducedMotion(node)`. " +
        'In Tailwind classes, `motion-reduce:` / `motion-safe:` already follow the provider. ' +
        'In plain CSS, pair the media query with the provider’s attribute, as ' +
        'tooling/tailwind/fresco/reduced-motion.css does:\n' +
        "  :root[data-reduced-motion='always'] .x { … }\n" +
        "  @media (prefers-reduced-motion: reduce) { :root:not([data-reduced-motion='never']) .x { … } }",
    );
  }
  if (!canonicalMatched) {
    // Non-vacuity: the canonical module is known to read the system preference
    // directly. Not finding it means the matcher stopped reading what it should.
    problems.push(
      `No direct read was detected in ${CANONICAL}; the matcher is not reading what it should.`,
    );
  }

  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    process.exit(1);
  }

  console.log(
    `Reduced-motion check passed: ${tracked.length} tracked source files scanned; ` +
      `every direct read is in ${[...ALLOWED.keys()].join(' or ')}.`,
  );
};

// Importable for the test; only runs the scan when executed directly.
if (
  resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
