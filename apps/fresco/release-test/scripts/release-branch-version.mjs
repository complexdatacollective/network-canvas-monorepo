#!/usr/bin/env node
// Reports whether this checkout is the head of the Version Packages PR
// (changeset-release/main) and, if so, which Fresco version that PR releases,
// as a single JSON line. The release-test workflow pins its expectedVersion
// from this when the caller did not pin one, so running the workflow from the
// release branch certifies without restating a version the branch already
// carries.
//
// The PR head is what origin says it is now (git ls-remote), never a local
// tracking ref that may predate the bot's last push. The checkout counts as the
// release branch when HEAD is that commit, whatever the local branch is called
// — the branch is usually checked out elsewhere, so a worktree testing it holds
// the same commit under another name. A checkout that looks like the release
// branch — a local branch NAMED changeset-release/main, or HEAD at the local
// origin/changeset-release/main — but is not origin's current head (stale,
// carrying local commits, or origin unreachable) is not the PR being approved
// and fails rather than certify. Anything else simply reports
// onReleaseBranch:false.
//
// On the release branch, the Fresco version is compared with origin/main's
// tip, which must match origin's main and be contained in HEAD: a PR that
// predates main's newest commit (a hotfix released since, say) is stale and
// fails. A version ahead of main's reports releasesFresco:true; the same version
// (the PR releases other packages only) reports releasesFresco:false; a version
// that moves backwards, or is not stable semver on either side, fails.
//
// Versions are read from committed trees, not the working tree. A dirty tree
// never certifies, and the commit is what the release will build.
import { execFileSync, spawnSync } from 'node:child_process';

const RELEASE_BRANCH = 'changeset-release/main';
const MAIN = 'main';
const MANIFEST = 'apps/fresco/package.json';

const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const tryGit = (...args) => {
  try {
    return git(...args) || null;
  } catch {
    return null;
  }
};

const commitAt = (rev) =>
  tryGit('rev-parse', '--verify', '-q', `${rev}^{commit}`);

// Origin's current branch heads by name, or null when origin cannot be reached.
// Never prompts for credentials, and gives up rather than hang the workflow.
const remoteHeads = () => {
  const { status, stdout } = spawnSync(
    'git',
    [
      'ls-remote',
      'origin',
      `refs/heads/${RELEASE_BRANCH}`,
      `refs/heads/${MAIN}`,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: 60_000,
    },
  );
  if (status !== 0) return null;
  const heads = new Map();
  for (const line of stdout.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (sha && ref?.startsWith('refs/heads/'))
      heads.set(ref.slice('refs/heads/'.length), sha);
  }
  return heads;
};

const isAncestor = (ancestor, descendant) => {
  const { status } = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', ancestor, descendant],
    { stdio: 'ignore' },
  );
  if (status === 0 || status === 1) return status === 0;
  throw new Error(`git merge-base --is-ancestor exited ${status}`);
};

const versionAt = (rev) => {
  const raw = tryGit('show', `${rev}:${MANIFEST}`);
  if (!raw) return null;
  const { version } = JSON.parse(raw);
  return typeof version === 'string' ? version : null;
};

const parseStable = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  return match ? match.slice(1).map(Number) : null;
};

const compareStable = (a, b) =>
  a.reduce((order, part, i) => order || Math.sign(part - b[i]), 0);

const print = (result) => process.stdout.write(`${JSON.stringify(result)}\n`);

const fail = (error) => {
  print({ ok: false, error });
  process.exit(1);
};

try {
  const head = git('rev-parse', '--verify', 'HEAD^{commit}');
  const branch = tryGit('symbolic-ref', '--short', '-q', 'HEAD');
  const trackedReleaseHead = commitAt(`refs/remotes/origin/${RELEASE_BRANCH}`);
  const remote = remoteHeads();
  const releaseHead = remote?.get(RELEASE_BRANCH) ?? null;
  const onReleaseBranch = releaseHead !== null && head === releaseHead;
  const looksLikeReleaseBranch =
    branch === RELEASE_BRANCH || head === trackedReleaseHead;
  if (!onReleaseBranch && looksLikeReleaseBranch)
    fail(
      !remote
        ? 'could not reach origin — fetch access is required to identify the Version Packages PR; restore access to origin and rerun'
        : !releaseHead
          ? `origin has no ${RELEASE_BRANCH} — there is no Version Packages PR to test`
          : `HEAD is not origin's ${RELEASE_BRANCH} (${releaseHead.slice(0, 12)}) — this checkout is not the Version Packages PR; fetch origin, check out the PR head and rerun`,
    );
  if (!onReleaseBranch) {
    print({ ok: true, onReleaseBranch: false, head, branch });
    process.exit(0);
  }

  const mainTip = commitAt(`refs/remotes/origin/${MAIN}`);
  if (!mainTip || mainTip !== remote.get(MAIN))
    fail(
      `origin/${MAIN} is not origin's current ${MAIN} — fetch origin and rerun`,
    );
  if (!isAncestor(mainTip, head))
    fail(
      `the Version Packages PR does not contain origin/${MAIN}'s tip, so it is stale — wait for the release bot to regenerate it, then fetch origin and rerun`,
    );
  const version = versionAt('HEAD');
  const baseVersion = versionAt(mainTip);
  const parsed = parseStable(version);
  const parsedBase = parseStable(baseVersion);
  if (!parsed)
    fail(`HEAD has no stable semver version in ${MANIFEST} (${version})`);
  if (!parsedBase)
    fail(
      `origin/${MAIN} has no stable semver version in ${MANIFEST} (${baseVersion})`,
    );
  const order = compareStable(parsed, parsedBase);
  if (order < 0)
    fail(
      `the release branch moves Fresco backwards, from ${baseVersion} to ${version}`,
    );
  print({
    ok: true,
    onReleaseBranch: true,
    head,
    branch,
    version,
    baseVersion,
    releasesFresco: order > 0,
  });
} catch (error) {
  print({ ok: false, error: String(error?.message ?? error).split('\n')[0] });
  process.exit(1);
}
