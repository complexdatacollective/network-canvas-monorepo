import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  changeFingerprint,
  changedFiles,
  classifyGateCommand,
  extractEditedFiles,
  packagesForFiles,
  parseApplyPatchPaths,
  parseApplyPatchResponse,
  stripEmbeddedText,
  parseTypecheckOutput,
  resolveRepoRoot,
} from './agent-hooks/lib.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

test('extracts the edited path from Claude Code Edit/Write/MultiEdit/NotebookEdit events', () => {
  const root = '/repo';
  assert.deepEqual(
    extractEditedFiles(
      {
        tool_name: 'Edit',
        tool_input: {
          file_path: '/repo/a.ts',
          old_string: 'x',
          new_string: 'y',
        },
      },
      root,
    ),
    ['/repo/a.ts'],
  );
  assert.deepEqual(
    extractEditedFiles(
      { tool_name: 'Write', tool_input: { file_path: 'b/c.tsx', content: '' } },
      root,
    ),
    ['/repo/b/c.tsx'],
  );
  assert.deepEqual(
    extractEditedFiles(
      {
        tool_name: 'MultiEdit',
        tool_input: {
          file_path: '/repo/m.ts',
          edits: [{ old_string: 'a', new_string: 'b' }],
        },
      },
      root,
    ),
    ['/repo/m.ts'],
  );
  assert.deepEqual(
    extractEditedFiles(
      {
        tool_name: 'NotebookEdit',
        tool_input: { notebook_path: '/repo/n.ipynb' },
      },
      root,
    ),
    ['/repo/n.ipynb'],
  );
  assert.deepEqual(
    extractEditedFiles(
      { tool_name: 'Bash', tool_input: { command: 'ls' } },
      root,
    ),
    [],
  );
  assert.deepEqual(extractEditedFiles({}, root), []);
});

test('extracts every touched path from a Codex apply_patch call', () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: packages/interview/src/Shell.tsx',
    '@@',
    '-a',
    '+b',
    '*** Add File: apps/architect/src/new.ts',
    '+export {};',
    '*** Delete File: apps/architect/src/old.ts',
    '*** Update File: apps/architect/src/moved.ts',
    '*** Move to: apps/architect/src/renamed.ts',
    '*** End Patch',
  ].join('\n');
  assert.deepEqual(parseApplyPatchPaths(patch), [
    'packages/interview/src/Shell.tsx',
    'apps/architect/src/new.ts',
    'apps/architect/src/moved.ts',
    'apps/architect/src/renamed.ts',
  ]);
  const files = extractEditedFiles(
    { tool_name: 'apply_patch', tool_input: { patch } },
    '/repo',
  );
  assert.ok(files.includes('/repo/packages/interview/src/Shell.tsx'));
  assert.ok(files.includes('/repo/apps/architect/src/renamed.ts'));
  assert.ok(!files.includes('/repo/apps/architect/src/old.ts'));
});

test('reads the A/M/D file list from a Codex apply_patch response', () => {
  const response = [
    'Exit code: 0',
    'Wall time: 0.1 seconds',
    'Output:',
    'Success. Updated the following files:',
    'A apps/architect/src/new.ts',
    'M packages/interview/src/Shell.tsx',
    'D apps/architect/src/old.ts',
  ].join('\n');
  assert.deepEqual(parseApplyPatchResponse(response), [
    'apps/architect/src/new.ts',
    'packages/interview/src/Shell.tsx',
  ]);
  const files = extractEditedFiles(
    {
      tool_name: 'apply_patch',
      tool_input: { command: '*** Begin Patch\n*** End Patch' },
      tool_response: response,
    },
    '/repo',
  );
  assert.deepEqual(files, [
    '/repo/apps/architect/src/new.ts',
    '/repo/packages/interview/src/Shell.tsx',
  ]);
});

