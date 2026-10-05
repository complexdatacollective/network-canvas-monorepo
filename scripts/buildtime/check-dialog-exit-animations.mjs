#!/usr/bin/env node
// CI guard: a dialog is closed by its `open` prop, never by being unmounted.
//
// `Dialog` renders `Modal`, and the exit animation is run by an
// `AnimatePresence` INSIDE `Modal` (packages/fresco-ui/src/Modal/index.tsx).
// So an exit only happens if the surface is still mounted when `open` turns
// false. A caller that renders it conditionally —
//
//   {session !== null && <Dialog open …>}      // closing sets session to null
//   if (!currentEvent) return null; … <Dialog open …>
//   if (!open) return null; … <Dialog open …>
//
// — unmounts the `AnimatePresence` along with the thing it was animating, so
// the dialog does not close: it vanishes. By September 2026 ten of the
// repository's dialogs did this, in five packages and by five different
// authors, including one that accepted an `open` prop and then threw it away
// with an early return. Nothing is wrong with any single one of them; they all
// read perfectly naturally, which is the problem.
//
// What they share is the SPELLING, and that is what this guard matches: a
// literal-true `open` on the surface (`open`, or `open={true}`). A dialog
// whose open state is a real expression cannot have the defect, because the
// component stays mounted to receive `open={false}`.
//
// Two things exist for the cases that made callers reach for a mount guard:
// `useDialogSession` holds the opening — the row being edited, the type being
// created — across the close, and `ResetFormWhenClosed` empties a form the
// dialog holds, for the callers that were unmounting it to clear it.
//
// Do NOT reach for a `key` on whatever wraps the dialog instead. Remounting
// that remounts the dialog inside it, and a dialog remounted mid-exit leaves
// its portal behind: measured on the interviewer's passphrase dialog, the
// field stayed in the document with its contents, for good.
//
// SCOPE, stated plainly so the next reader does not over-trust this:
//
//  - It cannot see through a spread (`<Dialog {...dialogProps} />`). A caller
//    that hides a literal `open: true` in an object is not caught.
//  - It says nothing about WHERE the surface is mounted. A dialog correctly
//    passing `open={x}` can still be inside a conditional that unmounts it
//    first; that is a real defect this guard does not find.
//  - Tests and stories are skipped. Rendering a permanently open dialog to
//    inspect it is the point there, and none of them close one.
//
// A runtime check was considered and rejected: "unmounted while open" cannot
// be told apart from ordinary teardown, so React Testing Library's cleanup
// would fire it after most of the existing dialog tests.
//
// Usage: node scripts/buildtime/check-dialog-exit-animations.mjs   (from anywhere inside the repo)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The surfaces whose exit animation lives inside them. */
const SURFACES = ['Dialog', 'Modal', 'ModalPopup'];

/**
 * Surfaces that are MEANT to be permanently open, with the reason.
 *
 * These double as the guard's non-vacuity fixtures: they are known to have the
 * shape, so finding nothing in them means the matcher has stopped reading what
 * it should and a clean report would be meaningless.
 */
const PERMANENTLY_OPEN = new Map([
  [
    'apps/architect/src/components/Errors/AppErrorBoundary.tsx',
    'The app has crashed; this dialog is the whole screen and never closes.',
  ],
  [
    'apps/interviewer/src/components/AppErrorBoundary.tsx',
    'The app has crashed; this dialog is the whole screen and never closes.',
  ],
]);

const repoRoot = (cwd) =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();

/**
 * Comments go before matching, so a file that merely discusses the shape in
 * prose — this script's own header, for one — is not an offender. `//` is only
 * treated as a comment where it does not follow a `:` or a quote, so a URL
 * inside a string cannot truncate the code after it.
 */
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * The index just past the balanced closing delimiter opened at `start`.
 * Quotes and template literals are skipped whole, so a brace inside a string
 * cannot unbalance the scan.
 */
const balancedEnd = (source, start) => {
  const closing = { '{': '}', '(': ')', '[': ']' };
  const stack = [closing[source[start]]];
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === '`') {
      index += 1;
      while (index < source.length && source[index] !== char) {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      continue;
    }
    if (closing[char]) {
      stack.push(closing[char]);
      continue;
    }
    if (char === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return index + 1;
    }
  }
  return -1;
};

/**
 * Whether the JSX opening tag starting at `from` carries a literal-true
 * `open`. Attribute values are stepped over whole, so an `open` appearing
 * inside one (`onClick={() => setOpen(true)}`) is never read as the attribute.
 */
