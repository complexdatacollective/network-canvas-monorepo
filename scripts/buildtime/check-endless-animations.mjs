#!/usr/bin/env node
// CI guard: an animation that never ends runs only while its page is in front
// of the user.
//
// A browser stops rendering a page it reports hidden, but renders a visible
// one at full frame rate whether or not its window is focused, so an installed
// Architect or Interviewer left open beside another app used to keep every
// loop running and drain the battery. `@codaco/fresco-ui/pageActivity` decides
// whether the page is in front of the user. `AnimationProvider` uses it to
// pause endless CSS and Web Animations API animations on its own; a loop it
// cannot see — a function that schedules itself with `requestAnimationFrame`,
// whether by name or through a wrapping callback, a Motion transition
// with `repeat: Infinity`, Motion's `useAnimationFrame` — has to consult it.
//
// This guard finds those loops and fails on any file that has one but never
// imports `pageActivity`, except the files listed in ALLOWED with the reason
// they are exempt.
//
// SCOPE, stated plainly: comments are stripped before matching, test files and
// stories are skipped, and a file passes on importing `pageActivity` at all —
// the guard does not prove that every loop in it is gated. It does not see a
// `setInterval` that drives a visual or a `while` loop of awaited Motion
// animations (Architect's home illustration and fresco-ui's `Spinner` are
// both gated by hand). It covers the code Architect,
// Interviewer and Fresco run (`packages/` and those apps); the websites,
// Studio, Sketch and the Background Creator are out of scope, and so are the
// classic apps, which have no AnimationProvider.
//
// Usage: node scripts/buildtime/check-endless-animations.mjs   (from anywhere inside the repo)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Files known to hold each kind of loop. Finding none in them means the
// matcher stopped reading what it should. Fresco's canvas hook schedules
// itself through a wrapping callback rather than by name.
const KNOWN_LOOPS = new Map([
  ['packages/art/src/BackgroundLights/BackgroundLights.tsx', 'frame loop'],
  ['apps/fresco/hooks/useCanvas.ts', 'frame loop'],
  ['packages/fresco-ui/src/NodeDropAnimation.tsx', 'Motion repeat'],
]);

const ALLOWED = new Map([
  [
    'packages/interview/src/interfaces/FamilyPedigree/FamilyPedigree.tsx',
    'its `centre` frame loop retries for at most 30 frames, then stops',
  ],
]);

const AREAS = ['packages', 'apps/architect', 'apps/interviewer', 'apps/fresco'];

const repoRoot = (cwd) =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();

/**
 * Block and line comments go before matching, so prose that discusses a loop
 * is not an offender. Comments are blanked rather than removed, keeping their
 * line breaks, so the line numbers reported afterwards are the file's own. `//`
 * counts as a comment only where it does not follow a `:` or a quote, so a URL
 * inside a string cannot truncate the code after it.
 */
const blank = (comment) => comment.replace(/[^\n]/g, ' ');
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * The index of the `}` closing the body of the definition at `from`, or -1
 * when the definition has no braced body (`const f = () => g();`).
 */