test('heredoc bodies and patch blocks are not treated as commands', () => {
  const heredoc =
    "cat > docs/notes.md <<'EOF'\nRun this before committing:\npnpm lint\npnpm typecheck\nEOF\ngit add docs/notes.md";
  assert.equal(
    stripEmbeddedText(heredoc),
    "cat > docs/notes.md <<'EOF'\ngit add docs/notes.md",
  );
  assert.equal(classifyGateCommand(heredoc), null);
  const patch =
    'apply_patch <<EOF\n*** Begin Patch\n*** Update File: README.md\n+pnpm knip\n*** End Patch\nEOF';
  assert.equal(classifyGateCommand(patch), null);
  assert.equal(
    classifyGateCommand("cat <<'EOF' > x.sh\necho hi\nEOF\npnpm lint")?.kind,
    'whole-tree-gate',
    'the command after the heredoc is still classified',
  );
});

test('maps changed files to workspace packages with a typecheck script', () => {
  const manifests = {
    '/repo/packages/interview/package.json': {
      name: '@codaco/interview',
      scripts: { typecheck: 'tsc --build --noEmit' },
    },
    '/repo/workers/posthog-proxy/package.json': {
      name: 'posthog-proxy',
      scripts: { build: 'wrangler' },
    },
  };
  const readPackage = (manifestPath) => manifests[manifestPath] ?? null;
  const result = packagesForFiles(
    [
      '/repo/packages/interview/src/deep/nested/File.tsx',
      '/repo/packages/interview/README.md',
      '/repo/workers/posthog-proxy/src/index.ts',
      '/repo/docs/guide.md',
    ],
    '/repo',
    { readPackage },
  );
  assert.deepEqual(result, { packages: ['@codaco/interview'], all: false });
});

test('the script option selects packages by a different manifest script', () => {
  const manifests = {
    '/repo/packages/a/package.json': {
      name: 'a',
      scripts: { typecheck: 'tsc', test: 'vitest run' },
    },
    '/repo/packages/b/package.json': {
      name: 'b',
      scripts: { typecheck: 'tsc' },
    },
    '/repo/packages/c/package.json': {
      name: 'c',
      scripts: { test: 'vitest run' },
    },
  };
  const readPackage = (manifestPath) => manifests[manifestPath] ?? null;
  const files = [
    '/repo/packages/a/src/x.ts',
    '/repo/packages/b/src/y.ts',
    '/repo/packages/c/src/z.ts',
  ];
  assert.deepEqual(packagesForFiles(files, '/repo', { readPackage }).packages, [
    'a',
    'b',
  ]);
  assert.deepEqual(
    packagesForFiles(files, '/repo', { readPackage, script: 'test' }).packages,
    ['a', 'c'],
  );
});

test('a change to shared TypeScript configuration selects every package', () => {
  const readPackage = () => null;
  for (const file of [
    '/repo/tooling/typescript/base.json',
    '/repo/pnpm-lock.yaml',
    '/repo/package.json',
    '/repo/turbo.json',
  ]) {
    assert.equal(
      packagesForFiles([file], '/repo', { readPackage }).all,
      true,
      file,
    );
  }
  assert.equal(
    packagesForFiles(['/repo/apps/x/package.json'], '/repo', { readPackage })
      .all,
    false,
  );
});

test('maps real repository paths through the workspace manifests', () => {
  const result = packagesForFiles(
    [
      path.join(repoRoot, 'packages/interview/src/Shell.tsx'),
      path.join(repoRoot, 'apps/studio/server/src/index.ts'),
      path.join(repoRoot, 'apps/interviewer-classic/src/index.js'),
    ],
    repoRoot,
  );
  assert.deepEqual(result.packages, [
    '@codaco/interview',
    '@codaco/studio-server',
  ]);
});

test('parses turbo typecheck stream output into per-package errors', () => {
  const output = [
    '• turbo 2.10.4',
    '@codaco/shared-consts:typecheck: cache miss, executing 469524a20b94585c',
    '@codaco/shared-consts:typecheck: $ tsc --build --noEmit',
    "@codaco/shared-consts:typecheck: src/probe.ts(2,14): error TS2322: Type 'string' is not assignable to type 'number'.",
    "@codaco/shared-consts:typecheck: src/probe.ts(2,14): error TS2322: Type 'string' is not assignable to type 'number'.",
    '@codaco/shared-consts:typecheck: [ELIFECYCLE] Command failed with exit code 1.',
    ' Tasks:    0 successful, 1 total',
    'Failed:    @codaco/shared-consts#typecheck',
  ].join('\n');
  assert.deepEqual(parseTypecheckOutput(output), {
    errors: [
      "@codaco/shared-consts: src/probe.ts(2,14): error TS2322: Type 'string' is not assignable to type 'number'.",
    ],
    failed: ['Failed:    @codaco/shared-consts#typecheck'],
  });
});