const hasLiteralTrueOpen = (source, from) => {
  let index = from;
  while (index < source.length) {
    const char = source[index];

    if (char === '>' || (char === '/' && source[index + 1] === '>')) {
      return false;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    // A spread: stepped over, and unreadable by this guard. See SCOPE.
    if (char === '{') {
      const end = balancedEnd(source, index);
      if (end === -1) return false;
      index = end;
      continue;
    }

    const name = /^[A-Za-z_$][\w$:.-]*/.exec(source.slice(index));
    if (!name) return false;
    index += name[0].length;

    while (index < source.length && /\s/.test(source[index])) index += 1;
    if (source[index] !== '=') {
      // A boolean attribute, which is `true`.
      if (name[0] === 'open') return true;
      continue;
    }

    index += 1;
    while (index < source.length && /\s/.test(source[index])) index += 1;
    const value = source[index];
    if (value === '{') {
      const end = balancedEnd(source, index);
      if (end === -1) return false;
      if (
        name[0] === 'open' &&
        source.slice(index + 1, end - 1).trim() === 'true'
      ) {
        return true;
      }
      index = end;
      continue;
    }
    if (value === '"' || value === "'") {
      const end = source.indexOf(value, index + 1);
      if (end === -1) return false;
      index = end + 1;
      continue;
    }
    return false;
  }
  return false;
};

/** Every surface in this source rendered with a literal-true `open`. */
export const literalOpenSurfaces = (rawSource) => {
  const source = stripComments(rawSource);
  const found = [];

  for (const surface of SURFACES) {
    const pattern = new RegExp(`<${surface}(?=[\\s/>])`, 'g');
    for (const match of source.matchAll(pattern)) {
      const from = match.index + surface.length + 1;
      if (hasLiteralTrueOpen(source, from)) found.push(surface);
    }
  }

  return found;
};

const isTestOrStory = (file) =>
  /\.(test|spec|stories)\.tsx?$/.test(file) ||
  file.includes('/__tests__/') ||
  file.includes('/storybook-support/');

const main = () => {
  // Discovered from the working directory, not from this file's location, so
  // the scan covers the repository the guard was invoked in — and so the
  // guard's own tests can build a throwaway fixture repository and get an
  // answer about THAT tree rather than about this one.
  const root = repoRoot(process.cwd());

  const tracked = execFileSync(
    'git',
    ['ls-files', '--', 'apps/*.tsx', 'packages/*.tsx'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  )
    .split('\n')
    .filter(Boolean)
    .filter(
      (file) => !file.includes('/node_modules/') && !file.includes('/dist/'),
    )
    .filter((file) => !isTestOrStory(file));

  const offenders = [];
  const allowedMatched = new Set();

  for (const file of tracked) {
    let source;
    try {
      source = readFileSync(join(root, file), 'utf8');
    } catch (error) {
      throw new Error(`could not read ${file}: ${error.message}`, {
        cause: error,
      });
    }
    if (!SURFACES.some((surface) => source.includes(`<${surface}`))) continue;

    const surfaces = literalOpenSurfaces(source);
    if (surfaces.length === 0) continue;

    if (PERMANENTLY_OPEN.has(file)) allowedMatched.add(file);
    else offenders.push(`${file}  (<${surfaces.join('>, <')}>)`);
  }

  const problems = [];
  if (offenders.length > 0) {
    problems.push(
      'Dialogs that cannot animate out, because `open` is hard-coded true:\n  ' +
        offenders.join('\n  ') +
        '\n\nThe exit animation is run by the `AnimatePresence` inside `Modal`, so a ' +
        'surface has to STAY MOUNTED and receive `open={false}` to close. Pass the ' +
        'open state as `open={…}` instead of unmounting the surface.\n\n' +
        '  - Content that comes from the opening (the row being edited, the type being\n' +
        '    created) is held across the close by `useDialogSession`\n' +
        '    (@codaco/fresco-ui/dialogs/useDialogSession).\n' +
        '  - A form the dialog holds is emptied by `ResetFormWhenClosed`\n' +
        '    (@codaco/fresco-ui/form/ResetFormWhenClosed), for a caller that was\n' +
        '    unmounting the dialog to clear it.\n\n' +
        'A surface that genuinely never closes belongs in PERMANENTLY_OPEN in this ' +
        'script, with the reason it never closes.',
    );
  }

  const unmatched = [...PERMANENTLY_OPEN.keys()].filter(
    (file) => !allowedMatched.has(file),
  );
  if (unmatched.length > 0) {
    // Non-vacuity: these files are known to have the shape. Finding it in none
    // of them means the matcher is not reading what it should, and a clean
    // report would be meaningless.
    problems.push(
      'The shape was not detected in files known to have it:\n  ' +
        unmatched.join('\n  ') +
        '\n\nEither the matcher has stopped recognising a literal-true `open`, or these ' +
        'surfaces changed and PERMANENTLY_OPEN is stale.',
    );
  }

  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    process.exit(1);
  }

  console.log(
    `Dialog exit check passed: ${tracked.length} tracked source files scanned; ` +
      `the only permanently open surfaces are the ${PERMANENTLY_OPEN.size} crash screens.`,
  );
};

// Importable for the test; only runs the scan when executed directly.
if (
  resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
