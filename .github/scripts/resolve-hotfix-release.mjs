#!/usr/bin/env node
// Decides whether a hotfix or maintenance dispatch may release the version on
// the checked-out ref, and writes `version`, `label`, `package`, `tag`,
// `newest` and `newest_tag` to $GITHUB_OUTPUT.
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
//   5. For a mirrored app, the mirrored repository must not be ahead of the
//      tags: its version is what is live, and the normal lane pushes it before
//      it tags (rule 5 is checked only when the workflow supplies it).
//
// SCOPE=line is the maintenance lane
// (.github/workflows/app-maintenance-release.yml, for Architect and
// Interviewer): a patch to an OLDER major
// line, such as 8.5.1 once 9.x is production. Nothing it releases is deployed
// — Architect 8 and Interviewer 8 reach users as a tarball the next major
// bundles at /v8/ — so rules 3 and 4 are scoped to the version's own major
// line instead:
//   3a. The line must already have a release, and the version must be newer
//       than every release on it.
//   3b. The version's major must be LOWER than the newest release overall.
//       A maintenance tag that became the newest overall would leave
//       production (the normal lane's site) behind its own newest tag, and
//       app-release-guard.sh would then skip every later release from main,
//       whose tree does not contain it. The newest line releases through the
//       normal or hotfix lane.
//   4a. The commit must descend from the newest release on the line, for the
//       reason rule 4 gives.
// `newest` and `newest_tag` then name the line's newest release, so the
// release notes run --since the previous release on that line.
//
// Inputs (env): APP (interviewer | architect | fresco), GITHUB_OUTPUT,
// MIRROR_VERSION (optional: the version the mirrored repository's main
// carries), SCOPE (optional: `line` for a maintenance lane; Architect and
// Interviewer).
// Requires tags in the checkout (actions/checkout fetch-tags: true).
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

// Each app's release tag is `<package>@<version>`, the name the normal lane
// tags with (`apps-release-detect` in ci-and-release.yml). The Netlify apps
// are scoped packages; Fresco is the bare `fresco`, because it releases by
// mirroring into its own repository rather than publishing anywhere under the
// scope (see apps/fresco/CLAUDE.md).
//
// `maintenance` names the lane an app's older major lines release through,
// for the apps whose older line still reaches users inside the newer app.
const APPS = {
  interviewer: {
    label: 'Interviewer',
    pkg: '@codaco/interviewer',
    maintenance: 'App Maintenance Release workflow (app: interviewer)',
  },
  architect: {
    label: 'Architect',
    pkg: '@codaco/architect',
    maintenance: 'App Maintenance Release workflow (app: architect)',
  },
  fresco: { label: 'Fresco', pkg: 'fresco' },
};

const app = process.env.APP;
const target = APPS[app];
if (!target) {
  fail(
    `Unsupported app '${app}'. Expected one of: ${Object.keys(APPS).join(', ')}.`,
  );
}
const { label, pkg, maintenance } = target;

// Only Architect and Interviewer have a maintenance lane: an older line of
// either still reaches users inside the newer app, while Fresco has exactly
// one production target and nowhere for an older line to go.
const scope = process.env.SCOPE ?? '';
if (scope !== '' && scope !== 'line') {
  fail(`Unsupported SCOPE '${scope}'. Expected 'line' or nothing.`);
}
const lineScope = scope === 'line';
if (lineScope && !maintenance) {
  fail(
    `SCOPE=line is a maintenance lane; ${label} has no older line to maintain.`,
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

const majorOf = (semver) => parse(semver)[0];
const sorted = tags.toSorted(compare);
const newestOverall = sorted.at(-1);
const lineNewest = sorted
  .filter((candidate) => majorOf(candidate) === majorOf(version))
  .at(-1);
// The release this one must supersede: the newest overall for a hotfix, the
// newest on the version's own major line for a maintenance release.
const newest = lineScope ? lineNewest : newestOverall;

if (lineScope) {
  if (!lineNewest) {
    fail(
      `${pkg} has no ${majorOf(version)}.x release to maintain. A new major line starts in the normal lane.`,
    );
  }
  if (compare(version, lineNewest) <= 0) {
    fail(
      `${version} is not newer than ${lineNewest}, the newest ${majorOf(version)}.x release. ` +
        `Bump ${pkgPath} past it on the maintenance branch.`,
    );
  }
  if (majorOf(version) >= majorOf(newestOverall)) {
    fail(
      `${version} is on the newest ${label} line (newest released: ${newestOverall}). ` +
        `That line releases through the normal lane or the Hotfix Release workflow, which deploy it to production; ` +
        `the maintenance lane only ships an older major line.`,
    );
  }
} else if (newest && compare(version, newest) < 0) {
  fail(
    `${version} is older than the released ${newest}. Deploying it would roll ${label} production back to older code; ` +
      `this lane only ships the newest line.` +
      (maintenance
        ? ` An older ${label} major line releases through the ${maintenance} instead.`
        : ''),
  );
}

// What is live for Fresco is the Fresco repository's own tree, and the normal
// lane pushes it (and creates its release there) BEFORE it tags here, so a
// run that failed between the two leaves a release these tags do not record.
// A hotfix cut from the newest TAG would then append older code over it and
// make the older image the next `latest`. The workflow reads the version that
// repository's main carries and passes it here; a mirror ahead of the tags is
// refused until the tag is reconciled.
const mirrorVersion = process.env.MIRROR_VERSION;
if (mirrorVersion) {
  if (!STABLE.test(mirrorVersion)) {
    fail(
      `MIRROR_VERSION '${mirrorVersion}' is not a stable semver; the version read from the mirrored repository should be.`,
    );
  }
  if (!newest || compare(mirrorVersion, newest) > 0) {
    fail(
      `The mirrored repository carries ${mirrorVersion} but the newest ${pkg}@ tag here is ${newest ?? 'none'}: a release was pushed without its tag. ` +
        `Re-run the normal lane for main so it tags what it mirrored, or tag ${pkg}@${mirrorVersion} on the commit that produced it, before re-dispatching.`,
    );
  }
}

if (newest) {
  const newestTag = `${pkg}@${newest}`;
  const descends =
    spawnSync('git', ['merge-base', '--is-ancestor', newestTag, 'HEAD'])
      .status === 0;
  if (!descends) {
    fail(
      lineScope
        ? `This tree does not contain ${newestTag}, the newest ${majorOf(version)}.x release. Re-cut the maintenance branch from that tag and cherry-pick the fix: ` +
            `releasing ${version} from here would drop the changes in ${newest} from the ${majorOf(version)}.x line.`
        : `This tree does not contain ${newestTag}. Re-cut the hotfix from that tag and cherry-pick the fix: ` +
            `releasing ${version} from here would take the changes in ${newest} off production.`,
    );
  }
}

appendFileSync(
  process.env.GITHUB_OUTPUT,
  // `newest` feeds release-notes.mjs --since, so the release body also carries
  // any CHANGELOG section whose own release run was dropped while pending. In
  // the line scope it is the newest release on the version's own line.
  // `newest_tag` is the ref a Fresco hotfix vendors its changed packages
  // against (scripts/release/mirror-app.mjs --vendor-changed-since).
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
  lineScope
    ? `[maintenance] ${label} ${version} (newest ${majorOf(version)}.x: ${newest}; newest overall: ${newestOverall}) — clear to release`
    : `[hotfix] ${label} ${version} (newest released: ${newest ?? 'none'}) — clear to release`,
);

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}
