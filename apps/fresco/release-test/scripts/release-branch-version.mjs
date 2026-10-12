#!/usr/bin/env node
// Reports whether this checkout is the head of the Version Packages PR
// (changeset-release/main) and, if so, which Fresco version that PR releases,
// as a single JSON line. The release-test workflow pins its expectedVersion
// from this when the caller did not pin one, so running the workflow from the
// release branch certifies without restating a version the branch already
// carries.
//
// The checkout counts as the release branch when HEAD is the commit
// origin/changeset-release/main points at, whatever the local branch is called
// — the branch is usually checked out elsewhere, so a worktree testing it holds
// the same commit under another name. A local branch NAMED changeset-release/main
// whose HEAD is not that commit (stale, or carrying local commits) is not the PR
// being approved, and neither is one whose tracking ref was never fetched; both
// fail rather than certify. A release branch that leaves Fresco's version where
// main has it (the PR releases other packages only) reports
// releasesFresco:false: there is no Fresco version to certify. A version that is
// not stable semver on either side, or that moves backwards, fails.
//
// Versions are read from committed trees, not the working tree. A dirty tree
// never certifies, and the commit is what the release will build.
import { execFileSync } from 'node:child_process';

const RELEASE_BRANCH = 'changeset-release/main';
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
  const releaseHead = tryGit(
    'rev-parse',
    '--verify',
    '-q',
    `refs/remotes/origin/${RELEASE_BRANCH}^{commit}`,
  );
  if (branch === RELEASE_BRANCH && head !== releaseHead)
    fail(
      releaseHead
        ? `HEAD is not origin/${RELEASE_BRANCH} — this checkout is not the Version Packages PR; reset it to the PR head and rerun`
        : `origin/${RELEASE_BRANCH} is unknown — fetch origin and rerun`,
    );
  const onReleaseBranch = releaseHead !== null && head === releaseHead;
  if (!onReleaseBranch) {
    print({ ok: true, onReleaseBranch: false, head, branch });
    process.exit(0);
  }

  const version = versionAt('HEAD');
  const base = tryGit('merge-base', 'HEAD', 'refs/remotes/origin/main');
  if (!base) fail('no merge base with origin/main — fetch origin and rerun');
  const baseVersion = versionAt(base);
  const parsed = parseStable(version);
  const parsedBase = parseStable(baseVersion);
  if (!parsed)
    fail(`HEAD has no stable semver version in ${MANIFEST} (${version})`);
  if (!parsedBase)
    fail(
      `the merge base with origin/main has no stable semver version in ${MANIFEST} (${baseVersion})`,
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
