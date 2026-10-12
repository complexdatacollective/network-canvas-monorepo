#!/usr/bin/env node
// Reports whether this checkout is the head of the Version Packages PR
// (changeset-release/main) and, if so, which Fresco version that PR releases,
// as a single JSON line. The release-test workflow pins its expectedVersion
// from this when the caller did not pin one, so running the workflow from the
// release branch certifies without restating a version the branch already
// carries.
//
// The checkout counts as the release branch when HEAD is that branch by name,
// or when HEAD is the commit origin/changeset-release/main points at — the
// branch is usually checked out elsewhere, so a worktree testing it holds the
// same commit under another name. A release branch that does not move Fresco's
// version past main's (the PR releases other packages only) reports
// releasesFresco:false: there is no Fresco version to certify.
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

const print = (result) => process.stdout.write(`${JSON.stringify(result)}\n`);

try {
  const head = git('rev-parse', '--verify', 'HEAD^{commit}');
  const branch = tryGit('symbolic-ref', '--short', '-q', 'HEAD');
  const releaseHead = tryGit(
    'rev-parse',
    '--verify',
    '-q',
    `refs/remotes/origin/${RELEASE_BRANCH}^{commit}`,
  );
  const onReleaseBranch = branch === RELEASE_BRANCH || head === releaseHead;
  if (!onReleaseBranch) {
    print({ ok: true, onReleaseBranch: false, head, branch });
    process.exit(0);
  }

  const version = versionAt('HEAD');
  const base = tryGit('merge-base', 'HEAD', 'refs/remotes/origin/main');
  if (!version || !base) {
    print({
      ok: false,
      error: !version
        ? `HEAD has no readable version in ${MANIFEST}`
        : 'no merge base with origin/main — fetch origin and rerun',
    });
    process.exit(1);
  }
  const baseVersion = versionAt(base);
  print({
    ok: true,
    onReleaseBranch: true,
    head,
    branch,
    version,
    baseVersion,
    releasesFresco: version !== baseVersion,
  });
} catch (error) {
  print({ ok: false, error: String(error?.message ?? error).split('\n')[0] });
  process.exit(1);
}
