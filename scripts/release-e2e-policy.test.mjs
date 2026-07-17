import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  alreadyValidatedSuites,
  collectWorkspacePackages,
  diffIrrelevantToSuite,
  E2E_SUITE_SUBJECTS,
  mergeGroupRequiredSuites,
  releaseE2EPolicy,
  releaseRefForEvent,
  relevanceDirsForSubject,
  SUITE_KEYS,
  SUITES_BY_RELEASE_REF,
} from './release-e2e-policy.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'release-e2e-'));
  // -b main: the merge-queue tests check out `main` by name, which must not
  // depend on the host's init.defaultBranch (CI runners default to master).
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'ci@example.com');
  git(cwd, 'config', 'user.name', 'ci');
  return cwd;
}

function commitManifest(cwd, manifest, contents, message) {
  const dir = join(cwd, manifest, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(cwd, manifest), contents);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function suiteFlags(policy) {
  return Object.fromEntries(SUITE_KEYS.map((key) => [key, policy[key]]));
}

test('recognises only the generated release PR refs', () => {
  for (const releaseRef of Object.keys(SUITES_BY_RELEASE_REF)) {
    assert.equal(
      releaseRefForEvent({
        eventName: 'pull_request',
        headRef: releaseRef,
        refName: '7/merge',
      }),
      releaseRef,
    );
    assert.equal(
      releaseRefForEvent({
        eventName: 'workflow_dispatch',
        headRef: '',
        refName: releaseRef,
      }),
      releaseRef,
    );
  }
  for (const headRef of [
    'changeset-release/not-a-release',
    'changeset-release/apps',
    'feature/add-changeset',
  ]) {
    assert.equal(
      releaseRefForEvent({ eventName: 'pull_request', headRef, refName: '' }),
      '',
    );
  }
});

test('release lane suites match the workspace dependency graph', () => {
  // A suite gates a product lane when its subject package ships in that
  // product's deploy: it IS the product, or one of the product's transitive
  // workspace `dependencies` (devDependencies do not ship). Derive that from
  // the real package.json files so SUITES_BY_RELEASE_REF cannot silently
  // drift when an app gains or drops a suite subject as a dependency.
  const dependenciesByName = new Map();
  for (const group of ['packages', 'apps', 'tooling', 'workers']) {
    for (const entry of readdirSync(join(REPO_ROOT, group), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      let manifest;
      try {
        manifest = JSON.parse(
          readFileSync(join(REPO_ROOT, group, entry.name, 'package.json')),
        );
      } catch {
        continue;
      }
      dependenciesByName.set(
        manifest.name,
        Object.keys(manifest.dependencies ?? {}),
      );
    }
  }

  const transitiveDependencies = (name) => {
    const seen = new Set();
    const queue = [...(dependenciesByName.get(name) ?? [])];
    while (queue.length > 0) {
      const dependency = queue.pop();
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      queue.push(...(dependenciesByName.get(dependency) ?? []));
    }
    return seen;
  };

  const productLanes = {
    'changeset-release/architect': '@codaco/architect',
    'changeset-release/documentation': '@codaco/documentation',
    'changeset-release/interviewer': '@codaco/interviewer',
    'changeset-release/website': 'networkcanvas.com',
  };
  for (const [releaseRef, product] of Object.entries(productLanes)) {
    assert.ok(
      dependenciesByName.has(product),
      `workspace package ${product} exists`,
    );
    const shipped = transitiveDependencies(product);
    for (const key of SUITE_KEYS) {
      const subject = E2E_SUITE_SUBJECTS[key];
      assert.equal(
        SUITES_BY_RELEASE_REF[releaseRef][key],
        subject === product || shipped.has(subject),
        `${releaseRef} requires the ${key} suite exactly when ${subject} ships in ${product}`,
      );
    }
  }

  // The library lane publishes packages consumed by every app, so it always
  // requires every suite.
  for (const key of SUITE_KEYS) {
    assert.equal(SUITES_BY_RELEASE_REF['changeset-release/main'][key], true);
  }
});

test('all release policies share the central snapshot PR target', () => {
  for (const [eventName, releaseRef] of [
    ['pull_request', 'changeset-release/main'],
    ['workflow_dispatch', 'changeset-release/architect'],
    ['workflow_dispatch', 'changeset-release/documentation'],
    ['workflow_dispatch', 'changeset-release/interviewer'],
    ['workflow_dispatch', 'changeset-release/website'],
  ]) {
    assert.deepEqual(
      releaseE2EPolicy({
        eventName,
        headRef: eventName === 'pull_request' ? releaseRef : '',
        refName: eventName === 'workflow_dispatch' ? releaseRef : '',
      }),
      {
        ...SUITES_BY_RELEASE_REF[releaseRef],
        releaseRef,
        snapshotBranch: 'e2e-snapshots/main',
      },
    );
  }
});

test('merge groups require the suites the detector reports', () => {
  const detected = {
    interview: true,
    interviewer: false,
    architect: true,
  };
  assert.deepEqual(
    releaseE2EPolicy(
      { eventName: 'merge_group', baseSha: 'base', headSha: 'head' },
      () => detected,
    ),
    { ...detected, releaseRef: '', snapshotBranch: '' },
  );
});

test('merge-group version bumps require only the affected lanes', () => {
  const cwd = initRepo();
  commitManifest(
    cwd,
    'apps/networkcanvas.com/package.json',
    '{"name":"networkcanvas.com","version":"0.1.1"}\n',
    'add website',
  );
  const baseSha = commitManifest(
    cwd,
    'apps/architect/package.json',
    '{"name":"@codaco/architect","version":"1.0.0"}\n',
    'base',
  );

  // A website bump releases nothing the suites test.
  const websiteBump = commitManifest(
    cwd,
    'apps/networkcanvas.com/package.json',
    '{"name":"networkcanvas.com","version":"0.1.2"}\n',
    'release website',
  );
  assert.deepEqual(mergeGroupRequiredSuites(baseSha, websiteBump, cwd), {
    interview: false,
    interviewer: false,
    architect: false,
  });

  // An architect bump releases the architect app, which ships the interview
  // runtime.
  const architectBump = commitManifest(
    cwd,
    'apps/architect/package.json',
    '{"name":"@codaco/architect","version":"1.0.1"}\n',
    'release architect',
  );
  assert.deepEqual(mergeGroupRequiredSuites(websiteBump, architectBump, cwd), {
    interview: true,
    interviewer: false,
    architect: true,
  });

  // A library bump can ship in every app.
  const libraryBump = commitManifest(
    cwd,
    'packages/protocol-validation/package.json',
    '{"name":"@codaco/protocol-validation","version":"9.9.9"}\n',
    'release library',
  );
  assert.deepEqual(mergeGroupRequiredSuites(architectBump, libraryBump, cwd), {
    interview: true,
    interviewer: true,
    architect: true,
  });

  // Content-only manifest changes (no version movement) require nothing.
  const scriptChange = commitManifest(
    cwd,
    'apps/architect/package.json',
    '{"name":"@codaco/architect","version":"1.0.1","scripts":{}}\n',
    'manifest content change',
  );
  assert.deepEqual(mergeGroupRequiredSuites(libraryBump, scriptChange, cwd), {
    interview: false,
    interviewer: false,
    architect: false,
  });
});

test('ordinary events do not require release E2E', () => {
  const none = {
    interview: false,
    interviewer: false,
    architect: false,
    releaseRef: '',
    snapshotBranch: '',
  };
  assert.deepEqual(
    releaseE2EPolicy({ eventName: 'pull_request', headRef: 'feature/example' }),
    none,
  );
  assert.deepEqual(
    releaseE2EPolicy({ eventName: 'push', refName: 'main' }),
    none,
  );
});

// Build a repo shaped like a merge-queue checkout: main, a release branch
// with a version bump, and a merge commit of the branch into main (HEAD).
// Returns the branch tip so tests can point origin/changeset-release/* at it.
function initMergeQueueRepo({ advanceMainBeforeMerge = false } = {}) {
  const cwd = initRepo();
  commitManifest(
    cwd,
    'apps/architect/package.json',
    '{"name":"@codaco/architect","version":"1.0.0"}\n',
    'base',
  );
  git(cwd, 'checkout', '-qb', 'release');
  const branchTip = commitManifest(
    cwd,
    'apps/architect/package.json',
    '{"name":"@codaco/architect","version":"1.0.1"}\n',
    'version architect',
  );
  git(cwd, 'checkout', '-q', 'main');
  if (advanceMainBeforeMerge) {
    commitManifest(cwd, 'README.md', 'moved\n', 'main moved');
  }
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'release');
  return { cwd, branchTip };
}

function fakeGitHub({ jobs, failRuns = false }) {
  return async (url) => {
    if (failRuns) return { ok: false };
    if (url.includes('/actions/workflows/')) {
      assert.match(url, /[?&]event=pull_request(?:&|$)/);
      assert.doesNotMatch(url, /[?&]event=workflow_dispatch(?:&|$)/);
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [{ jobs_url: 'https://api.example.com/jobs' }],
        }),
      };
    }
    return { ok: true, json: async () => ({ jobs }) };
  };
}

