# Release E2E Equivalence Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop force-pushed refreshes of generated release PRs from re-running release E2E suites when nothing relevant to a suite changed, by adding equivalence-based suite reuse to `scripts/release-e2e-policy.mjs` (spec: `docs/superpowers/specs/2026-07-17-release-e2e-equivalence-reuse-design.md`).

**Architecture:** Branch generation is untouched. The `e2e-policy` job's script gains an equivalence primitive: a suite is skipped when the newest conclusive native `pull_request` run of that suite on the same `changeset-release/*` branch succeeded at commit X, and `git diff X→H` touches only paths that provably cannot affect the suite. The primitive is applied at PR time (H = PR tip) and merge-queue time (H = merge commit, replacing the byte-identical fast path, which becomes the empty-diff trivial case). Every doubt fails closed (suite runs).

**Tech Stack:** Plain Node ESM scripts (`scripts/*.mjs`), `node --test` (`pnpm test:scripts`), GitHub Actions workflow YAML, GitHub Actions REST API.

## Global Constraints

- Fail closed everywhere: any API error, unfetchable commit, unrecognised path, missing input, or fork context means the suite RUNS. Never invert this.
- Ordinary (non-release) PRs must never inherit an E2E verdict — reuse applies only to `changeset-release/*` refs (`pull_request` and `merge_group` events; never `workflow_dispatch`).
- A conclusive `failure`/`timed_out` as the newest verdict is never walked past to an older success.
- No new dependencies. No `any`-style shortcuts (plain JS here, but keep JSDoc-free style consistent with the existing file).
- Comment only what the code cannot say (constraints, invariants) — match the existing comment style in `release-e2e-policy.mjs`.
- Never re-export or add exports beyond what tests/consumers actually import.
- Commit messages: conventional style (`feat:`/`fix:`/`ci:`/`test:`/`docs:`), no Co-Authored-By/attribution lines. Before committing run `eval "$(fnm env 2>/dev/null)"` so the husky hook finds pnpm.
- Run tests with `pnpm test:scripts` (wraps `node --test scripts/*.test.mjs`). A single file: `node --test scripts/release-e2e-policy.test.mjs`.
- Work happens on branch `claude/ci-release-pr-force-push-4968a1` in this worktree.

---

### Task 1: Path-relevance helpers

**Files:**

- Modify: `scripts/release-e2e-policy.mjs`
- Test: `scripts/release-e2e-policy.test.mjs`

**Interfaces:**

