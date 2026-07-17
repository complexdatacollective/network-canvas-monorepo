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

// Merge-queue fast path: a release PR's branch head was already fully
// E2E-validated by the native pull_request run fired when the branch was
// created/updated (the required `quality` check means the PR could not have
// been enqueued otherwise). When the queue's merge commit has the SAME TREE
// as that branch tip — main did not move and nothing else was batched — the
// queue would re-run the suites against byte-identical code, so each suite
// whose PR job succeeded on that exact SHA can be skipped.
//
// Every guard fails closed (the suite runs):
//  * the merge commit's tree must equal its second parent's (the PR tip's);
//  * the PR tip must be the current head of a generated changeset-release/*
//    branch, so only trusted generated branches — never an arbitrary PR that
//    happens to bump a version — can satisfy the fast path;
//  * the succeeded job must belong to a pull_request run of THIS
//    workflow at that SHA, looked up via the Actions API; any API error
//    counts as not validated.
export async function alreadyValidatedSuites({
  cwd,
  repository,
  token,
  fetcher = fetch,
}) {
  const validated = suites();

  const headTree = tryGit(['rev-parse', 'HEAD^{tree}'], cwd);
  const prTip = tryGit(['rev-parse', 'HEAD^2'], cwd);
  const prTree = tryGit(['rev-parse', 'HEAD^2^{tree}'], cwd);
  if (!headTree || !prTip || !prTree || headTree !== prTree) {
    return validated;
  }

  const isReleaseBranchTip = Object.keys(SUITES_BY_RELEASE_REF).some(
    (ref) => tryGit(['rev-parse', `origin/${ref}`], cwd) === prTip,
  );
  if (!isReleaseBranchTip) return validated;
  if (!repository || !token) return validated;

  const apiOptions = {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
    },
  };
  try {
    const runsResponse = await fetcher(
      `https://api.github.com/repos/${repository}/actions/workflows/ci-and-release.yml/runs?event=pull_request&head_sha=${prTip}&per_page=100`,
      apiOptions,
    );
    if (!runsResponse.ok) return validated;
    const { workflow_runs: runs = [] } = await runsResponse.json();

    for (const run of runs) {
      const jobsResponse = await fetcher(
        `${run.jobs_url}?per_page=100`,
        apiOptions,
      );
      if (!jobsResponse.ok) continue;
      const { jobs = [] } = await jobsResponse.json();
      for (const job of jobs) {
        if (job.conclusion !== 'success') continue;
        for (const key of SUITE_KEYS) {
          if (job.name === E2E_JOB_NAMES[key]) validated[key] = true;
        }
      }
    }
  } catch {
    return suites();
  }
  return validated;
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

  if (eventName === 'merge_group' && SUITE_KEYS.some((key) => policy[key])) {
    const validated = await alreadyValidatedSuites({
      cwd: process.cwd(),
      repository: process.env.GITHUB_REPOSITORY ?? '',
      token: process.env.GH_TOKEN ?? '',
    });
    for (const key of SUITE_KEYS) {
      if (policy[key] && validated[key]) {
        policy[key] = false;
        console.error(
          `${E2E_JOB_NAMES[key]}: skipping — this merge group's tree is identical to a release branch tip it already passed on.`,
        );
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
