import { Schema } from 'effect';

import { MIGRATION_VERSION } from '../db/migrations-document.ts';

// The release manifest Studio's daily update check reads (#1901). #1901 defines
// the shape and #1910's publisher conforms to it: a publisher that emits
// anything this schema refuses makes every instance's check settle as
// "suppressed", so the document below is the contract, not a description of it.

/**
 * The one place a Studio instance contacts for update information. Fixed in
 * code, not configurable (Josh's 14 Sep 2026 ruling): an institution that does
 * not want it blocks the host at its firewall. `docs/self-host/outbound-hosts.txt`
 * lists the host, and `self-host-docs.test.ts` binds this constant to that list.
 */
export const UPDATE_MANIFEST_URL =
  'https://releases.networkcanvas.com/studio/manifest.json';

// Strict `x.y.z`: no leading zeros, no `v` prefix, no pre-release or build
// suffix. A version this refuses is one #1910 would not publish.
const STRICT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// An ISO-8601 UTC datetime with a `Z` designator and optional milliseconds,
// e.g. `2026-10-06T14:30:00Z`. UTC and a full time, not a bare date, because
// the value is stored as a `timestamptz` and a date alone would leave the
// instant to a guess.
const UTC_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * Regex alone admits `2026-02-31T00:00:00Z`, which `Date` silently moves to
 * March. The instant must read back as the text that named it.
 */
const isRealInstant = Schema.makeFilter<string>(
  (value) => {
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) return 'a real calendar date and time';
    const [wholeSeconds, fraction = ''] = value.slice(0, -1).split('.');
    const expected = `${wholeSeconds}.${fraction.padEnd(3, '0')}Z`;
    return instant.toISOString() === expected
      ? undefined
      : 'a real calendar date and time';
  },
  { expected: 'a real calendar date and time' },
);

const isHttpsUrl = Schema.makeFilter<string>(
  (value) =>
    URL.canParse(value) && new URL(value).protocol === 'https:'
      ? undefined
      : 'an https URL',
  { expected: 'an https URL' },
);

/**
 * What the published manifest must carry.
 *
 * `migration` is the newest migration version at this release: the newest
 * `NNNN_slug` directory under `apps/studio/api/migrations/`. The manifest does
 * not say whether the release changes the database, because that is a
 * property of the upgrade, not of the release: an instance on 1.0 upgrading
 * to a code-only 1.2 still applies the migration 1.1 added. Only the instance
 * knows where it starts, so the instance compares (`upgradeAppliesMigration`).
 *
 * `version` is `@codaco/studio-api`'s version, the one `STUDIO_VERSION` and
 * `/api/v1/status` report, because that is what an instance compares it with.
 * The Studio lane versions its packages independently (`studio-web` and
 * `studio-api` ship as separate images), so a publisher that emitted
 * `studio-web`'s version would be comparing two unrelated lines. A release
 * that changes only `studio-web` is announced by the publisher also bumping
 * `studio-api`: a release that leaves `studio-api` where it was is not newer
 * than the running version, so it produces no notice and no email.
 *
 * Keys it does not know are dropped rather than refused, so the publisher can
 * add one without breaking instances already deployed.
 */
export const ReleaseManifest = Schema.Struct({
  version: Schema.String.check(Schema.isPattern(STRICT_VERSION)),
  date: Schema.String.check(Schema.isPattern(UTC_DATETIME)).check(
    isRealInstant,
  ),
  notes: Schema.String.check(isHttpsUrl),
  migration: Schema.String.check(Schema.isPattern(MIGRATION_VERSION)),
});
export type ReleaseManifest = typeof ReleaseManifest.Type;

function parts(version: string): readonly [number, number, number] | null {
  const match = STRICT_VERSION.exec(version);
  if (!match) return null;
  const numbers = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ] as const;
  return numbers.every(Number.isSafeInteger) ? numbers : null;
}

/**
 * Whether `candidate` is a later release than `running`. Both must be strict
 * `x.y.z`; anything else is "not newer", because a notice that cannot compare
 * is worse than none.
 */
export function isNewer(candidate: string, running: string): boolean {
  const latest = parts(candidate);
  const current = parts(running);
  if (latest === null || current === null) return false;
  for (const index of [0, 1, 2] as const) {
    if (latest[index] !== current[index]) return latest[index] > current[index];
  }
  return false;
}

/**
 * Whether upgrading this instance to `manifest`'s release applies at least one
 * migration, which decides what rolling the upgrade back means: restoring the
 * backup taken during the upgrade rather than redeploying the previous image.
 * `runningMigration` is the newest migration of the build that is running.
 * Migrations only ever accrue, so for a newer release the two newest versions
 * differ exactly when the release carries one this build does not, however
 * many releases the upgrade skips. A running build whose
 * migrations could not be read (`null`) answers yes, because the safe
 * rollback advice is the one that keeps the backup.
 */
export function upgradeAppliesMigration(
  manifest: ReleaseManifest,
  runningMigration: string | null,
): boolean {
  return runningMigration === null || manifest.migration !== runningMigration;
}
