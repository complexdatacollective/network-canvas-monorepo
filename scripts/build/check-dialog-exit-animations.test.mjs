import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

import { literalOpenSurfaces } from './check-dialog-exit-animations.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const GUARD = join(scriptDir, 'check-dialog-exit-animations.mjs');

/** The two crash screens the guard allows, which are also its own fixtures. */
const CRASH_SCREENS = {
  'apps/architect/src/components/Errors/AppErrorBoundary.tsx':
    "import Dialog from '@codaco/fresco-ui/dialogs/Dialog';\n" +
    'export const AppErrorBoundary = () => <Dialog open title="Crashed" />;\n',
  'apps/interviewer/src/components/AppErrorBoundary.tsx':
    "import Dialog from '@codaco/fresco-ui/dialogs/Dialog';\n" +
    'export const AppErrorBoundary = () => <Dialog open title="Crashed" />;\n',
};

/** A throwaway git repository whose index holds `files`. */
function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'dialog-exit-guard-'));
  execFileSync('git', ['init', '-q'], { cwd });
  for (const [name, body] of Object.entries({ ...CRASH_SCREENS, ...files })) {
    mkdirSync(dirname(join(cwd, name)), { recursive: true });
    writeFileSync(join(cwd, name), body);
  }
  execFileSync('git', ['add', '-A'], { cwd });
  return cwd;
}

const run = (cwd) =>
  spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' });

test('passes when every dialog takes its open state as a prop', () => {
  const result = run(
    fixture({
      'apps/architect/src/components/Thing.tsx':
        "import Dialog from '@codaco/fresco-ui/dialogs/Dialog';\n" +
        'export const Thing = ({ open }) => <Dialog open={open} title="Thing" />;\n',
    }),
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dialog exit check passed/);
});

test('fails on a dialog rendered only while there is something to edit', () => {
  const result = run(
    fixture({
      'packages/protocol-builder/src/Editor.tsx':
        "import Dialog from '@codaco/fresco-ui/dialogs/Dialog';\n" +
        'export const Editor = ({ session }) =>\n' +
        '  session !== null ? <Dialog open title="Edit">{session.name}</Dialog> : null;\n',
    }),
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /packages\/protocol-builder\/src\/Editor\.tsx/);
  assert.match(result.stderr, /useDialogSession/);
});

test('fails on an early return that discards a real open prop', () => {
  const result = run(
    fixture({
      'apps/interviewer/src/Reset.tsx':
        "import Dialog from '@codaco/fresco-ui/dialogs/Dialog';\n" +
        'export const Reset = ({ open }) => {\n' +
        '  if (!open) return null;\n' +
        '  return <Dialog open title="Reset" />;\n' +
        '};\n',
    }),
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps\/interviewer\/src\/Reset\.tsx/);
  assert.match(result.stderr, /ResetFormWhenClosed/);
});

test('fails when the shape is gone from the files known to have it', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'dialog-exit-guard-'));
  execFileSync('git', ['init', '-q'], { cwd });
  mkdirSync(join(cwd, 'apps/architect/src'), { recursive: true });
  writeFileSync(
    join(cwd, 'apps/architect/src/Thing.tsx'),
    'export const Thing = () => null;\n',
  );
  execFileSync('git', ['add', '-A'], { cwd });

  const result = run(cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not reading what it should|stale/);
});

test('reads `open={true}` as the literal it is', () => {
  assert.deepEqual(literalOpenSurfaces('<Dialog open={true} />'), ['Dialog']);
  assert.deepEqual(literalOpenSurfaces('<Modal open />'), ['Modal']);
  assert.deepEqual(literalOpenSurfaces('<Dialog open={isOpen} />'), []);
  assert.deepEqual(literalOpenSurfaces('<Dialog open={open && !busy} />'), []);
});

test('does not read an `open` inside another attribute as the attribute', () => {
  assert.deepEqual(
    literalOpenSurfaces(
      '<Dialog closeDialog={() => setOpen(true)} open={shown} />',
    ),
    [],
  );
  assert.deepEqual(
    literalOpenSurfaces('<Dialog title="open" open={shown} />'),
    [],
  );
});

test('ignores a dialog that only a comment mentions', () => {
  assert.deepEqual(
    literalOpenSurfaces('// <Dialog open /> is the shape this looks for\n'),
    [],
  );
  assert.deepEqual(
    literalOpenSurfaces('/*\n  <Dialog open />\n*/\n'),
    [],
  );
});

test('does not mistake a compound part or a close tag for the surface', () => {
  assert.deepEqual(literalOpenSurfaces('<DialogFooter open />'), []);
  assert.deepEqual(literalOpenSurfaces('<Dialog.Title open />'), []);
  assert.deepEqual(literalOpenSurfaces('</Dialog>'), []);
});

test('cannot see through a spread, and says so in its own scope note', () => {
  // Documented in SCOPE rather than fixed: reading `open: true` out of an
  // object would mean resolving the object, and a guard that resolves half of
  // one is worse than a guard with a stated limit.
  assert.deepEqual(literalOpenSurfaces('<Dialog {...dialogProps} />'), []);
});
