import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  changeFingerprint,
  changedFiles,
  classifyGateCommand,
  extractEditedFiles,
  isKnipRelevant,
  knipCodegenOutputs,
  lintReportFrom,
  knipTargetForPush,
  modifiedSince,
  nodeModulesDirs,
  packagesForFiles,
  parseApplyPatchPaths,
  parseApplyPatchResponse,
  packageForFile,
  parsePorcelainZ,
  parseTypecheckOutput,
  previousPackageNames,
  resolveRepoRoot,
  stripEmbeddedText,
  takeCommandStart,
  updateState,
  workspacePackages,
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
  const isWorkspaceDir = (dir) =>
    /^\/repo\/(packages|workers)\/[^/]+$/.test(dir);
  const result = packagesForFiles(
    [
      '/repo/packages/interview/src/deep/nested/File.tsx',
      '/repo/packages/interview/README.md',
      '/repo/workers/posthog-proxy/src/index.ts',
      '/repo/docs/guide.md',
    ],
    '/repo',
    { readPackage, isWorkspaceDir },
  );
  assert.deepEqual(result, {
    packages: ['@codaco/interview'],
    seeds: ['@codaco/interview', 'posthog-proxy'],
    all: false,
  });
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
  const isWorkspaceDir = (dir) => /^\/repo\/packages\/[^/]+$/.test(dir);
  const files = [
    '/repo/packages/a/src/x.ts',
    '/repo/packages/b/src/y.ts',
    '/repo/packages/c/src/z.ts',
  ];
  assert.deepEqual(
    packagesForFiles(files, '/repo', { readPackage, isWorkspaceDir }).packages,
    ['a', 'b'],
  );
  assert.deepEqual(
    packagesForFiles(files, '/repo', {
      readPackage,
      isWorkspaceDir,
      script: 'test',
    }).packages,
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

test('rename records keep both paths so the source package is still checked', () => {
  const output =
    'R  packages/b/src/new.ts\0packages/a/src/old.ts\0 M apps/x/src/y.ts\0?? notes.md\0';
  assert.deepEqual(parsePorcelainZ(output), [
    'packages/b/src/new.ts',
    'packages/a/src/old.ts',
    'apps/x/src/y.ts',
    'notes.md',
  ]);
});

test('option values are not counted as formatter or linter file targets', () => {
  assert.equal(
    classifyGateCommand('oxlint -c .oxlintrc.json')?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand('oxlint --config .oxlintrc.json --format=agent')?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand('oxfmt --ignore-path .prettierignore --check .')?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand(
      'oxlint -c .oxlintrc.json packages/interview/src/Shell.tsx',
    ),
    null,
  );
  assert.equal(
    classifyGateCommand('oxlint -f agent apps/architect/src/App.tsx'),
    null,
  );
});

test('gate commands run from inside a workspace package are package-scoped', () => {
  const packageDir = (dir) => /\/(apps|packages)\/[^/]+/.test(dir);
  const options = { root: '/repo', packageDir };
  assert.equal(
    classifyGateCommand('cd apps/interviewer && pnpm typecheck', options),
    null,
  );
  assert.equal(
    classifyGateCommand(
      'cd /repo/packages/interview && pnpm test && pnpm typecheck',
      options,
    ),
    null,
  );
  assert.equal(
    classifyGateCommand(
      'cd packages/interview && cd ../.. && pnpm typecheck',
      options,
    )?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand('pnpm typecheck', {
      ...options,
      cwd: '/repo/apps/architect',
    }),
    null,
  );
  assert.equal(
    classifyGateCommand('pnpm typecheck', { ...options, cwd: '/repo' })?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand('cd docs && pnpm lint', options)?.kind,
    'whole-tree-gate',
  );
});

test('knip relevance covers its configuration as well as code and manifests', () => {
  for (const file of [
    'knip.json',
    'apps/fresco/knip.config.ts',
    'packages/x/package.json',
    'packages/x/tsconfig.build.json',
    'src/a.ts',
  ]) {
    assert.equal(isKnipRelevant(file), true, file);
  }
  for (const file of ['README.md', 'docs/spec.md', 'apps/x/public/logo.svg']) {
    assert.equal(isKnipRelevant(file), false, file);
  }
});

test('modifiedSince keeps files touched at or after the threshold with a small margin', () => {
  const mtimes = {
    '/repo/a.ts': 10_000,
    '/repo/b.ts': 8_500,
    '/repo/c.ts': 5_000,
    '/repo/gone.ts': null,
  };
  const mtimeOf = (file) => mtimes[file];
  assert.deepEqual(modifiedSince(Object.keys(mtimes), 10_000, { mtimeOf }), [
    '/repo/a.ts',
    '/repo/b.ts',
  ]);
});

test('workspacePackages reads every named package from the workspace globs', () => {
  const map = workspacePackages(repoRoot);
  assert.ok(map.has('@codaco/interview'));
  assert.ok(map.has('@codaco/studio-server'), 'nested apps/studio/* glob');
  assert.ok(map.has('@codaco/protocols'));
  assert.equal(map.get('@codaco/protocols').manifest.scripts?.test, undefined);
  assert.ok(map.get('@codaco/interview').manifest.scripts.test);
});

test('nested manifests that are not workspace packages are climbed past', () => {
  const manifests = {
    '/repo/packages/interview/package.json': {
      name: '@codaco/interview',
      scripts: { typecheck: 'tsc' },
    },
    '/repo/packages/interview/e2e/package.json': {
      name: '@codaco/interview-e2e',
    },
  };
  const readPackage = (manifestPath) => manifests[manifestPath] ?? null;
  const isWorkspaceDir = (dir) => dir === '/repo/packages/interview';
  const found = packageForFile(
    '/repo/packages/interview/e2e/specs/x.spec.ts',
    '/repo',
    { readPackage, isWorkspaceDir },
  );
  assert.equal(found?.manifest.name, '@codaco/interview');
  const result = packagesForFiles(
    ['/repo/packages/interview/e2e/specs/x.spec.ts'],
    '/repo',
    { readPackage, isWorkspaceDir },
  );
  assert.deepEqual(result.seeds, ['@codaco/interview']);
});

test('real nested e2e manifests map to their workspace package', () => {
  const result = packagesForFiles(
    [path.join(repoRoot, 'packages/interview/e2e/specs/probe.spec.ts')],
    repoRoot,
  );
  assert.deepEqual(result.seeds, ['@codaco/interview']);
});

test('the gate bypass must be an assignment on the gated command or an earlier export', () => {
  assert.equal(classifyGateCommand('AGENT_GATES=1 pnpm lint'), null);
  assert.equal(
    classifyGateCommand('FOO=bar AGENT_GATES=1 pnpm typecheck'),
    null,
  );
  assert.equal(classifyGateCommand('export AGENT_GATES=1\npnpm lint'), null);
  assert.equal(classifyGateCommand('export AGENT_GATES=1 && pnpm knip'), null);
  assert.equal(
    classifyGateCommand('echo AGENT_GATES=1 && pnpm lint')?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand(
      "cat > x.md <<'EOF'\nAGENT_GATES=1\nEOF\npnpm typecheck",
    )?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand('pnpm lint # AGENT_GATES=1')?.kind,
    'whole-tree-gate',
  );
});

test("takeCommandStart prefers the command's own start, then the most recent outstanding one", () => {
  const state = { commandStarts: { a: 1_000, b: 5_000 }, lastPostEdit: 7_000 };
  assert.equal(takeCommandStart(state, 'b', 10_000), 5_000);
  assert.deepEqual(state.commandStarts, { a: 1_000 });
  state.commandStarts = { 'a': 1_000, 'anon-2': 2_000 };
  assert.equal(takeCommandStart(state, 'unknown', 10_000), 2_000);
  assert.deepEqual(
    state.commandStarts,
    { a: 1_000 },
    'anonymous records are dropped',
  );
  assert.equal(takeCommandStart({ lastPostEdit: 7_000 }, 'x', 10_000), 7_000);
  assert.equal(takeCommandStart({}, undefined, 100_000), 40_000);
});

test('rule-level options such as -D and -A take a value that is not a file target', () => {
  assert.equal(
    classifyGateCommand('oxlint -D correctness')?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand('oxlint -A no-debugger -W correctness')?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand('oxlint --deny correctness --allow no-console')?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand('oxlint -D correctness apps/architect/src/App.tsx'),
    null,
  );
});

test('knip runs in place only for the clean checked-out HEAD', () => {
  const head = 'abc123';
  assert.equal(knipTargetForPush(head, { head, porcelain: '' }), 'in-place');
  assert.equal(
    knipTargetForPush(head, { head, porcelain: '?? scratch.ts\n' }),
    'worktree',
  );
  assert.equal(
    knipTargetForPush('def456', { head, porcelain: '' }),
    'worktree',
  );
});

test('nodeModulesDirs lists the root and every workspace package that has node_modules', () => {
  const dirs = nodeModulesDirs(repoRoot, [
    'packages/interview/package.json',
    'apps/studio/server/package.json',
    'nowhere/package.json',
  ]);
  assert.ok(dirs.includes('.'));
  assert.ok(dirs.includes('packages/interview'));
  assert.ok(!dirs.includes('nowhere'));
});

test('concurrent state updates from separate processes both survive', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agent-hooks-state-'));
  mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  const lib = path.join(repoRoot, 'scripts', 'agent-hooks', 'lib.mjs');
  const script = (key) =>
    `import('${lib}').then((m) => { for (let i = 0; i < 50; i += 1) m.updateState('${root}', (s) => { s.${key} = (s.${key} ?? 0) + 1; }); })`;
  const a = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script('a')],
    { encoding: 'utf8' },
  );
  const b = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script('b')],
    { encoding: 'utf8' },
  );
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  const state = JSON.parse(
    readFileSync(
      path.join(
        root,
        'node_modules',
        '.cache',
        'agent-hooks',
        'stop-state.json',
      ),
      'utf8',
    ),
  );
  assert.deepEqual(state, { a: 50, b: 50 });
  updateState(root, (s) => {
    s.c = 1;
  });
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        path.join(
          root,
          'node_modules',
          '.cache',
          'agent-hooks',
          'stop-state.json',
        ),
        'utf8',
      ),
    ),
    { a: 50, b: 50, c: 1 },
  );
  rmSync(root, { recursive: true, force: true });
});

