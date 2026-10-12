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
//
// The release branch has already consumed the changesets it releases:
// Changesets deletes each one it versions, so the working tree no longer
// carries what the release ships. They are reported by name with the main tip
// they can still be read from, so the release test can account for them. A
// release branch whose consumed changesets cannot be listed fails, and so does
// one that still carries a changeset the normal lane owns (the merge-time
// freshness guard's own predicate): containing main's tip is not enough when
// the PR was updated by merging main rather than regenerated.
//
// Origin is only trusted as the canonical repository: anything ls-remote says
// about another remote says nothing about the Version Packages PR.
import { execFileSync, spawnSync } from 'node:child_process';

import { parseChangeset } from '../../../../scripts/release/changeset-app-utils.mjs';
import { unconsumedChangesets } from '../../../../scripts/release/check-version-packages-freshness.mjs';

const RELEASE_BRANCH = 'changeset-release/main';
const MAIN = 'main';
const MANIFEST = 'apps/fresco/package.json';
const CHANGESET_DIR = '.changeset';
// The workflow's own CHANGESET_NAME shape; a name outside it could not be
// relayed, so it fails here rather than being dropped there.
const CHANGESET_NAME = /^[\w.-]+$/;
const CANONICAL_ORIGIN =
  /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)complexdatacollective\/network-canvas-monorepo(?:\.git)?$/i;
// Set only by the tests, whose origin is a local bare repository.
const TEST_ORIGIN = process.env.RELEASE_BRANCH_TEST_ORIGIN_URL;

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

// The URL origin resolves to after any insteadOf rewriting, which is the URL
// ls-remote will actually contact.
const trustedOrigin = () => {
  const url = tryGit('ls-remote', '--get-url', 'origin');
  const trusted = TEST_ORIGIN
    ? url === TEST_ORIGIN
    : CANONICAL_ORIGIN.test(url ?? '');
  return { url, trusted };
};

const consumedChangesets = (base) => {
  const deleted = execFileSync(
    'git',
    [
      'diff',
      '--name-only',
      '--no-renames',
      '--diff-filter=D',
      '-z',
      base,
      'HEAD',
      '--',
      `${CHANGESET_DIR}/`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
    .split('\0')
    .filter(Boolean);
  const names = [];
  for (const path of deleted) {
    const file = path.slice(CHANGESET_DIR.length + 1);
    if (file.includes('/') || !file.endsWith('.md')) continue;
    const name = file.slice(0, -'.md'.length);
    if (name.toLowerCase() === 'readme') continue;
    if (!CHANGESET_NAME.test(name))
      throw new Error(
        `the release branch consumed a changeset whose name the release test cannot carry (${JSON.stringify(file)})`,
      );
    names.push(name);
  }
  return names;
};

// The changesets a committed tree carries, read as the merge-time freshness
// guard reads a checked-out one.
const changesetsAt = (rev) =>
  git('ls-tree', '-z', '--name-only', rev, `${CHANGESET_DIR}/`)
    .split('\0')
    .map((path) => path.slice(CHANGESET_DIR.length + 1))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .toSorted((a, b) => a.localeCompare(b))
    .map((file) => ({
      id: file.slice(0, -'.md'.length),
      ...parseChangeset(git('show', `${rev}:${CHANGESET_DIR}/${file}`)),
    }));

const ignoredAt = (rev) =>
  new Set(
    JSON.parse(git('show', `${rev}:${CHANGESET_DIR}/config.json`)).ignore ?? [],
  );

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
  const origin = trustedOrigin();
  if (!origin.trusted)
    fail(
      `origin resolves to ${JSON.stringify(origin.url ?? 'nothing')}, not the canonical repository complexdatacollective/network-canvas-monorepo on github.com, so it cannot identify the Version Packages PR; point origin at the canonical repository and rerun`,
    );
  const remote = remoteHeads();
  const releaseHead = remote?.get(RELEASE_BRANCH) ?? null;
  const onReleaseBranch = releaseHead !== null && head === releaseHead;
  const looksLikeReleaseBranch =
    branch === RELEASE_BRANCH || head === trackedReleaseHead;
  if (!onReleaseBranch && looksLikeReleaseBranch)
    fail(
      !remote
        ? 'could not reach origin - fetch access is required to identify the Version Packages PR; restore access to origin and rerun'
        : !releaseHead
          ? `origin has no ${RELEASE_BRANCH} - there is no Version Packages PR to test`
          : `HEAD is not origin's ${RELEASE_BRANCH} (${releaseHead.slice(0, 12)}) - this checkout is not the Version Packages PR; fetch origin, check out the PR head and rerun`,
    );
  if (!onReleaseBranch) {
    print({ ok: true, onReleaseBranch: false, head, branch });
    process.exit(0);
  }

  const mainTip = commitAt(`refs/remotes/origin/${MAIN}`);
  if (!mainTip || mainTip !== remote.get(MAIN))
    fail(
      `origin/${MAIN} is not origin's current ${MAIN} - fetch origin and rerun`,
    );
  if (!isAncestor(mainTip, head))
    fail(
      `the Version Packages PR does not contain origin/${MAIN}'s tip, so it is stale - wait for the release bot to regenerate it, then fetch origin and rerun`,
    );
  // A stale PR brought up to date by merging main, rather than regenerated,
  // contains main's tip yet still carries main's newer changesets; merged,
  // changesets/action would regenerate the PR instead of publishing it.
  const surviving = unconsumedChangesets(
    changesetsAt('HEAD'),
    ignoredAt('HEAD'),
  );
  if (surviving.length)
    fail(
      `the Version Packages PR still carries normal-lane changesets (${surviving.map(({ id }) => id).join(', ')}), so it is stale - wait for the release bot to regenerate it, then fetch origin and rerun`,
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
  const consumed = consumedChangesets(mainTip);
  if (!consumed.length)
    fail(
      `the release branch consumed no changesets from origin/${MAIN}, so nothing says what it releases`,
    );
  print({
    ok: true,
    onReleaseBranch: true,
    head,
    branch,
    version,
    baseVersion,
    releasesFresco: order > 0,
    consumedChangesets: consumed,
    consumedChangesetsAt: mainTip,
  });
} catch (error) {
  print({ ok: false, error: String(error?.message ?? error).split('\n')[0] });
  process.exit(1);
}
