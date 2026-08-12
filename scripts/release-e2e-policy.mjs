import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

// Each suite runs as two CI jobs: the Dockerized half that compares the
// committed pixel baselines, and the native half that runs everything else.
// A suite's verdict is the AND of both — reusing a green pixel verdict while
// the functional half was red would skip exactly the coverage that failed.
// Exported so scripts/ci-workflow.test.mjs can assert every name here is a
// real job that the quality gate requires: an exact-string mismatch here does
// not fail loudly, it silently disables verdict reuse.
export const E2E_JOB_NAMES = {
  interview: ['interview-e2e', 'interview-e2e-native'],
  interviewer: ['interviewer-e2e', 'interviewer-e2e-native'],
  architect: ['architect-e2e', 'architect-e2e-native'],
};

const FALLBACK_WORKSPACE_PATTERNS = [
  'packages/*',
  'apps/*',
  'tooling/*',
  'workers/*',
];

// Mirrors the `test` job's inert set: docs, changesets, and markdown cannot
// change what an E2E suite executes or asserts.
function isInertPath(path) {
  const segments = path.split('/');
  const filename = segments.at(-1) ?? '';
  const isPlaywrightSpec = path.includes('/e2e/specs/');

  return (
    path.startsWith('docs/') ||
    path.startsWith('.changeset/') ||
    path.endsWith('.md') ||
    (!isPlaywrightSpec && filename.includes('.test.')) ||
    filename.startsWith('vitest.') ||
    segments.includes('__tests__') ||
    path.startsWith('tooling/vitest/') ||
    path.startsWith('config/vitest/') ||
    path.includes('/config/vitest/')
  );
}