test('merge-queue skip validates suites from the native PR run', async () => {
  const { cwd, branchTip } = initMergeQueueRepo();
  git(
    cwd,
    'update-ref',
    'refs/remotes/origin/changeset-release/architect',
    branchTip,
  );
  assert.deepEqual(
    await alreadyValidatedSuites({
      cwd,
      repository: 'example/repo',
      token: 'token',
      fetcher: fakeGitHub({
        jobs: [
          { name: 'architect-e2e', conclusion: 'success' },
          { name: 'interview-e2e', conclusion: 'success' },
          { name: 'interviewer-e2e', conclusion: 'failure' },
          { name: 'quality', conclusion: 'success' },
        ],
      }),
    }),
    { interview: true, interviewer: false, architect: true },
  );
});

test('merge-queue skip fails closed', async () => {
  const none = { interview: false, interviewer: false, architect: false };
  const validatedJobs = [
    { name: 'architect-e2e', conclusion: 'success' },
    { name: 'interview-e2e', conclusion: 'success' },
    { name: 'interviewer-e2e', conclusion: 'success' },
  ];

  // Main moved under the release PR: the merge tree no longer matches the
  // validated branch tip.
  const moved = initMergeQueueRepo({ advanceMainBeforeMerge: true });
  git(
    moved.cwd,
    'update-ref',
    'refs/remotes/origin/changeset-release/architect',
    moved.branchTip,
  );
  assert.deepEqual(
    await alreadyValidatedSuites({
      cwd: moved.cwd,
      repository: 'example/repo',
      token: 'token',
      fetcher: fakeGitHub({ jobs: validatedJobs }),
    }),
    none,
  );

  // The PR tip is not a generated release branch head: an ordinary PR that
  // bumps a version must never satisfy the fast path.
  const untrusted = initMergeQueueRepo();
  assert.deepEqual(
    await alreadyValidatedSuites({
      cwd: untrusted.cwd,
      repository: 'example/repo',
      token: 'token',
      fetcher: fakeGitHub({ jobs: validatedJobs }),
    }),
    none,
  );

  // API errors count as not validated.
  const apiDown = initMergeQueueRepo();
  git(
    apiDown.cwd,
    'update-ref',
    'refs/remotes/origin/changeset-release/architect',
    apiDown.branchTip,
  );
  assert.deepEqual(
    await alreadyValidatedSuites({
      cwd: apiDown.cwd,
      repository: 'example/repo',
      token: 'token',
      fetcher: fakeGitHub({ jobs: [], failRuns: true }),
    }),
    none,
  );
  assert.deepEqual(
    await alreadyValidatedSuites({
      cwd: apiDown.cwd,
      repository: 'example/repo',
      token: 'token',
      fetcher: async () => {
        throw new Error('network down');
      },
    }),
    none,
  );

  // Missing credentials count as not validated.
  assert.deepEqual(
    suiteFlags(
      await alreadyValidatedSuites({
        cwd: apiDown.cwd,
        repository: '',
        token: '',
        fetcher: fakeGitHub({ jobs: validatedJobs }),
      }),
    ),
    none,
  );
});