- Consumes: nothing new (existing `E2E_SUITE_SUBJECTS`, `SUITE_KEYS` untouched).
- Produces (used by Task 2's primitive and Task 1/2 tests):
  - `collectWorkspacePackages(cwd: string): Map<string, {dir: string, workspaceDeps: string[]}>` — scans `packages/`, `apps/`, `tooling/`, `workers/` for `<group>/<name>/package.json`; `dir` is the repo-relative directory (e.g. `"apps/architect"`), `workspaceDeps` is the merged key list of `dependencies` + `devDependencies` (names, unfiltered — non-workspace names simply miss the map during traversal).
  - `relevanceDirsForSubject(subjectName: string, packages: ReturnType<typeof collectWorkspacePackages>): Set<string>` — dirs of the subject package plus its transitive workspace dependency/devDependency closure.
  - `diffIrrelevantToSuite(changedPaths: string[], relevanceDirs: Set<string>, packages: ReturnType<typeof collectWorkspacePackages>): boolean` — true only when EVERY path is inert (`docs/`, `.changeset/`, `*.md`) or inside a workspace package dir NOT in `relevanceDirs`. Any other path (root configs, `.github/`, `scripts/`, `pnpm-lock.yaml`, unknown dirs) → false.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/release-e2e-policy.test.mjs` (extend the existing import list from `./release-e2e-policy.mjs` with the three new names):

```js
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
    [...relevanceDirsForSubject('@codaco/interviewer', packages)].sort(),
    ['apps/interviewer', 'packages/e2e-helpers', 'packages/interview'],
  );
  // devDependency edge: interview pulls in its e2e helpers.
  assert.deepEqual(
    [...relevanceDirsForSubject('@codaco/interview', packages)].sort(),
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/release-e2e-policy.test.mjs`
Expected: FAIL — `collectWorkspacePackages` is not exported.

- [ ] **Step 3: Implement the helpers**

In `scripts/release-e2e-policy.mjs`, extend the imports:

```js
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
```

Then add below the `E2E_JOB_NAMES` constant:

```js
const WORKSPACE_GROUPS = ['packages', 'apps', 'tooling', 'workers'];

// Mirrors the `test` job's inert set: docs, changesets, and markdown cannot
// change what an E2E suite executes or asserts.
function isInertPath(path) {
  return (
    path.startsWith('docs/') ||
    path.startsWith('.changeset/') ||
    path.endsWith('.md')
  );
}

export function collectWorkspacePackages(cwd) {
  const packages = new Map();
  for (const group of WORKSPACE_GROUPS) {
    let entries;
    try {
      entries = readdirSync(join(cwd, group), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let manifest;
      try {
        manifest = JSON.parse(
          readFileSync(join(cwd, group, entry.name, 'package.json'), 'utf8'),
        );
      } catch {
        continue;
      }
      if (typeof manifest.name !== 'string') continue;
      packages.set(manifest.name, {
        dir: `${group}/${entry.name}`,
        // devDependencies participate: they carry Playwright configs, e2e
        // helpers, and build tooling that shape suite outcomes.
        workspaceDeps: [
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
        ],
      });
    }
  }
  return packages;
}

export function relevanceDirsForSubject(subjectName, packages) {
  const dirs = new Set();
  const seen = new Set();
  const queue = [subjectName];
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const pkg = packages.get(name);
    if (!pkg) continue;
    dirs.add(pkg.dir);
    queue.push(...pkg.workspaceDeps);
  }
  return dirs;
}

// True only when EVERY changed path provably cannot affect the suite: it is
// inert, or it lives inside a workspace package outside the suite's relevance
// closure. Any other path — root configs, .github/, scripts/, the lockfile,
// anything unrecognised — is relevant, so the suite runs (fail closed).
export function diffIrrelevantToSuite(changedPaths, relevanceDirs, packages) {
  const packageDirs = [...packages.values()].map((pkg) => pkg.dir);
  return changedPaths.every((changedPath) => {
    if (isInertPath(changedPath)) return true;
    const owner = packageDirs.find((dir) => changedPath.startsWith(`${dir}/`));
    return owner !== undefined && !relevanceDirs.has(owner);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/release-e2e-policy.test.mjs`
Expected: PASS (all existing tests plus the two new ones).

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env 2>/dev/null)"
git add scripts/release-e2e-policy.mjs scripts/release-e2e-policy.test.mjs
git commit -m "ci: add suite path-relevance helpers to release E2E policy"
```

---

### Task 2: The equivalence primitive

**Files:**

- Modify: `scripts/release-e2e-policy.mjs`
- Test: `scripts/release-e2e-policy.test.mjs`

**Interfaces:**

- Consumes (from Task 1): `collectWorkspacePackages(cwd)`, `relevanceDirsForSubject(subjectName, packages)`, `diffIrrelevantToSuite(changedPaths, relevanceDirs, packages)`. Also existing internals `suites()`, `git(args, cwd)`, `tryGit(args, cwd)`, `SUITE_KEYS`, `E2E_JOB_NAMES`, `E2E_SUITE_SUBJECTS`.
- Produces (used by Task 3's `main()` and tests):
  - `equivalentValidatedSuites({cwd, repository, token, branch, headSha, requiredSuites, fetcher = fetch}): Promise<{interview: boolean, interviewer: boolean, architect: boolean}>` — `true` means the suite is validated-equivalent and may be skipped. `requiredSuites` is a suites-shaped object; suites not required are never looked up.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/release-e2e-policy.test.mjs` (add `equivalentValidatedSuites` to the import list). These use real temp git repos (existing `initRepo`/`commitManifest` helpers) plus a fake Actions API:

```js
// A fake Actions REST API: one runs-listing endpoint plus per-run jobs
// endpoints, keyed by run id embedded in jobs_url.
function fakeActionsApi({ runs, jobsByRun, failRuns = false, failJobs = false }) {
  return async (url) => {
    if (url.includes('/actions/workflows/')) {
      if (failRuns) return { ok: false };
      assert.match(url, /[?&]event=pull_request(?:&|$)/);
      assert.match(url, /[?&]branch=changeset-release%2F/);
      return { ok: true, json: async () => ({ workflow_runs: runs }) };
    }
    if (failJobs) return { ok: false };
    const runId = url.match(/\/fake-jobs\/(\d+)\?/)?.[1];
    return { ok: true, json: async () => ({ jobs: jobsByRun[runId] ?? [] }) };
  };
}

// Higher id = newer run (created_at day tracks the id).
function fakeRun(id, headSha, createdAt = `2026-07-${String(id).padStart(2, '0')}T00:00:00Z`) {
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
  const headSha = commitManifest(cwd, '.changeset/config.md', 'consumed\n', 'changesets');

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
  const headSha = commitManifest(cwd, '.changeset/x.md', 'irrelevant\n', 'refresh');

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
  assert.deepEqual(await interviewerLaneCall(cwd, headSha, cancelledThenGreen), {
    interview: true,
    interviewer: true,
    architect: false,
  });
});

test('equivalence reuse trusts only same-repo runs and healthy inputs', async () => {
  const none = { interview: false, interviewer: false, architect: false };
  const { cwd, validatedSha } = initReleaseBranchRepo();
  const headSha = commitManifest(cwd, '.changeset/x.md', 'irrelevant\n', 'refresh');

  // Fork runs sharing the branch name never vouch for ours.
  const forkRun = {
    ...fakeRun(1, validatedSha),
    head_repository: { full_name: 'attacker/fork' },
  };
  assert.deepEqual(
    await interviewerLaneCall(
      cwd,
      headSha,
      fakeActionsApi({ runs: [forkRun], jobsByRun: { 1: INTERVIEWER_LANE_SUCCESS_JOBS } }),
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/release-e2e-policy.test.mjs`
Expected: FAIL — `equivalentValidatedSuites` is not exported.

- [ ] **Step 3: Implement the primitive**

In `scripts/release-e2e-policy.mjs`, add below the Task 1 helpers:

```js
const CONCLUSIVE = new Set(['success', 'failure', 'timed_out']);
// One bounded page of the branch's runs. A verdict older than this is stale
// enough that re-running is the right call anyway (fail closed past the cap).
const MAX_RUNS_SCANNED = 50;

function ensureCommit(sha, cwd) {
  if (tryGit(['rev-parse', '--verify', `${sha}^{commit}`], cwd)) return true;
  // Force-pushed-away release tips stay fetchable by SHA on GitHub.
  tryGit(['fetch', '--depth=1', 'origin', sha], cwd);
  return tryGit(['rev-parse', '--verify', `${sha}^{commit}`], cwd) !== null;
}

// Equivalence reuse: suite S may be skipped at head H when the newest
// conclusive native pull_request run of S on this generated release branch
// succeeded at commit X and diff(X→H) touches only paths that provably
// cannot affect S (see diffIrrelevantToSuite). Every failure mode — missing
// input, API error, unfetchable commit, conclusive failure, fork run —
// leaves the suite required (fail closed). Visual baselines are committed
// in-tree inside the subject packages, so the diff covers them too.
export async function equivalentValidatedSuites({
  cwd,
  repository,
  token,
  branch,
  headSha,
  requiredSuites,
  fetcher = fetch,
}) {
  const validated = suites();
  if (!repository || !token || !branch || !headSha) return validated;
  const required = SUITE_KEYS.filter((key) => requiredSuites[key]);
  if (required.length === 0) return validated;
  if (!ensureCommit(headSha, cwd)) return validated;

  const apiOptions = {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
    },
  };
  try {
    const runsResponse = await fetcher(
      `https://api.github.com/repos/${repository}/actions/workflows/ci-and-release.yml/runs?event=pull_request&branch=${encodeURIComponent(branch)}&per_page=${MAX_RUNS_SCANNED}`,
      apiOptions,
    );
    if (!runsResponse.ok) return validated;
    const { workflow_runs: runs = [] } = await runsResponse.json();

    // Same-repo runs only: a fork branch may share the generated branch's
    // name, but its runs must never vouch for ours. Sort defensively even
    // though the API returns newest-first.
    const trustedRuns = runs
      .filter((run) => run.head_repository?.full_name === repository)
      .sort((a, b) => Date.parse(b.created_at ?? 0) - Date.parse(a.created_at ?? 0));

    const jobsByRun = new Map();
    const jobsFor = async (run) => {
      if (!jobsByRun.has(run.id)) {
        const jobsResponse = await fetcher(`${run.jobs_url}?per_page=100`, apiOptions);
        jobsByRun.set(
          run.id,
          jobsResponse.ok ? ((await jobsResponse.json()).jobs ?? []) : null,
        );
      }
      return jobsByRun.get(run.id);
    };

    const packages = collectWorkspacePackages(cwd);
    for (const key of required) {
      // The newest conclusive verdict is authoritative: a failure is never
      // walked past to an older green.
      let candidate = null;
      for (const run of trustedRuns) {
        const jobs = await jobsFor(run);
        if (jobs === null) break;
        const job = jobs.find((j) => j.name === E2E_JOB_NAMES[key]);
        if (!job || !CONCLUSIVE.has(job.conclusion)) continue;
        if (job.conclusion === 'success') candidate = run;
        break;
      }
      if (!candidate?.head_sha) continue;
      if (!ensureCommit(candidate.head_sha, cwd)) continue;
      const diff = tryGit(
        ['diff', '--name-only', candidate.head_sha, headSha],
        cwd,
      );
      if (diff === null) continue;
      const changedPaths = diff.split('\n').filter(Boolean);
      const relevanceDirs = relevanceDirsForSubject(
        E2E_SUITE_SUBJECTS[key],
        packages,
      );
      if (diffIrrelevantToSuite(changedPaths, relevanceDirs, packages)) {
        validated[key] = true;
      }
    }
  } catch {
    return suites();
  }
  return validated;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/release-e2e-policy.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env 2>/dev/null)"
git add scripts/release-e2e-policy.mjs scripts/release-e2e-policy.test.mjs
git commit -m "ci: add equivalence-based release E2E suite reuse primitive"
```

---

### Task 3: Wire reuse into the policy entrypoint (PR time + merge queue)

**Files:**

- Modify: `scripts/release-e2e-policy.mjs`
- Test: `scripts/release-e2e-policy.test.mjs`

**Interfaces:**

- Consumes (from Task 2): `equivalentValidatedSuites({cwd, repository, token, branch, headSha, requiredSuites, fetcher})`; test helpers already present in `scripts/release-e2e-policy.test.mjs` from Task 2 — `fakeActionsApi({runs, jobsByRun, failRuns, failJobs})` and `fakeRun(id, headSha, createdAt?)` (higher id = newer run).
- Produces:
  - `releaseBranchForMergeQueue(cwd: string): string` — the `changeset-release/*` ref name whose `origin/<ref>` tip equals `HEAD^2`, or `''`.
  - `main()` behaviour consumed by the workflow (Task 4): reads new envs `HEAD_SHA` and `HEAD_REPO` on `pull_request` events; existing `EVENT_NAME`, `HEAD_REF`, `REF_NAME`, `GITHUB_REPOSITORY`, `GH_TOKEN` unchanged. Output JSON shape unchanged.
  - REMOVES `alreadyValidatedSuites` (fully replaced; nothing else imports it — verify with `grep -rn alreadyValidatedSuites scripts/ .github/`).

- [ ] **Step 1: Rewrite the merge-queue tests for the new semantics**

In `scripts/release-e2e-policy.test.mjs`:

1. Remove `alreadyValidatedSuites` from the import list; add `releaseBranchForMergeQueue`.
2. Extend `initMergeQueueRepo` so main can move with an arbitrary file (replace the existing `advanceMainBeforeMerge` boolean and its call sites):

```js
// Build a repo shaped like a merge-queue checkout: main, a release branch
// with a version bump, and a merge commit of the branch into main (HEAD).
// Returns the branch tip so tests can point origin/changeset-release/* at it.
function initMergeQueueRepo({ advanceMainWith = '' } = {}) {
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
  if (advanceMainWith) {
    commitManifest(cwd, advanceMainWith, 'moved\n', 'main moved');
  }
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'release');
  return { cwd, branchTip };
}
```

3. Delete the old `fakeGitHub` helper and the two tests `'merge-queue skip validates suites from the native PR run'` and `'merge-queue skip fails closed'`. Replace with:

```js
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
  assert.equal(
    releaseBranchForMergeQueue(cwd),
    'changeset-release/architect',
  );
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
```

Note: `fakeActionsApi` asserts the `branch=` query param starts with `changeset-release%2F`, which these calls satisfy.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test scripts/release-e2e-policy.test.mjs`
Expected: FAIL — `releaseBranchForMergeQueue` is not exported (and the removed-import tests are gone).

- [ ] **Step 3: Implement `releaseBranchForMergeQueue`, rewire `main()`, delete `alreadyValidatedSuites`**

In `scripts/release-e2e-policy.mjs`:

1. Delete the entire `alreadyValidatedSuites` function and its doc comment. First verify nothing else references it: `grep -rn alreadyValidatedSuites scripts/ .github/` must only show the definition and `main()`.
2. Add:

```js
// Trust guard for merge-queue reuse: the queued merge's second parent must be
// the current tip of a generated release branch — never an arbitrary PR that
// happens to bump a version.
export function releaseBranchForMergeQueue(cwd) {
  const prTip = tryGit(['rev-parse', 'HEAD^2'], cwd);
  if (!prTip) return '';
  return (
    Object.keys(SUITES_BY_RELEASE_REF).find(
      (ref) => tryGit(['rev-parse', `origin/${ref}`], cwd) === prTip,
    ) ?? ''
  );
}
```

3. Replace `main()` with:

```js
async function main() {
  const eventName = process.env.EVENT_NAME ?? '';
  const policy = releaseE2EPolicy({
    eventName,
    headRef: process.env.HEAD_REF ?? '',
    refName: process.env.REF_NAME ?? '',
    baseSha: process.env.BASE_SHA ?? '',
    headSha: process.env.HEAD_SHA ?? '',
  });

  if (SUITE_KEYS.some((key) => policy[key])) {
    const cwd = process.cwd();
    const repository = process.env.GITHUB_REPOSITORY ?? '';
    let reuse = null;
    if (eventName === 'pull_request' && policy.releaseRef) {
      // Fork PRs never reuse; dispatches are explicit rerun requests and are
      // not eligible either (eventName gate above).
      if ((process.env.HEAD_REPO ?? '') === repository && process.env.HEAD_SHA) {
        reuse = { branch: policy.releaseRef, headSha: process.env.HEAD_SHA };
      }
    } else if (eventName === 'merge_group') {
      const branch = releaseBranchForMergeQueue(cwd);
      const headSha = tryGit(['rev-parse', 'HEAD'], cwd);
      if (branch && headSha) reuse = { branch, headSha };
    }
    if (reuse) {
      const validated = await equivalentValidatedSuites({
        cwd,
        repository,
        token: process.env.GH_TOKEN ?? '',
        requiredSuites: policy,
        ...reuse,
      });
      for (const key of SUITE_KEYS) {
        if (policy[key] && validated[key]) {
          policy[key] = false;
          console.error(
            `${E2E_JOB_NAMES[key]}: skipping — an earlier successful run on ${reuse.branch} validated this suite and nothing relevant to it has changed since.`,
          );
        }
      }
    }
  }

  process.stdout.write(`${JSON.stringify(policy)}\n`);
}
```

Note the pre-existing quirk this preserves: `HEAD_SHA` doubles as the merge-group head SHA input to `releaseE2EPolicy` (set from `github.event.merge_group.head_sha` on merge groups) and, after Task 4, as the PR tip on pull_request events. The two events never overlap, and `releaseE2EPolicy` ignores `headSha` outside merge groups.

- [ ] **Step 4: Run the full script test suite**

Run: `pnpm test:scripts`
Expected: PASS — all files, including the untouched detect/versioning tests.

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env 2>/dev/null)"
git add scripts/release-e2e-policy.mjs scripts/release-e2e-policy.test.mjs
git commit -m "ci: apply release E2E equivalence reuse at PR time and in the merge queue"
```

---

### Task 4: Workflow wiring and workflow tests

**Files:**

- Modify: `.github/workflows/ci-and-release.yml`
- Test: `scripts/ci-workflow.test.mjs`

**Interfaces:**

- Consumes (from Task 3): `main()` reads `HEAD_SHA` (already wired for merge groups) and the new `HEAD_REPO` env; needs the checkout to allow `git fetch origin <sha>` (anonymous fetch works — public repo — and failures fail closed).
- Produces: no new outputs; job/step names unchanged so branch protection and `quality` are unaffected.

- [ ] **Step 1: Write the failing workflow test**

Append to `scripts/ci-workflow.test.mjs`:

```js
test('e2e-policy receives the equivalence-reuse inputs', () => {
  const policyJob = job('e2e-policy');
  assert.ok(policyJob, 'e2e-policy job exists');
  assert.match(
    policyJob,
    /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.event\.merge_group\.head_sha \}\}/,
    'policy step receives the PR tip (or merge-group head) as HEAD_SHA',
  );
  assert.match(
    policyJob,
    /HEAD_REPO: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}/,
    'policy step receives the head repo for the fork guard',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/ci-workflow.test.mjs`
Expected: FAIL — `HEAD_SHA` env does not match the new expression.

- [ ] **Step 3: Update the workflow**

In `.github/workflows/ci-and-release.yml`:

1. In the `e2e-policy` job's policy step env block, replace

```yaml
          BASE_SHA: ${{ github.event.merge_group.base_sha }}
          HEAD_SHA: ${{ github.event.merge_group.head_sha }}
```

with

```yaml
          BASE_SHA: ${{ github.event.merge_group.base_sha }}
          # On PRs, HEAD_SHA is the branch tip the equivalence reuse diffs
          # against prior validated runs; on merge groups it stays the
          # group's head for release detection. HEAD_REPO guards reuse off
          # for fork PRs.
          HEAD_SHA: ${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha }}
          HEAD_REPO: ${{ github.event.pull_request.head.repo.full_name }}
```

2. Replace the `e2e-policy` job's leading comment (currently "Decides per suite whether release E2E must run for this ref: each release lane requires only the suites whose subject package ships in its deploy, and a merge-group run skips suites already validated by the native PR run on an identical tree (see scripts/release-e2e-policy.mjs).") with:

```yaml
  # Decides per suite whether release E2E must run for this ref: each release
  # lane requires only the suites whose subject package ships in its deploy,
  # and both release-PR refreshes and merge-group runs skip suites already
  # validated by an earlier native PR run whose commit differs only in paths
  # that cannot affect the suite (equivalence reuse — see
  # scripts/release-e2e-policy.mjs; every guard fails closed).
```

3. In the `carry-forward-statuses` comment, replace the sentence

```
  # E2E jobs are deliberately excluded: release PRs run all three on every
  # push and the required quality gate checks their live results; non-release
  # PRs must never inherit an E2E verdict from an earlier commit.
```

with

```
  # E2E jobs are deliberately excluded: on release PRs the e2e-policy job
  # itself decides when a refresh may skip a suite (equivalence reuse) and
  # the required quality gate checks its decision; non-release PRs must
  # never inherit an E2E verdict from an earlier commit.
```

- [ ] **Step 4: Run the workflow tests**

Run: `node --test scripts/ci-workflow.test.mjs`
Expected: PASS (including the untouched existing assertions — job names, policy flags, quality gate).

- [ ] **Step 5: Commit**

```bash
eval "$(fnm env 2>/dev/null)"
git add .github/workflows/ci-and-release.yml scripts/ci-workflow.test.mjs
git commit -m "ci: feed release E2E equivalence reuse from the pull_request event"
```

---

### Task 5: Documentation and full verification

**Files:**

- Modify: `CLAUDE.md` (the `#### Release-only E2E checks` section; `AGENTS.md` is a symlink — do not touch it separately)

**Interfaces:**

- Consumes: final behaviour from Tasks 1–4.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Update CLAUDE.md**

In the `#### Release-only E2E checks` section, replace these two paragraphs:

```
Ordinary PRs skip E2E, and E2E verdicts are never carried forward from an
earlier commit.

A merge-queue run skips a suite only in one narrow case: the queued merge
commit's tree is byte-identical to the tip of a generated release branch, and
a native pull-request run of this workflow already ran that suite successfully at that
exact SHA. Every guard fails closed (tree mismatch, non-release tip, or any
Actions-API doubt reruns the suite), so batched merge groups and moved `main`
always re-run E2E.
```

with:

```
Ordinary PRs skip E2E and never inherit an E2E verdict from an earlier
commit.

Generated release branches and their merge groups use equivalence reuse: a
suite is skipped when a prior successful native pull-request run of it exists
on the same branch and the diff since that commit touches only paths that
provably cannot affect the suite — files in workspace packages outside the
suite subject's dependency+devDependency closure, or the inert `docs/`,
`.changeset/`, `*.md` set. Every guard fails closed: an unfetchable commit,
Actions-API doubt, a fork head, a conclusive failure as the newest verdict,
or any unrecognised path (root configs, `.github/`, `scripts/`, the
lockfile) re-runs the suite. Force-pushed refreshes of a release PR after
unrelated merges to `main` therefore keep their E2E verdicts without
re-running, while any change that ships in the lane re-runs as before (see
`scripts/release-e2e-policy.mjs` and
`docs/superpowers/specs/2026-07-17-release-e2e-equivalence-reuse-design.md`).
```

- [ ] **Step 2: Full verification**

```bash
eval "$(fnm env 2>/dev/null)"
pnpm test:scripts
pnpm knip
pnpm typecheck
```

Expected: all pass. (`knip`/`typecheck` should be unaffected — scripts are plain JS and the new exports are consumed by tests — but run them because exports changed and the repo requires it before a PR.)

No changeset is needed: the change touches CI scripts, a workflow, and docs — no publishable package or gated product releases from it. `pnpm check:changesets` passes with no new changeset.

- [ ] **Step 3: Commit**

```bash
eval "$(fnm env 2>/dev/null)"
git add CLAUDE.md
git commit -m "docs: describe release E2E equivalence reuse policy"
```
