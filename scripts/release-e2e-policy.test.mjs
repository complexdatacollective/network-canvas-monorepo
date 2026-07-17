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
  collectWorkspacePackages,
  diffIrrelevantToSuite,
  equivalentValidatedSuites,
  E2E_SUITE_SUBJECTS,
  mergeGroupRequiredSuites,
  releaseBranchForMergeQueue,
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

test('interview relevance closure covers peer-declared and asset-only workspace edges', () => {
  // Anti-drift guard for review findings: tooling/tailwind is a
  // peerDependency of @codaco/interview (the theme tokens the e2e host
  // renders with) rather than a dependency/devDependency,
  // @codaco/development-protocol is a devDependency the e2e matrix scenarios
  // resolve by package name to reach fixture assets, and @codaco/protocols
  // is a devDependency the e2e SILOS fixture resolves by package name.
  // Reading the real package.json graph means a future edge-type or
  // dependency drop is caught here instead of silently classifying a
  // relevant change as irrelevant.
  const dirs = relevanceDirsForSubject(
    '@codaco/interview',
    collectWorkspacePackages(REPO_ROOT),
  );
  assert.ok(
    dirs.has('tooling/tailwind'),
    'tooling/tailwind (peerDependency) is in the interview closure',
  );
  assert.ok(
    dirs.has('packages/development-protocol'),
    'packages/development-protocol (devDependency) is in the interview closure',
  );
  assert.ok(
    dirs.has('packages/protocols'),
    'packages/protocols (devDependency) is in the interview closure',
  );
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
function initMergeQueueRepo({ advanceMainWith = '' } = {}) {
  const cwd = initRepo();
  // @codaco/interview must be a real discovered package: equivalence reuse
  // now refuses to trust a relevance judgment about a suite whose subject is
  // missing from the graph entirely.
  commitManifest(
    cwd,
    'packages/interview/package.json',
    '{"name":"@codaco/interview","version":"1.0.0"}\n',
    'add interview',
  );
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
  if (advanceMainWith) {
    commitManifest(cwd, advanceMainWith, 'moved\n', 'main moved');
  }
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'release');
  return { cwd, branchTip };
}

function architectLaneQueueCall(cwd, fetcher) {
  const branch = releaseBranchForMergeQueue(cwd);
  return equivalentValidatedSuites({
    cwd,
    repository: 'example/repo',
    token: 'token',
    branch,
    headSha: git(cwd, 'rev-parse', 'HEAD'),
    requiredSuites: { interview: true, interviewer: false, architect: true },
    fetcher,
  });
}

const ARCHITECT_LANE_SUCCESS_JOBS = [
  { name: 'architect-e2e', conclusion: 'success' },
  { name: 'interview-e2e', conclusion: 'success' },
  { name: 'quality', conclusion: 'success' },
];

test('merge queue identifies the release lane from the merge second parent', () => {
  const { cwd, branchTip } = initMergeQueueRepo();
  assert.equal(releaseBranchForMergeQueue(cwd), '');
  git(
    cwd,
    'update-ref',
    'refs/remotes/origin/changeset-release/architect',
    branchTip,
  );
  assert.equal(releaseBranchForMergeQueue(cwd), 'changeset-release/architect');
});

test('merge-queue reuse skips suites validated at the branch tip', async () => {
  const { cwd, branchTip } = initMergeQueueRepo();
  git(
    cwd,
    'update-ref',
    'refs/remotes/origin/changeset-release/architect',
    branchTip,
  );
  // The merge added nothing beyond the branch: empty diff, trivial case.
  assert.deepEqual(
    await architectLaneQueueCall(
      cwd,
      fakeActionsApi({
        runs: [fakeRun(1, branchTip)],
        jobsByRun: { 1: ARCHITECT_LANE_SUCCESS_JOBS },
      }),
    ),
    { interview: true, interviewer: false, architect: true },
  );
});

test('merge-queue reuse classifies batched main movement by relevance', async () => {
  // Main moved with a file inside the architect subject: the architect suite
  // re-runs. The interview suite may still skip — apps/architect is outside
  // the interview package's closure, so its e2e outcome cannot change.
  const relevant = initMergeQueueRepo({
    advanceMainWith: 'apps/architect/src/main.tsx',
  });
  git(
    relevant.cwd,
    'update-ref',
    'refs/remotes/origin/changeset-release/architect',
    relevant.branchTip,
  );
  assert.deepEqual(
    await architectLaneQueueCall(
      relevant.cwd,
      fakeActionsApi({
        runs: [fakeRun(1, relevant.branchTip)],
        jobsByRun: { 1: ARCHITECT_LANE_SUCCESS_JOBS },
      }),
    ),
    { interview: true, interviewer: false, architect: false },
  );

  // Main moved with an inert file (README): the batched merge still cannot
  // affect the suites, so reuse holds. (Old byte-identical semantics re-ran
  // here; relevance classification is the intended improvement.)
  const inert = initMergeQueueRepo({ advanceMainWith: 'README.md' });
  git(
    inert.cwd,
    'update-ref',
    'refs/remotes/origin/changeset-release/architect',
    inert.branchTip,
  );
  assert.deepEqual(
    await architectLaneQueueCall(
      inert.cwd,
      fakeActionsApi({
        runs: [fakeRun(1, inert.branchTip)],
        jobsByRun: { 1: ARCHITECT_LANE_SUCCESS_JOBS },
      }),
    ),
    { interview: true, interviewer: false, architect: true },
  );

  // An ordinary PR that bumps a version must never satisfy reuse: without a
  // matching origin/changeset-release/* tip there is no branch to walk.
  const untrusted = initMergeQueueRepo();
  assert.equal(releaseBranchForMergeQueue(untrusted.cwd), '');
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
      peerDependencies: { '@codaco/theme-peer': 'workspace:*' },
    },
    'packages/e2e-helpers/package.json': {
      name: '@codaco/e2e-helpers',
      version: '1.0.0',
    },
    'packages/theme-peer/package.json': {
      name: '@codaco/theme-peer',
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
  // A workspace group can contain a directory with no package.json at all
  // (e.g. a scratch or generated directory). pnpm's own glob semantics
  // tolerate this, so discovery must too: ENOENT reading the manifest is not
  // a broken workspace member, just a directory that isn't one.
  mkdirSync(join(cwd, 'packages/no-manifest'), { recursive: true });
  return cwd;
}

test('relevance closure follows dependencies, devDependencies, and peerDependencies', () => {
  const cwd = writeWorkspaceFixture();
  const packages = collectWorkspacePackages(cwd);
  // The fixture's packages/no-manifest directory (no package.json) is
  // tolerated silently and does not appear as a discovered package.
  assert.equal(packages.size, 5);
  assert.deepEqual(
    [...relevanceDirsForSubject('@codaco/interviewer', packages)].toSorted(
      (a, b) => a.localeCompare(b),
    ),
    [
      'apps/interviewer',
      'packages/e2e-helpers',
      'packages/interview',
      'packages/theme-peer',
    ],
  );
  // devDependency edge: interview pulls in its e2e helpers. peerDependency
  // edge: interview pulls in its peer theme package.
  assert.deepEqual(
    [...relevanceDirsForSubject('@codaco/interview', packages)].toSorted(
      (a, b) => a.localeCompare(b),
    ),
    ['packages/e2e-helpers', 'packages/interview', 'packages/theme-peer'],
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

// A fake Actions REST API: one runs-listing endpoint plus per-run jobs
// endpoints, keyed by run id embedded in jobs_url. totalCountByRun defaults
// each run's total_count to its own jobs array length, matching a
// single-page response, so existing callers are unaffected.
function fakeActionsApi({
  runs,
  jobsByRun,
  totalCountByRun = {},
  failRuns = false,
  failJobs = false,
}) {
  return async (url) => {
    if (url.includes('/actions/workflows/')) {
      if (failRuns) return { ok: false };
      assert.match(url, /[?&]event=pull_request(?:&|$)/);
      assert.match(url, /[?&]branch=changeset-release%2F/);
      return { ok: true, json: async () => ({ workflow_runs: runs }) };
    }
    if (failJobs) return { ok: false };
    const runId = url.match(/\/fake-jobs\/(\d+)\?/)?.[1];
    const jobs = jobsByRun[runId] ?? [];
    return {
      ok: true,
      json: async () => ({
        jobs,
        total_count: totalCountByRun[runId] ?? jobs.length,
      }),
    };
  };
}

// Higher id = newer run (created_at day tracks the id).
function fakeRun(
  id,
  headSha,
  createdAt = `2026-07-${String(id).padStart(2, '0')}T00:00:00Z`,
) {
  return {
    id,
    head_sha: headSha,
    created_at: createdAt,
    head_repository: { full_name: 'example/repo' },
    jobs_url: `https://api.example.com/fake-jobs/${id}`,
  };
}

// Release-branch history with a real workspace graph committed, so the
// primitive can classify diffs: interviewer + architect apps both depend on
// the interview package.
function initReleaseBranchRepo() {
  const cwd = initRepo();
  commitManifest(
    cwd,
    'packages/interview/package.json',
    '{"name":"@codaco/interview","version":"1.0.0"}\n',
    'add interview',
  );
  commitManifest(
    cwd,
    'apps/interviewer/package.json',
    '{"name":"@codaco/interviewer","version":"1.0.0","dependencies":{"@codaco/interview":"workspace:*"}}\n',
    'add interviewer',
  );
  const validatedSha = commitManifest(
    cwd,
    'apps/architect/package.json',
    '{"name":"@codaco/architect","version":"1.0.0","dependencies":{"@codaco/interview":"workspace:*"}}\n',
    'add architect',
  );
  return { cwd, validatedSha };
}

const INTERVIEWER_LANE = {
  interview: true,
  interviewer: true,
  architect: false,
};

function interviewerLaneCall(cwd, headSha, fetcher) {
  return equivalentValidatedSuites({
    cwd,
    repository: 'example/repo',
    token: 'token',
    branch: 'changeset-release/interviewer',
    headSha,
    requiredSuites: INTERVIEWER_LANE,
    fetcher,
  });
}

const INTERVIEWER_LANE_SUCCESS_JOBS = [
  { name: 'interview-e2e', conclusion: 'success' },
  { name: 'interviewer-e2e', conclusion: 'success' },
  { name: 'quality', conclusion: 'success' },
];

test('equivalence reuse skips suites when the delta cannot affect them', async () => {
  const { cwd, validatedSha } = initReleaseBranchRepo();
  // Sibling release merge shape: architect bump + consumed changeset + docs.
  commitManifest(
    cwd,
    'apps/architect/package.json',
    '{"name":"@codaco/architect","version":"1.0.1","dependencies":{"@codaco/interview":"workspace:*"}}\n',
    'sibling release',
  );
  const headSha = commitManifest(
    cwd,
    '.changeset/config.md',
    'consumed\n',
    'changesets',
  );

  const fetcher = fakeActionsApi({
    runs: [fakeRun(1, validatedSha)],
    jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS },
  });
  assert.deepEqual(await interviewerLaneCall(cwd, headSha, fetcher), {
    interview: true,
    interviewer: true,
    architect: false,
  });

  // Byte-identical head (re-run at the validated SHA) is the trivial case.
  assert.deepEqual(await interviewerLaneCall(cwd, validatedSha, fetcher), {
    interview: true,
    interviewer: true,
    architect: false,
  });
});

test('equivalence reuse fails closed on relevant or unrecognised deltas', async () => {
  const relevant = initReleaseBranchRepo();
  const relevantHead = commitManifest(
    relevant.cwd,
    'packages/interview/src/index.ts',
    'export {};\n',
    'interview change',
  );
  assert.deepEqual(
    await interviewerLaneCall(
      relevant.cwd,
      relevantHead,
      fakeActionsApi({
        runs: [fakeRun(1, relevant.validatedSha)],
        jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS },
      }),
    ),
    { interview: false, interviewer: false, architect: false },
  );

  const unrecognised = initReleaseBranchRepo();
  const unrecognisedHead = commitManifest(
    unrecognised.cwd,
    'scripts/new-tool.mjs',
    'export {};\n',
    'root script',
  );
  assert.deepEqual(
    await interviewerLaneCall(
      unrecognised.cwd,
      unrecognisedHead,
      fakeActionsApi({
        runs: [fakeRun(1, unrecognised.validatedSha)],
        jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS },
      }),
    ),
    { interview: false, interviewer: false, architect: false },
  );
});

test('the newest conclusive verdict is authoritative', async () => {
  const { cwd, validatedSha } = initReleaseBranchRepo();
  const headSha = commitManifest(
    cwd,
    '.changeset/x.md',
    'irrelevant\n',
    'refresh',
  );

  // Newest conclusive run FAILED interviewer-e2e: never walk past it to the
  // older green, even though the diff is irrelevant.
  const failedThenGreen = fakeActionsApi({
    runs: [fakeRun(2, headSha), fakeRun(1, validatedSha)],
    jobsByRun: {
      2: [
        { name: 'interview-e2e', conclusion: 'success' },
        { name: 'interviewer-e2e', conclusion: 'failure' },
      ],
      1: INTERVIEWER_LANE_SUCCESS_JOBS,
    },
  });
  assert.deepEqual(await interviewerLaneCall(cwd, headSha, failedThenGreen), {
    interview: true,
    interviewer: false,
    architect: false,
  });

  // Non-conclusive runs (cancelled / in-flight / policy-skipped) are walked
  // past to the older native success.
  const cancelledThenGreen = fakeActionsApi({
    runs: [fakeRun(2, headSha), fakeRun(1, validatedSha)],
    jobsByRun: {
      2: [
        { name: 'interview-e2e', conclusion: 'cancelled' },
        { name: 'interviewer-e2e', conclusion: 'skipped' },
      ],
      1: INTERVIEWER_LANE_SUCCESS_JOBS,
    },
  });
  assert.deepEqual(
    await interviewerLaneCall(cwd, headSha, cancelledThenGreen),
    {
      interview: true,
      interviewer: true,
      architect: false,
    },
  );
});

test('equivalence reuse trusts only same-repo runs and healthy inputs', async () => {
  const none = { interview: false, interviewer: false, architect: false };
  const { cwd, validatedSha } = initReleaseBranchRepo();
  const headSha = commitManifest(
    cwd,
    '.changeset/x.md',
    'irrelevant\n',
    'refresh',
  );

  // Fork runs sharing the branch name never vouch for ours.
  const forkRun = {
    ...fakeRun(1, validatedSha),
    head_repository: { full_name: 'attacker/fork' },
  };
  assert.deepEqual(
    await interviewerLaneCall(
      cwd,
      headSha,
      fakeActionsApi({
        runs: [forkRun],
        jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS },
      }),
    ),
    none,
  );

  // An unfetchable validated commit fails closed (no origin remote here, so
  // the fetch fallback cannot resolve it).
  assert.deepEqual(
    await interviewerLaneCall(
      cwd,
      headSha,
      fakeActionsApi({
        runs: [fakeRun(1, '0123456789abcdef0123456789abcdef01234567')],
        jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS },
      }),
    ),
    none,
  );

  // Actions API failures (runs listing or jobs listing) fail closed.
  assert.deepEqual(
    await interviewerLaneCall(
      cwd,
      headSha,
      fakeActionsApi({ runs: [], jobsByRun: {}, failRuns: true }),
    ),
    none,
  );
  assert.deepEqual(
    await interviewerLaneCall(
      cwd,
      headSha,
      fakeActionsApi({
        runs: [fakeRun(1, validatedSha)],
        jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS },
        failJobs: true,
      }),
    ),
    none,
  );
  assert.deepEqual(
    await interviewerLaneCall(cwd, headSha, async () => {
      throw new Error('network down');
    }),
    none,
  );

  // Missing inputs fail closed.
  assert.deepEqual(
    await equivalentValidatedSuites({
      cwd,
      repository: '',
      token: '',
      branch: '',
      headSha: '',
      requiredSuites: INTERVIEWER_LANE,
    }),
    none,
  );
});