function workspacePatterns(cwd) {
  let raw;
  try {
    raw = readFileSync(join(cwd, 'pnpm-workspace.yaml'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return FALLBACK_WORKSPACE_PATTERNS;
    throw error;
  }

  const lines = raw.split(/\r?\n/);
  const packagesLine = lines.findIndex((line) =>
    /^packages:\s*(?:#.*)?$/.test(line),
  );
  if (packagesLine === -1) {
    throw new Error('pnpm-workspace.yaml must define a packages string array');
  }

  const patterns = [];
  for (const line of lines.slice(packagesLine + 1)) {
    if (/^\S/.test(line)) break;
    if (/^\s*(?:#.*)?$/.test(line)) continue;

    const item = line.match(/^\s+-\s+(.+?)\s*$/)?.[1];
    if (item === undefined) {
      throw new Error(
        'pnpm-workspace.yaml packages must be a simple string list',
      );
    }

    const doubleQuoted = item.match(/^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/);
    const singleQuoted = item.match(/^('(?:[^']|'')*')(?:\s+#.*)?$/);
    let pattern;
    if (doubleQuoted) {
      try {
        pattern = JSON.parse(doubleQuoted[1]);
      } catch (error) {
        throw new Error('Invalid quoted pnpm workspace pattern', {
          cause: error,
        });
      }
    } else if (singleQuoted) {
      pattern = singleQuoted[1].slice(1, -1).replaceAll("''", "'");
    } else {
      pattern = item.replace(/\s+#.*$/, '').trim();
    }

    if (pattern === '') {
      throw new Error('pnpm workspace patterns cannot be empty');
    }
    patterns.push(pattern);
  }

  if (patterns.length === 0) {
    throw new Error('pnpm-workspace.yaml must define a packages string array');
  }
  return patterns;
}

export function collectWorkspacePackages(cwd) {
  const packages = new Map();
  const patterns = workspacePatterns(cwd);
  const excluded = new Set(
    patterns
      .filter((pattern) => pattern.startsWith('!'))
      .flatMap((pattern) =>
        globSync(`${pattern.slice(1)}/package.json`, { cwd }),
      ),
  );
  const manifestPaths = patterns
    .filter((pattern) => !pattern.startsWith('!'))
    .flatMap((pattern) => globSync(`${pattern}/package.json`, { cwd }))
    .filter((manifestPath) => !excluded.has(manifestPath));

  for (const manifestPath of new Set(manifestPaths)) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(cwd, manifestPath), 'utf8'));
    } catch (error) {
      throw new Error(`Unable to read workspace manifest ${manifestPath}`, {
        cause: error,
      });
    }
    // pnpm tolerates nameless private workspace members. Such a package can
    // never be depended on, and the fail-closed diff path treats its directory
    // as unrecognised, so skipping it here does not weaken the policy.
    if (typeof manifest.name !== 'string') continue;
    packages.set(manifest.name, {
      dir: dirname(manifestPath).replaceAll('\\', '/'),
      // devDependencies participate: they carry Playwright configs, e2e
      // helpers, and build tooling that shape suite outcomes. Peer and
      // optional edges participate too.
      workspaceDeps: [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
      ],
    });
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

// Select each suite whose subject or workspace dependency closure contains a
// changed path. Unknown paths fail closed for every suite via
// diffIrrelevantToSuite; a missing subject fails closed for that suite because
// its relevance closure cannot be trusted.
export function affectedSuitesForPaths(changedPaths, cwd) {
  const packages = collectWorkspacePackages(cwd);
  const required = suites();
  for (const key of SUITE_KEYS) {
    const subject = E2E_SUITE_SUBJECTS[key];
    if (!packages.has(subject)) {
      required[key] = true;
      continue;
    }
    const relevanceDirs = relevanceDirsForSubject(subject, packages);
    required[key] = !diffIrrelevantToSuite(
      changedPaths,
      relevanceDirs,
      packages,
    );
  }
  return required;
}

const CONCLUSIVE = new Set(['success', 'failure', 'timed_out']);
// One bounded page per generated branch. A verdict older than this is stale
// enough that re-running is the right call anyway (fail closed past the cap).
const MAX_RUNS_SCANNED = 50;

function compareRunsNewestFirst(a, b) {
  const timeDelta =
    Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '');
  if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;
  return Number(b.id ?? 0) - Number(a.id ?? 0);
}

function completedAt(job) {
  const timestamp = Date.parse(job.completed_at ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareVerdictsNewestFirst(a, b) {
  const timeDelta = completedAt(b.job) - completedAt(a.job);
  if (timeDelta !== 0) return timeDelta;
  const jobDelta = Number(b.job.id ?? 0) - Number(a.job.id ?? 0);
  if (jobDelta !== 0) return jobDelta;
  return Number(b.run.id ?? 0) - Number(a.run.id ?? 0);
}

function ensureCommit(sha, cwd) {
  if (tryGit(['rev-parse', '--verify', `${sha}^{commit}`], cwd)) return true;
  // Force-pushed-away release tips stay fetchable by SHA on GitHub.
  tryGit(['fetch', '--depth=1', 'origin', sha], cwd);
  return tryGit(['rev-parse', '--verify', `${sha}^{commit}`], cwd) !== null;
}

// Equivalence reuse: suite S may be skipped at head H when the newest
// equivalent conclusive native pull_request verdict across generated release
// branches is a success. Each branch contributes only its newest conclusive
// verdict (a same-branch failure is never walked past); verdicts whose X→H
// diff can affect S do not describe H and are excluded. The remaining
// equivalent verdicts are ordered globally, so a newer equivalent failure on
// another release branch cannot be hidden by an older green.
//
// Every failure mode — missing input, API error, unfetchable current head,
// missing subject package, fork run, truncated jobs page — leaves the suite
// required (fail closed). Visual baselines are committed in-tree inside the
// subject packages, so the diff covers them too.
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
  if (!(branch in SUITES_BY_RELEASE_REF)) return validated;
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
    const candidateBranches = Object.entries(SUITES_BY_RELEASE_REF)
      .filter(([, laneSuites]) => required.some((key) => laneSuites[key]))
      .map(([releaseBranch]) => releaseBranch);
    const trustedRunsByBranch = new Map();
    for (const releaseBranch of candidateBranches) {
      const runsResponse = await fetcher(
        `https://api.github.com/repos/${repository}/actions/workflows/ci-and-release.yml/runs?event=pull_request&branch=${encodeURIComponent(releaseBranch)}&per_page=${MAX_RUNS_SCANNED}`,
        apiOptions,
      );
      if (!runsResponse.ok) return validated;
      const { workflow_runs: runs = [] } = await runsResponse.json();
      // Same-repo runs only: a fork branch may share the generated branch's
      // name, but its runs must never vouch for ours. Sort defensively even
      // though the API returns newest-first.
      trustedRunsByBranch.set(
        releaseBranch,
        runs
          .filter((run) => run.head_repository?.full_name === repository)
          .toSorted(compareRunsNewestFirst),
      );
    }

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
      const relevanceDirs = relevanceDirsForSubject(
        E2E_SUITE_SUBJECTS[key],
        packages,
      );
      const branchVerdicts = [];
      let jobsListingDoubt = false;
      for (const [releaseBranch, trustedRuns] of trustedRunsByBranch) {
        if (!SUITES_BY_RELEASE_REF[releaseBranch][key]) continue;
        // A rerun retains its workflow's original created_at, so inspect every
        // bounded candidate and rank conclusive suite jobs by completed_at.
        // The most recently completed verdict on each branch is authoritative:
        // a later rerun failure is never hidden by a newer-created green.
        const conclusiveVerdicts = [];
        for (const run of trustedRuns) {
          const jobs = await jobsFor(run);
          if (jobs === null) {
            jobsListingDoubt = true;
            break;
          }
          const halves = E2E_JOB_NAMES[key].map((name) =>
            jobs.find((candidate) => candidate.name === name),
          );
          // Only judge a run where EVERY half reported conclusively. A missing
          // half — a run predating the lane split, say — is not a verdict, so
          // the suite re-runs rather than inheriting a partial one.
          if (halves.some((half) => !half || !CONCLUSIVE.has(half.conclusion)))
            continue;
          if (halves.some((half) => completedAt(half) === null)) {
            jobsListingDoubt = true;
            break;
          }
          // Represent the suite by its newest-completed half so the existing
          // recency ranking is unchanged, but carry the AND of the halves'
          // conclusions: one red half fails the whole suite.
          const newestHalf = halves.toSorted(
            (a, b) => completedAt(b) - completedAt(a),
          )[0];
          const job = {
            ...newestHalf,
            conclusion: halves.every((half) => half.conclusion === 'success')
              ? 'success'
              : 'failure',
          };
          conclusiveVerdicts.push({ job, releaseBranch, run });
        }
        if (jobsListingDoubt) break;
        const newestVerdict = conclusiveVerdicts.toSorted(
          compareVerdictsNewestFirst,
        )[0];
        if (newestVerdict) branchVerdicts.push(newestVerdict);
      }
      if (jobsListingDoubt) continue;

      const equivalentVerdicts = [];
      let candidateDoubt = false;
      for (const verdict of branchVerdicts) {
        if (!verdict.run.head_sha || !ensureCommit(verdict.run.head_sha, cwd)) {
          candidateDoubt = true;
          break;
        }
        // --no-renames: with rename detection on, git lists only a renamed
        // file's destination path. A relevant file moved to an inert path
        // (e.g. out of a package directory) would then vanish from the diff
        // entirely instead of surfacing its source path as changed.
        const diff = tryGit(
          [
            'diff',
            '--no-renames',
            '--name-only',
            verdict.run.head_sha,
            headSha,
          ],
          cwd,
        );
        if (diff === null) {
          candidateDoubt = true;
          break;
        }
        const changedPaths = diff.split('\n').filter(Boolean);
        if (diffIrrelevantToSuite(changedPaths, relevanceDirs, packages)) {
          equivalentVerdicts.push(verdict);
        }
      }
      if (candidateDoubt) continue;
      const newestEquivalent = equivalentVerdicts.toSorted(
        compareVerdictsNewestFirst,
      )[0];
      validated[key] = newestEquivalent?.job.conclusion === 'success';
    }
  } catch {
    return suites();
  }
  return validated;
}

function suites(...keys) {
  return Object.fromEntries(SUITE_KEYS.map((key) => [key, keys.includes(key)]));
}

// Maximum suite set for each release lane. The normal Changesets lane versions
// libraries, Architect, and Interviewer, so it always keeps all three suites.
// Documentation and Website ship none of the suite subjects and need no E2E.
export const SUITES_BY_RELEASE_REF = {
  'changeset-release/documentation': suites(),
  'changeset-release/main': suites('interview', 'interviewer', 'architect'),
  'changeset-release/website': suites(),
};

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

// Feature PRs use their cumulative merge-base-to-head diff so every current
// head is gated by the suites the PR can affect. This deliberately does not
// use push-to-push carry-forward: an E2E verdict must describe the exact PR
// head that the required quality check is evaluating.
export function pullRequestRequiredSuites(baseSha, headSha, cwd) {
  if (!baseSha || !headSha) {
    throw new Error('feature PR E2E detection requires base and head SHAs');
  }
  const mergeBase = tryGit(['merge-base', baseSha, headSha], cwd);
  if (!mergeBase) throw new Error('Unable to resolve feature PR merge base');
  const diff = tryGit(
    ['diff', '--no-renames', '--name-only', mergeBase, headSha, '--'],
    cwd,
  );
  if (diff === null) throw new Error('Unable to read feature PR diff');
  return affectedSuitesForPaths(diff.split('\n').filter(Boolean), cwd);
}

export function releaseE2EPolicy(
  { eventName, headRef = '', refName = '', baseSha = '', headSha = '' },
  pullRequestDetector = pullRequestRequiredSuites,
) {
  const releaseRef = releaseRefForEvent({ eventName, headRef, refName });
  if (releaseRef) {
    return {
      ...SUITES_BY_RELEASE_REF[releaseRef],
      releaseRef,
      snapshotBranch: 'e2e-snapshots/main',
    };
  }

  if (eventName === 'pull_request') {
    let required;
    try {
      required = pullRequestDetector(baseSha, headSha, process.cwd());
    } catch {
      required = suites('interview', 'interviewer', 'architect');
    }
    return {
      ...required,
      releaseRef: '',
      snapshotBranch: '',
    };
  }

  return { ...suites(), releaseRef: '', snapshotBranch: '' };
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
            `${E2E_JOB_NAMES[key]}: skipping — the newest equivalent verdict across generated release branches is successful and nothing relevant to this suite has changed since.`,
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