const bodyEnd = (source, from) => {
  const open = source.indexOf('{', from);
  if (open === -1 || source.slice(from, open).includes(';')) return -1;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/** The text between the `(` at `open` and the `)` that closes it. */
const argumentAt = (source, open) => {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return '';
};

/**
 * The functions a frame callback runs: the callback itself when it is passed
 * by name (`requestAnimationFrame(tick)`), otherwise every function the
 * callback calls (`requestAnimationFrame((t) => render(ctx, t))`).
 */
const frameCallees = (argument) => {
  const bare = argument.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(bare)) return [bare];
  return [...argument.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map(
    ([, name]) => name,
  );
};

/** Whether `index` lies inside the body of a definition of `name`. */
const insideDefinitionOf = (source, name, index) => {
  const definition = new RegExp(
    `(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=)`,
    'g',
  );
  for (const found of source.matchAll(definition)) {
    if (found.index < index && index < bodyEnd(source, found.index)) {
      return true;
    }
  }
  return false;
};

/**
 * Each loop with no end, as `{ line, kind }`: a function that schedules itself
 * with `requestAnimationFrame`, by name or from inside a wrapping callback, a
 * Motion `repeat` of `Infinity`, or Motion's `useAnimationFrame`.
 */
export const endlessLoops = (rawSource) => {
  const source = stripComments(rawSource);
  const loops = [];

  for (const call of source.matchAll(/\brequestAnimationFrame\(/g)) {
    const open = call.index + call[0].length - 1;
    const callees = new Set(frameCallees(argumentAt(source, open)));
    if (
      [...callees].some((name) => insideDefinitionOf(source, name, call.index))
    ) {
      loops.push({ line: lineOf(source, call.index), kind: 'frame loop' });
    }
  }

  for (const repeat of source.matchAll(
    /\brepeat:\s*[^,}\n]*\b(?:Infinity|POSITIVE_INFINITY)\b/g,
  )) {
    loops.push({ line: lineOf(source, repeat.index), kind: 'Motion repeat' });
  }

  for (const hook of source.matchAll(/\buseAnimationFrame\(/g)) {
    loops.push({
      line: lineOf(source, hook.index),
      kind: 'Motion useAnimationFrame',
    });
  }

  return loops.toSorted((a, b) => a.line - b.line);
};

/** Whether the file imports the page-activity module. */
export const consultsPageActivity = (source) =>
  /from\s+['"][^'"]*\/pageActivity['"]/.test(source);

const isTestFile = (file) =>
  /(^|\/)(__tests__|__mocks__|e2e)\//.test(file) ||
  /\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(file);

const main = () => {
  // Discovered from the working directory, not from this file's location, so
  // the guard's own tests can point it at a throwaway fixture repository.
  const root = repoRoot(process.cwd());

  const tracked = execFileSync(
    'git',
    [
      'ls-files',
      '--',
      ...AREAS.flatMap((area) =>
        ['ts', 'tsx', 'js', 'jsx', 'mjs'].map(
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
        !isTestFile(file),
    );

  const offenders = [];
  const knownFound = new Set();

  for (const file of tracked) {
    const source = readFileSync(join(root, file), 'utf8');
    const loops = endlessLoops(source);
    if (loops.length === 0) continue;

    if (KNOWN_LOOPS.has(file)) {
      if (loops.some(({ kind }) => kind === KNOWN_LOOPS.get(file))) {
        knownFound.add(file);
      }
    }
    if (ALLOWED.has(file) || consultsPageActivity(source)) continue;
    offenders.push(
      ...loops.map(({ line, kind }) => `${file}:${line} (${kind})`),
    );
  }

  const problems = [];
  if (offenders.length > 0) {
    problems.push(
      'Animation loops that never end and ignore whether the page is in front of the user:\n  ' +
        offenders.join('\n  ') +
        '\n\nIn React, read `usePageActive()` from ' +
        "'@codaco/fresco-ui/pageActivity' and run the loop only while it is true " +
        '(for Motion, animate to a resting value and drop the repeat otherwise). ' +
        'Outside React, start and stop the loop with `isPageActive()` and ' +
        '`subscribeToPageActivity()`. A loop that ends on its own belongs in ' +
        'ALLOWED with its reason.',
    );
  }
  for (const [file, kind] of KNOWN_LOOPS) {
    if (!knownFound.has(file)) {
      problems.push(
        `No ${kind} was detected in ${file}; the matcher is not reading what it should.`,
      );
    }
  }

  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    process.exit(1);
  }

  console.log(
    `Endless-animation check passed: ${tracked.length} tracked source files scanned; ` +
      'every endless loop consults page activity or is allowed.',
  );
};

// Importable for the test; only runs the scan when executed directly.
if (
  resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