// Scaffold a repo-shaped directory tree (no git needed for these tests):
// interviewer app depends on the interview package; architect app is a
// sibling product that also depends on interview.
function writeWorkspaceFixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'release-e2e-graph-'));
  const manifests = {
    'packages/interview/package.json': {
      name: '@codaco/interview',
      version: '1.0.0',
      devDependencies: { '@codaco/e2e-helpers': 'workspace:*' },
    },
    'packages/e2e-helpers/package.json': {
      name: '@codaco/e2e-helpers',
      version: '1.0.0',
    },
    'apps/interviewer/package.json': {
      name: '@codaco/interviewer',
      version: '1.0.0',
      dependencies: { '@codaco/interview': 'workspace:*' },
    },
    'apps/architect/package.json': {
      name: '@codaco/architect',
      version: '1.0.0',
      dependencies: { '@codaco/interview': 'workspace:*' },
    },
  };
  for (const [file, contents] of Object.entries(manifests)) {
    mkdirSync(join(cwd, file, '..'), { recursive: true });
    writeFileSync(join(cwd, file), `${JSON.stringify(contents)}\n`);
  }
  return cwd;
}

test('relevance closure follows dependencies and devDependencies', () => {
  const cwd = writeWorkspaceFixture();
  const packages = collectWorkspacePackages(cwd);
  assert.deepEqual(
    [...relevanceDirsForSubject('@codaco/interviewer', packages)].toSorted(
      (a, b) => a.localeCompare(b),
    ),
    ['apps/interviewer', 'packages/e2e-helpers', 'packages/interview'],
  );
  // devDependency edge: interview pulls in its e2e helpers.
  assert.deepEqual(
    [...relevanceDirsForSubject('@codaco/interview', packages)].toSorted(
      (a, b) => a.localeCompare(b),
    ),
    ['packages/e2e-helpers', 'packages/interview'],
  );
});