test('knipCodegenOutputs resolves the generated inputs knip depends on from turbo.json', () => {
  const outputs = knipCodegenOutputs(repoRoot).map((p) =>
    path.relative(repoRoot, p),
  );
  assert.ok(
    outputs.includes('apps/fresco/lib/db/generated'),
    outputs.join(', '),
  );
  assert.ok(outputs.includes('apps/fresco/next-env.d.ts'));
  assert.ok(!outputs.some((p) => p.includes('**')));
});

test('scope flags after the pass-through separator do not scope a gate run', () => {
  assert.equal(
    classifyGateCommand('pnpm typecheck -- --filter foo')?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand(
      'pnpm exec turbo run typecheck -- --filter=@codaco/interview',
    )?.kind,
    'whole-tree-gate',
  );
  assert.equal(
    classifyGateCommand(
      'pnpm --filter @codaco/interview typecheck -- --pretty',
    ),
    null,
  );
});

test('lintReportFrom surfaces stderr when oxlint fails without diagnostics', () => {
  assert.equal(lintReportFrom({ status: 0, stdout: '', stderr: '' }), '');
  assert.equal(
    lintReportFrom({ status: 1, stdout: 'a.ts:1:1: error x', stderr: '' }),
    'a.ts:1:1: error x',
  );
  assert.match(
    lintReportFrom({
      status: 1,
      stdout: '',
      stderr: 'Failed to parse oxlint configuration file.',
    }),
    /status 1:\nFailed to parse/,
  );
  assert.match(
    lintReportFrom({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('timed out'),
    }),
    /did not finish: timed out/,
  );
});

test('previousPackageNames returns the base revision name of a renamed manifest', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agent-hooks-rename-'));
  const sh = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  sh(['init', '-q', '-b', 'main', '.']);
  sh(['config', 'user.email', 'a@b']);
  sh(['config', 'user.name', 't']);
  mkdirSync(path.join(root, 'packages', 'old'), { recursive: true });
  const manifest = path.join(root, 'packages', 'old', 'package.json');
  writeFileSync(manifest, JSON.stringify({ name: '@x/old' }));
  sh(['add', '.']);
  sh(['commit', '-q', '-m', 'base']);
  const base = sh(['rev-parse', 'HEAD']).stdout.trim();
  writeFileSync(manifest, JSON.stringify({ name: '@x/new' }));
  assert.deepEqual(previousPackageNames(root, [manifest], { base }), [
    '@x/old',
  ]);
  writeFileSync(manifest, JSON.stringify({ name: '@x/old' }));
  assert.deepEqual(previousPackageNames(root, [manifest], { base }), []);
  rmSync(manifest);
  assert.deepEqual(previousPackageNames(root, [manifest], { base }), [
    '@x/old',
  ]);
  rmSync(root, { recursive: true, force: true });
});
