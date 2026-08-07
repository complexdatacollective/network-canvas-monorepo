import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  changedPaths,
  findNulBytes,
  planChangedLint,
  requiresFullLint,
  runLint,
  trackedTextFiles,
} from './lint.mjs';

const exists = () => true;

test('configuration and dependency inputs force a full lint', () => {
  for (const path of [
    '.oxlintrc.json',
    'apps/architect/.oxlintrc.json',
    'apps/architect/.oxfmtrc.json',
    'apps/architect/.oxfmtrc.jsonc',
    'apps/interviewer/oxfmt.config.ts',
    'packages/interview/oxfmt.config.mts',
    'apps/interviewer/tsconfig.app.json',
    'packages/interview/package.json',
    'pnpm-lock.yaml',
    'tooling/oxlint/react.json',
    'tooling/tailwind/fresco/fresco.css',
    '.github/actions/turbo-ci-setup/action.yml',
    '.github/workflows/ci-and-release.yml',
    'scripts/lint.mjs',
  ]) {
    assert.equal(requiresFullLint(path), true, path);
    assert.equal(planChangedLint([path], exists).full, true, path);
  }
});

test('changed files are routed only to the tools that support them', () => {
  assert.deepEqual(
    planChangedLint(
      [
        'apps/architect/src/App.tsx',
        'docs/guide.md',
        '.github/workflows/example.yml',
        'config/netlify.toml',
        'packages/art/image.png',
        'scripts/check.sh',
      ],
      exists,
    ),
    {
      full: false,
      reason: '',
      oxlintFiles: ['apps/architect/src/App.tsx'],
      scanFiles: [
        'apps/architect/src/App.tsx',
        'docs/guide.md',
        '.github/workflows/example.yml',
        'config/netlify.toml',
        'scripts/check.sh',
      ],
      oxfmtFiles: [
        'apps/architect/src/App.tsx',
        'docs/guide.md',
        '.github/workflows/example.yml',
        'config/netlify.toml',
      ],
    },
  );
});

test('deleted files and unsupported files are ignored', () => {
  const plan = planChangedLint(
    ['apps/architect/src/deleted.ts', 'packages/art/image.png'],
    (path) => !path.endsWith('deleted.ts'),
  );
  assert.equal(plan.full, false);
  assert.deepEqual(plan.oxlintFiles, []);
  assert.deepEqual(plan.oxfmtFiles, []);
  assert.deepEqual(plan.scanFiles, []);
});

test('deleted lint configuration and manifests force a full lint', () => {
  for (const path of [
    'apps/architect/.oxlintrc.json',
    'apps/architect/package.json',
    'packages/interview/tsconfig.json',
  ]) {
    const plan = planChangedLint([path], () => false);
    assert.equal(plan.full, true, path);
    assert.match(plan.reason, new RegExp(path.replaceAll('.', '\\.')));
  }
});

test('Git change detection includes deleted files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'network-canvas-lint-test-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    writeFileSync(join(directory, 'package.json'), '{}\n');
    execFileSync('git', ['add', 'package.json'], { cwd: directory });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Lint Test',
        '-c',
        'user.email=lint-test@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'Add manifest',
      ],
      { cwd: directory },
    );
    rmSync(join(directory, 'package.json'));
    execFileSync('git', ['add', '--all'], { cwd: directory });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Lint Test',
        '-c',
        'user.email=lint-test@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'Delete manifest',
      ],
      { cwd: directory },
    );

    assert.deepEqual(changedPaths('HEAD^', 'HEAD', directory), [
      'package.json',
    ]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('changed-file formatting tolerates an explicit set ignored by Oxfmt', async () => {
  const status = await runLint({
    full: false,
    reason: '',
    oxlintFiles: [],
    oxfmtFiles: ['apps/architect-classic/public/dev-app-update.yml'],
  });

  assert.equal(status, 0);
});

test('changed-file linting tolerates an explicit set ignored by Oxlint', async () => {
  const status = await runLint({
    full: false,
    reason: '',
    oxlintFiles: ['packages/interface-images/src/generated/manifest.ts'],
    oxfmtFiles: [],
  });

  assert.equal(status, 0);
});

test('a NUL byte in a source file is reported with its line', () => {
  const nul = String.fromCharCode(0);
  const read = (path) =>
    Buffer.from(
      {
        'clean.ts': "export const sep = '\\u0000';\n",
        'corrupt.ts': `const a = 1;\nconst sep = '${nul}';\n`,
      }[path] ?? '',
      'utf8',
    );

  assert.deepEqual(findNulBytes(['clean.ts', 'corrupt.ts'], read), [
    { path: 'corrupt.ts', line: 2 },
  ]);
});

test('a NUL byte past the window Git sniffs is still reported', () => {
  const nul = String.fromCharCode(0);
  // Past 8000 bytes Git keeps diffing the file as text, so the byte is easy to
  // believe harmless. Ripgrep disagrees: it finds a NUL anywhere and then
  // suppresses every match in the file, so a deep one hides the most code.
  const padding = 'const filler = 1;\n'.repeat(600);
  const read = () => Buffer.from(`${padding}const sep = '${nul}';\n`, 'utf8');

  const [offender] = findNulBytes(['deep.ts'], read);
  assert.equal(offender?.path, 'deep.ts');
  assert.equal(offender?.line, 601);
});

test('an unreadable path is left to the tools that follow', () => {
  const read = () => {
    throw new Error('ENOENT');
  };

  assert.deepEqual(findNulBytes(['gone.ts'], read), []);
});

test('a NUL byte fails the run even when every tool is happy', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lint-nul-'));
  try {
    const path = join(directory, 'corrupt.ts');
    writeFileSync(path, `const sep = '${String.fromCharCode(0)}';\n`);

    // Reported through the formatter's file set, which covers every text
    // extension the repository lints or formats.
    const status = await runLint({
      full: false,
      reason: '',
      oxlintFiles: [],
      oxfmtFiles: [path],
    });

    assert.equal(status, 1);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('a full run scans the tracked text files rather than the whole tree', () => {
  const tracked = trackedTextFiles();

  assert.ok(tracked.includes('scripts/lint.mjs'));
  assert.ok(tracked.every((path) => !path.endsWith('.png')));
  assert.deepEqual(findNulBytes(tracked), []);
});

test('source the formatter does not handle is scanned too', () => {
  // A shell script or an extensionless Dockerfile loses its diff to a NUL
  // exactly as a TypeScript file does, so the scan set cannot be the set of
  // extensions a formatter happens to recognise.
  const plan = planChangedLint(
    ['scripts/setup.sh', 'apps/fresco/Dockerfile', 'packages/art/logo.png'],
    exists,
  );

  assert.deepEqual(plan.oxfmtFiles, []);
  assert.deepEqual(plan.scanFiles, [
    'scripts/setup.sh',
    'apps/fresco/Dockerfile',
  ]);

  const tracked = trackedTextFiles();
  assert.ok(tracked.some((path) => path.endsWith('.sh')));
});

test('the scan does not stop at the window Git inspects', () => {
  // Git decides binary-ness from the leading bytes only, so a deep NUL keeps
  // its diff — but Git is not the only reader. Ripgrep finds one at any offset
  // and answers "binary file matches" for the file as a whole, so the code
  // around it stops being greppable. Bounding the scan to Git's window would
  // wave through precisely that file.
  const read = () =>
    Buffer.concat([Buffer.alloc(9000, 0x61), Buffer.from([0])]);

  assert.deepEqual(findNulBytes(['late.ts'], read), [
    { path: 'late.ts', line: 1 },
  ]);
});