test('a relevant file renamed to an inert path still forces the suite to run', async () => {
  const { cwd } = initReleaseBranchRepo();
  // Force rename detection on for this repo so the assertion below proves
  // --no-renames overrides it, rather than merely relying on whatever this
  // machine's git defaults to.
  git(cwd, 'config', 'diff.renames', 'true');

  const preRenameSha = commitManifest(
    cwd,
    'packages/interview/src/feature.ts',
    'export {};\n',
    'add feature file',
  );
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  git(cwd, 'mv', 'packages/interview/src/feature.ts', 'docs/feature.ts');
  git(cwd, 'commit', '-qm', 'move feature file out of interview');
  const headSha = git(cwd, 'rev-parse', 'HEAD');

  // With rename detection, `git diff --name-only` would report only
  // docs/feature.ts (inert) and hide that the source lived inside the
  // interview package's closure. --no-renames must surface the deleted
  // packages/interview/src/feature.ts path too, keeping both suites required.
  assert.deepEqual(
    await interviewerLaneCall(
      cwd,
      headSha,
      fakeActionsApi({
        runs: [fakeRun(1, preRenameSha)],
        jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS },
      }),
    ),
    { interview: false, interviewer: false, architect: false },
  );

  // Sanity check: confirm this repo's git actually would have collapsed the
  // rename to a single destination path without --no-renames, so the
  // assertion above is exercising the guard and not a no-op.
  const renameCollapsed = git(
    cwd,
    'diff',
    '--name-only',
    preRenameSha,
    headSha,
  );
  assert.equal(renameCollapsed, 'docs/feature.ts');
});

