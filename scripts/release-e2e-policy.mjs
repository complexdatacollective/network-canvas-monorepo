import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SUITE_KEYS = ['interview', 'interviewer', 'architect'];

// Workspace package each E2E suite exercises. A suite gates a release lane
// only when this package ships in that lane's deploy (it is the released
// product or one of its transitive workspace `dependencies`).
export const E2E_SUITE_SUBJECTS = {
  interview: '@codaco/interview',
  interviewer: '@codaco/interviewer',
  architect: '@codaco/architect',
};

const E2E_JOB_NAMES = {
  interview: 'interview-e2e',
  interviewer: 'interviewer-e2e',
  architect: 'architect-e2e',
};

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
      // ENOENT (no package.json) means this directory is simply not a pnpm
      // workspace member — continue silently, matching pnpm's own glob
      // semantics. Any other read failure, or a parse failure on a manifest
      // that IS present, means the workspace graph is broken and must not be
      // silently treated as empty: that would misclassify every path inside
      // it as "outside every workspace package", which fails OPEN for
      // equivalence reuse. Propagate so the caller fails closed instead.
      const manifestPath = join(cwd, group, entry.name, 'package.json');
      let raw;
      try {
        raw = readFileSync(manifestPath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      let manifest;
      try {
        manifest = JSON.parse(raw);
      } catch (error) {
        throw new Error(
          `Unable to read workspace manifest ${group}/${entry.name}/package.json`,
          { cause: error },
        );
      }
      // pnpm tolerates nameless private workspace members. Such a package can
      // never be depended on, and the fail-closed diff path already treats
      // its directory as unrecognised (and therefore relevant), so skipping
      // it here does not weaken equivalence reuse.
      if (typeof manifest.name !== 'string') continue;
      packages.set(manifest.name, {
        dir: `${group}/${entry.name}`,
        // devDependencies participate: they carry Playwright configs, e2e
        // helpers, and build tooling that shape suite outcomes. peer and
        // optional edges participate too: this repo declares some workspace
        // edges (e.g. the styling/theme packages an e2e host renders with)
        // as peerDependencies rather than dependencies or devDependencies.
        // Non-workspace names harmlessly miss the package map below.
        workspaceDeps: [
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
          ...Object.keys(manifest.peerDependencies ?? {}),
          ...Object.keys(manifest.optionalDependencies ?? {}),
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
      .toSorted(
        (a, b) =>
          Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''),
      );

    const jobsByRun = new Map();
    const jobsFor = async (run) => {
      if (!jobsByRun.has(run.id)) {
        const jobsResponse = await fetcher(
          `${run.jobs_url}?per_page=100`,
          apiOptions,
        );
        if (!jobsResponse.ok) {
          jobsByRun.set(run.id, null);
        } else {
          // A run with more than one page of jobs could hide a conclusive
          // FAILURE beyond this page, letting the walk wrongly continue to an
          // older green. Treat a truncated listing as API doubt (null; fails
          // closed) rather than trusting the partial page.
          const { jobs = [], total_count: totalCount = jobs.length } =
            await jobsResponse.json();
          jobsByRun.set(run.id, totalCount > jobs.length ? null : jobs);
        }
      }
      return jobsByRun.get(run.id);
    };

    const packages = collectWorkspacePackages(cwd);
    for (const key of required) {
      // If the suite's own subject package isn't in the discovered graph, no
      // relevance judgment about it can be trusted — fail closed rather than
      // reason about a closure that's missing its own root.
      if (!packages.has(E2E_SUITE_SUBJECTS[key])) continue;
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
      // --no-renames: with rename detection on, git lists only a renamed
      // file's destination path. A relevant file moved to an inert path
      // (e.g. out of a package directory) would then vanish from the diff
      // entirely instead of surfacing its source path as changed.
      const diff = tryGit(
        ['diff', '--no-renames', '--name-only', candidate.head_sha, headSha],
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

function suites(...keys) {
  return Object.fromEntries(SUITE_KEYS.map((key) => [key, keys.includes(key)]));
}

// Which suites gate each release lane. Architect and Interviewer both bundle
// the @codaco/interview runtime, so their lanes keep interview-e2e; the
// library lane publishes packages consumed by every app and keeps all three;
// Documentation and Website ship none of the suite subjects and need no E2E.
// Hand-maintained for a simple CI hot path — release-e2e-policy.test.mjs
// derives the expected mapping from the real package.json dependency graph
// and fails when this table drifts.
export const SUITES_BY_RELEASE_REF = {
  'changeset-release/architect': suites('architect', 'interview'),
  'changeset-release/documentation': suites(),
  'changeset-release/interviewer': suites('interviewer', 'interview'),
  'changeset-release/main': suites('interview', 'interviewer', 'architect'),
  'changeset-release/website': suites(),
};

// Manifests whose version field moving in a merge group means that group is
// about to trigger the mapped lane's release when it lands on main.
const MANIFEST_LANES = [
  {
    pattern: /^packages\/[^/]+\/package\.json$/,
    ref: 'changeset-release/main',
  },
  {
    pattern: /^apps\/architect\/package\.json$/,
    ref: 'changeset-release/architect',
  },
  {
    pattern: /^apps\/interviewer\/package\.json$/,
    ref: 'changeset-release/interviewer',
  },
  {
    pattern: /^apps\/documentation\/package\.json$/,
    ref: 'changeset-release/documentation',
  },
  {
    pattern: /^apps\/networkcanvas\.com\/package\.json$/,
    ref: 'changeset-release/website',
  },
];

const VERSIONED_MANIFESTS = [
  'packages/*/package.json',
  'apps/architect/package.json',
  'apps/interviewer/package.json',
  'apps/documentation/package.json',
  'apps/networkcanvas.com/package.json',
];

export function releaseRefForEvent({ eventName, headRef, refName }) {
  const candidate =
    eventName === 'pull_request'
      ? headRef
      : eventName === 'workflow_dispatch'
        ? refName
        : '';
  return candidate in SUITES_BY_RELEASE_REF ? candidate : '';
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function readVersionAt(revision, manifest, cwd) {
  const contents = tryGit(['show', `${revision}:${manifest}`], cwd);
  if (contents === null) return null;
  try {
    const parsed = JSON.parse(contents);
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

// Union of the suites required by every versioned manifest whose version
// field changes between the merge group's base and head — i.e. by every
// release the group will trigger when it lands.
export function mergeGroupRequiredSuites(baseSha, headSha, cwd) {
  if (!baseSha || !headSha) {
    throw new Error(
      'merge_group release detection requires base and head SHAs',
    );
  }

  const changedManifests = execFileSync(
    'git',
    ['diff', '--name-only', baseSha, headSha, '--', ...VERSIONED_MANIFESTS],
    { cwd, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);

  const required = suites();
  for (const manifest of changedManifests) {
    if (
      readVersionAt(baseSha, manifest, cwd) ===
      readVersionAt(headSha, manifest, cwd)
    ) {
      continue;
    }
    const lane = MANIFEST_LANES.find(({ pattern }) => pattern.test(manifest));
    if (!lane) continue;
    for (const key of SUITE_KEYS) {
      required[key] ||= SUITES_BY_RELEASE_REF[lane.ref][key];
    }
  }
  return required;
}

export function releaseE2EPolicy(
  { eventName, headRef = '', refName = '', baseSha = '', headSha = '' },
  mergeGroupDetector = mergeGroupRequiredSuites,
) {
  const releaseRef = releaseRefForEvent({ eventName, headRef, refName });
  if (releaseRef) {
    return {
      ...SUITES_BY_RELEASE_REF[releaseRef],
      releaseRef,
      snapshotBranch: 'e2e-snapshots/main',
    };
  }

  if (eventName === 'merge_group') {
    return {
      ...mergeGroupDetector(baseSha, headSha),
      releaseRef: '',
      snapshotBranch: '',
    };
  }

  return { ...suites(), releaseRef: '', snapshotBranch: '' };
}

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
      if (
        (process.env.HEAD_REPO ?? '') === repository &&
        process.env.HEAD_SHA
      ) {
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