test('refuses whole-tree gate commands and --no-verify, allows scoped runs', () => {
  const refused = [
    'pnpm lint',
    'pnpm run lint',
    'pnpm lint:fix',
    'pnpm typecheck',
    'pnpm run typecheck',
    'pnpm knip',
    'pnpm format',
    'pnpm format:check',
    'pnpm -r typecheck',
    'cd /repo && pnpm lint 2>&1 | tail -20',
    'pnpm exec turbo run typecheck',
    'npx turbo run //#lint',
    'pnpm exec oxlint',
    'oxlint --quiet',
    'oxfmt --check .',
    'node_modules/.bin/oxfmt .',
    'pnpm exec knip',
    'SKIP_ENV_VALIDATION=true knip --no-progress',
    'pnpm install && pnpm typecheck',
    'git commit -m "x" --no-verify',
    'git commit --no-verify -am "x"',
    'git add -A && git commit -n -m "x"',
  ];
  for (const command of refused) {
    assert.ok(classifyGateCommand(command), `should refuse: ${command}`);
  }
  assert.equal(
    classifyGateCommand('git commit -m "x" --no-verify').kind,
    'no-verify',
  );
  assert.equal(classifyGateCommand('pnpm lint').kind, 'whole-tree-gate');

  const allowed = [
    'pnpm --filter @codaco/architect typecheck',
    'pnpm -F @codaco/interview typecheck',
    'pnpm exec turbo run typecheck --filter=...@codaco/interview',
    'pnpm exec turbo run typecheck --affected',
    'oxlint --fix packages/interview/src/Shell.tsx',
    'oxfmt --check apps/architect/src/App.tsx',
    'pnpm exec oxlint --format=agent scripts/agent-hooks/lib.mjs',
    'pnpm test',
    'pnpm --filter @codaco/interview test',
    'pnpm agent:check',
    'git commit -m "x"',
    'git commit -am "x"',
    'git commit --amend --no-edit',
    'pnpm lint-staged',
    'AGENT_GATES=1 pnpm lint',
    'AGENT_GATES=1 git commit --no-verify -m "x"',
    'ls -la && cat package.json',
    'grep -rn "pnpm lint" docs',
  ];
  for (const command of allowed) {
    assert.equal(
      classifyGateCommand(command),
      null,
      `should allow: ${command}`,
    );
  }
});

test('the change fingerprint is stable until a changed file or the commit moves', () => {
  const files = ['/repo/a.ts', '/repo/b.ts'];
  const stats = { '/repo/a.ts': '10:1', '/repo/b.ts': '20:2' };
  const options = { head: 'abc', stat: (file) => stats[file] };
  const first = changeFingerprint('/repo', files, options);
  assert.equal(changeFingerprint('/repo', files, options), first);
  assert.notEqual(
    changeFingerprint('/repo', files, { ...options, head: 'def' }),
    first,
  );
  assert.notEqual(
    changeFingerprint('/repo', files, {
      ...options,
      stat: (file) => (file === '/repo/b.ts' ? '21:3' : stats[file]),
    }),
    first,
  );
  assert.notEqual(changeFingerprint('/repo', ['/repo/a.ts'], options), first);
});

test('resolves the repository root from the hook environment or cwd', () => {
  assert.equal(resolveRepoRoot({}, { CLAUDE_PROJECT_DIR: repoRoot }), repoRoot);
  assert.equal(
    resolveRepoRoot({ cwd: path.join(repoRoot, 'packages') }, {}),
    repoRoot,
  );
});

test('changedFiles returns absolute paths inside the repository', () => {
  for (const file of changedFiles(repoRoot)) {
    assert.ok(path.isAbsolute(file));
    assert.ok(file.startsWith(repoRoot + path.sep), file);
  }
});