test('diff classification is fail-closed', () => {
  const cwd = writeWorkspaceFixture();
  const packages = collectWorkspacePackages(cwd);
  const relevance = relevanceDirsForSubject('@codaco/interviewer', packages);

  // Sibling-product and inert paths cannot affect the interviewer suite.
  assert.equal(
    diffIrrelevantToSuite(
      [
        'apps/architect/package.json',
        'apps/architect/CHANGELOG.md',
        '.changeset/lucky-pandas-dance.md',
        'docs/superpowers/specs/example.md',
        'README.md',
      ],
      relevance,
      packages,
    ),
    true,
  );

  // Anything in the closure is relevant — including non-markdown baselines.
  for (const relevantPath of [
    'apps/interviewer/src/main.tsx',
    'packages/interview/e2e/baseline.png',
    'packages/e2e-helpers/src/index.ts',
  ]) {
    assert.equal(
      diffIrrelevantToSuite([relevantPath], relevance, packages),
      false,
      `${relevantPath} must be relevant`,
    );
  }

  // Paths outside every workspace package fail closed.
  for (const unrecognised of [
    '.github/workflows/ci-and-release.yml',
    'scripts/release-e2e-policy.mjs',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'turbo.json',
    '.nvmrc',
  ]) {
    assert.equal(
      diffIrrelevantToSuite([unrecognised], relevance, packages),
      false,
      `${unrecognised} must be relevant`,
    );
  }

  // One relevant path among many irrelevant ones is enough to run.
  assert.equal(
    diffIrrelevantToSuite(
      ['apps/architect/package.json', 'pnpm-lock.yaml'],
      relevance,
      packages,
    ),
    false,
  );

  // An empty diff is trivially irrelevant (byte-identical case).
  assert.equal(diffIrrelevantToSuite([], relevance, packages), true);
});