test('equivalence reuse fails closed when a workspace manifest is malformed', async () => {
  const cwd = initRepo();
  commitManifest(
    cwd,
    'packages/interview/package.json',
    '{"name":"@codaco/interview","version":"1.0.0"}\n',
    'add interview',
  );
  commitManifest(
    cwd,
    'apps/interviewer/package.json',
    '{"name":"@codaco/interviewer","version":"1.0.0","dependencies":{"@codaco/interview":"workspace:*"}}\n',
    'add interviewer',
  );
  commitManifest(
    cwd,
    'apps/architect/package.json',
    '{"name":"@codaco/architect","version":"1.0.0","dependencies":{"@codaco/interview":"workspace:*"}}\n',
    'add architect',
  );
  // The broken manifest is committed BEFORE the validated SHA is captured,
  // so it is unchanged between validatedSha and headSha — the scenario where
  // the old silent-skip in collectWorkspacePackages could go fail-open even
  // though nothing in the actual diff touches it.
  const validatedSha = commitManifest(
    cwd,
    'packages/broken/package.json',
    'not json',
    'add malformed manifest',
  );
  const headSha = commitManifest(
    cwd,
    '.changeset/x.md',
    'irrelevant\n',
    'refresh',
  );

  assert.deepEqual(
    await interviewerLaneCall(
      cwd,
      headSha,
      fakeActionsApi({
        runs: [fakeRun(1, validatedSha)],
        jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS },
      }),
    ),
    { interview: false, interviewer: false, architect: false },
  );
});

