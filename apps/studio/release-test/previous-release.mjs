// Which Studio release is the previous published one, if any (#1901 S-7).
//
//   node apps/studio/release-test/previous-release.mjs [<repository>]
//
// Prints one JSON line: {"status":"none"|"published", "newest", "tag",
// "detail"} and exits 0, or prints why it cannot tell and exits 2. run.sh
// runs Run C — the upgrade from that release to the candidate — whenever the
// status is `published`, and fails the lane if Run C did not run and pass.
//
// A Studio release is identified by its git tag, `@codaco/studio-api@<x.y.z>`,
// which the publisher creates on the released commit (#1910) beside the images
// `ghcr.io/complexdatacollective/studio-api:<x.y.z>` and `studio-web:<x.y.z>`.
// The tag is the whole question: with none there is no migration-era release
// and no registry is asked anything, so a registry that refuses an
// unauthenticated or unpublished package cannot turn the lane red. With one,
// run.sh logs in to GHCR and pulls that release's images, and any failure
// there fails the lane — a tag whose images cannot be pulled is a broken
// release, not a missing one.
//
// The repository defaults to the checkout this file is in. CI checks out with
// `fetch-depth: 0`, which fetches every tag.

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const TAG_PREFIX = '@codaco/studio-api@';
export const IMAGES = {
  api: 'ghcr.io/complexdatacollective/studio-api',
  web: 'ghcr.io/complexdatacollective/studio-web',
};

/**
 * The newest `x.y.z` among the tag names. Prereleases, and anything that is
 * not a studio-api release tag, are not releases.
 */
export function newestVersion(tags) {
  const versions = tags
    .filter((tag) => tag.startsWith(TAG_PREFIX))
    .map((tag) => tag.slice(TAG_PREFIX.length))
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
    .map((version) => ({ version, parts: version.split('.').map(Number) }))
    .sort((a, b) => {
      for (let i = 0; i < 3; i += 1) {
        if (a.parts[i] !== b.parts[i]) return b.parts[i] - a.parts[i];
      }
      return 0;
    });
  return versions[0]?.version ?? null;
}

/** The decision, from the repository's tag names. */
export function decide(tags) {
  const newest = newestVersion(tags);
  return newest === null
    ? {
        status: 'none',
        newest: null,
        tag: null,
        detail: `no ${TAG_PREFIX}<x.y.z> tag: no migration-era Studio release has been published`,
      }
    : {
        status: 'published',
        newest,
        tag: `${TAG_PREFIX}${newest}`,
        detail: `${TAG_PREFIX}${newest} is the newest release; its images are ${IMAGES.api}:${newest} and ${IMAGES.web}:${newest}`,
      };
}

/**
 * The runs a lane must perform: the ones asked for, plus C whenever a release
 * is published — an upgrade path that exists is never left untested.
 */
export function requiredRuns(requested, release) {
  const runs = requested.filter((run) => run !== '');
  return release.status === 'published' && !runs.includes('C')
    ? [...runs, 'C']
    : runs;
}

/**
 * The lane's verdict. Every run that ran must have passed, at least one must
 * have run, and a published release must have been upgraded from (run C):
 * the lane fails closed rather than report an upgrade it did not perform.
 */
export function laneVerdict({ release, runs }) {
  const ranC = runs.some((run) => run.run === 'C');
  return {
    ok:
      runs.length > 0 &&
      runs.every((run) => run.ok) &&
      (release.status !== 'published' || ranC),
    previousRelease: release.status === 'published' ? release.newest : 'none',
    runC:
      release.status === 'published'
        ? ranC
          ? 'ran'
          : 'did not run'
        : `not applicable: no migration-era release is published (no ${TAG_PREFIX}<x.y.z> tag), so there is no published upgrade path to test`,
  };
}

function main([repository]) {
  const root =
    repository ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const tags = execFileSync(
    'git',
    ['-C', root, 'tag', '--list', `${TAG_PREFIX}*`],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line !== '');
  console.log(JSON.stringify(decide(tags)));
}

// `import.meta.main`, not argv[1]: run.sh imports these with the module's path
// as an argument, which an argv comparison mistakes for running it.
if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(
      `previous-release.mjs: cannot tell whether a release is published: ${error.message}`,
    );
    process.exit(2);
  }
}
