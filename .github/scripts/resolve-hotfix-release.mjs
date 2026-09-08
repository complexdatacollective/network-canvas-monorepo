#!/usr/bin/env node
// Decides whether a hotfix dispatch may release the version on the checked-out
// ref, and writes `version`, `label`, `package`, `tag`, `newest` and
// `newest_tag` to $GITHUB_OUTPUT.
//
// Unlike the normal lane (.github/scripts/detect-app-release.sh), which is
// self-healing and silently skips anything it should not release, every
// rejection here is a hard error: a dispatch is a deliberate request, so
// quietly doing nothing would be the wrong answer.
//
// Rules:
//   1. Stable semver only — a hotfix is a released version, never a prerelease.
//   2. The tag must not exist yet.
//   3. The version must be newer than every released version of this app.
//      Each app has exactly one production target — a Netlify site, or an
//      external repository whose newest push is published as `latest` — so
//      publishing an older maintenance line would roll production back to
//      older code. GitHub release metadata cannot soften that, so the lane
//      refuses instead.
//   4. The commit must descend from the newest released tag. A higher version
//      number is not the same as a superset of what is live: a branch cut from
//      8.1.2 and versioned 8.1.4 passes rule 3 after 8.1.3 ships, yet its tree
//      has never seen the 8.1.3 fix, so deploying it would take that fix off
//      production while the version number moved forward.
//
// Inputs (env): APP (interviewer | architect | fresco), GITHUB_OUTPUT.
// Requires tags in the checkout (actions/checkout fetch-tags: true).
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

// Each app's release tag is `<package>@<version>`, the name the normal lane
// tags with (`apps-release-detect` in ci-and-release.yml). The Netlify apps
// are scoped packages; Fresco is the bare `fresco`, because it releases by
// mirroring into its own repository rather than publishing anywhere under the
// scope (see apps/fresco/CLAUDE.md).
const APPS = {
  interviewer: { label: 'Interviewer', pkg: '@codaco/interviewer' },
  architect: { label: 'Architect', pkg: '@codaco/architect' },
  fresco: { label: 'Fresco', pkg: 'fresco' },
};

const app = process.env.APP;
const target = APPS[app];
if (!target) {
  fail(
    `Unsupported app '${app}'. Expected one of: ${Object.keys(APPS).join(', ')}.`,
  );
}
const { label, pkg } = target;

const pkgPath = `apps/${app}/package.json`;
const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));

const STABLE = /^(\d+)\.(\d+)\.(\d+)$/;
if (!STABLE.test(version)) {
  fail(
    `${pkgPath} version '${version}' is not a stable semver. Bump it on the hotfix branch first.`,
  );
}

const tags = execFileSync('git', ['tag', '--list', `${pkg}@*`], {
  encoding: 'utf8',
})
  .split('\n')
  .map((tag) => tag.trim().slice(`${pkg}@`.length))
  .filter((candidate) => STABLE.test(candidate));

if (tags.includes(version)) {
  fail(
    `${pkg}@${version} is already released. Bump ${pkgPath} to a version that has not been tagged.`,
  );
}

const parse = (semver) => semver.match(STABLE).slice(1, 4).map(Number);
const compare = (a, b) => {
  const [left, right] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
};

const newest = tags.toSorted(compare).at(-1);
if (newest && compare(version, newest) < 0) {
  fail(
    `${version} is older than the released ${newest}. Deploying it would roll ${label} production back to older code; ` +
      `this lane only ships the newest line.`,
  );
}

if (newest) {
  const newestTag = `${pkg}@${newest}`;
  const descends =
    spawnSync('git', ['merge-base', '--is-ancestor', newestTag, 'HEAD'])
      .status === 0;
  if (!descends) {
    fail(
      `This tree does not contain ${newestTag}. Re-cut the hotfix from that tag and cherry-pick the fix: ` +
        `releasing ${version} from here would take the changes in ${newest} off production.`,
    );
  }
}

appendFileSync(
  process.env.GITHUB_OUTPUT,
  // `newest` feeds release-notes.mjs --since, so the release body also carries
  // any CHANGELOG section whose own release run was dropped while pending.
  // `newest_tag` is the ref a Fresco hotfix vendors its changed packages
  // against (scripts/mirror-app.mjs --vendor-changed-since).
  [
    `version=${version}`,
    `label=${label}`,
    `package=${pkg}`,
    `tag=${pkg}@${version}`,
    `newest=${newest ?? ''}`,
    `newest_tag=${newest ? `${pkg}@${newest}` : ''}`,
    '',
  ].join('\n'),
);
console.log(
  `[hotfix] ${label} ${version} (newest released: ${newest ?? 'none'}) — clear to release`,
);

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}
