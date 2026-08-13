#!/usr/bin/env node
// Decides whether a hotfix dispatch may release the version on the checked-out
// ref, and writes `version` + `label` to $GITHUB_OUTPUT.
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
//      Each app has exactly one production site, so `netlify deploy --prod`
//      always replaces what is live: publishing an older maintenance line would
//      roll production back to older code. GitHub release metadata cannot
//      soften that, so the lane refuses instead.
//
// Inputs (env): APP (interviewer | architect), GITHUB_OUTPUT.
// Requires tags in the checkout (actions/checkout fetch-tags: true).
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const LABELS = { interviewer: 'Interviewer', architect: 'Architect' };

const app = process.env.APP;
const label = LABELS[app];
if (!label) {
  fail(
    `Unsupported app '${app}'. Expected one of: ${Object.keys(LABELS).join(', ')}.`,
  );
}

const pkgPath = `apps/${app}/package.json`;
const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));

const STABLE = /^(\d+)\.(\d+)\.(\d+)$/;
if (!STABLE.test(version)) {
  fail(
    `${pkgPath} version '${version}' is not a stable semver. Bump it on the hotfix branch first.`,
  );
}

const tags = execFileSync('git', ['tag', '--list', `@codaco/${app}@*`], {
  encoding: 'utf8',
})
  .split('\n')
  .map((tag) => tag.trim().slice(`@codaco/${app}@`.length))
  .filter((candidate) => STABLE.test(candidate));

if (tags.includes(version)) {
  fail(
    `@codaco/${app}@${version} is already released. Bump the version on the hotfix branch.`,
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

appendFileSync(
  process.env.GITHUB_OUTPUT,
  // `newest` feeds release-notes.mjs --since, so the release body also carries
  // any CHANGELOG section whose own release run was dropped while pending.
  `version=${version}\nlabel=${label}\nnewest=${newest ?? ''}\n`,
);
console.log(
  `[hotfix] ${label} ${version} (newest released: ${newest ?? 'none'}) — clear to release`,
);

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}