test('equivalence reuse rejects a suite whose subject package is missing from the workspace graph', async () => {
  const cwd = initRepo();
  const validatedSha = commitManifest(
    cwd,
    'packages/other/package.json',
    '{"name":"@codaco/other","version":"1.0.0"}\n',
    'add unrelated package',
  );
  const headSha = commitManifest(
    cwd,
    '.changeset/x.md',
    'irrelevant\n',
    'refresh',
  );

  // The graph never contains @codaco/interview at all, so no relevance
  // judgment about the interview suite can be trusted — reuse must be
  // rejected even though the diff itself is inert and the fake API reports a
  // conclusive success.
  assert.deepEqual(
    await equivalentValidatedSuites({
      cwd,
      repository: 'example/repo',
      token: 'token',
      branch: 'changeset-release/interviewer',
      headSha,
      requiredSuites: {
        interview: true,
        interviewer: false,
        architect: false,
      },
      fetcher: fakeActionsApi({
        runs: [fakeRun(1, validatedSha)],
        jobsByRun: { 1: [{ name: 'interview-e2e', conclusion: 'success' }] },
      }),
    }),
    { interview: false, interviewer: false, architect: false },
  );
});

test('equivalence reuse fails closed when a jobs listing is truncated', async () => {
  const { cwd, validatedSha } = initReleaseBranchRepo();
  const headSha = commitManifest(
    cwd,
    '.changeset/x.md',
    'irrelevant\n',
    'refresh',
  );

  // The jobs page reports fewer jobs than total_count claims: a conclusive
  // FAILURE for interviewer-e2e could be sitting beyond this page, so the
  // listing must be treated as API doubt rather than trusted as-is.
  assert.deepEqual(
    await interviewerLaneCall(
      cwd,
      headSha,
      fakeActionsApi({
        runs: [fakeRun(1, validatedSha)],
        jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS },
        totalCountByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS.length + 1 },
      }),
    ),
    { interview: false, interviewer: false, architect: false },
  );
});
