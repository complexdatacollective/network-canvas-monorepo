import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  isNewer,
  ReleaseManifest,
  UPDATE_MANIFEST_URL,
  upgradeAppliesMigration,
} from '../manifest.ts';

const VALID = {
  version: '1.2.3',
  date: '2026-10-06T14:30:00Z',
  notes: 'https://releases.networkcanvas.com/studio/1.2.3/notes',
  migration: '0002_add_widgets',
};

const decodes = (value: unknown): boolean =>
  Effect.runSyncExit(Schema.decodeUnknownEffect(ReleaseManifest)(value))
    ._tag === 'Success';

describe('the release manifest', () => {
  it('is fetched from one https URL', () => {
    expect(new URL(UPDATE_MANIFEST_URL).protocol).toBe('https:');
  });

  it('admits the document #1910 publishes', () => {
    expect(decodes(VALID)).toBe(true);
    expect(decodes({ ...VALID, date: '2026-10-06T14:30:00.123Z' })).toBe(true);
    expect(decodes({ ...VALID, migration: '0001_initial' })).toBe(true);
  });

  it('drops a key it does not know rather than refusing the publisher’s addition', () => {
    const read = Effect.runSync(
      Schema.decodeUnknownEffect(ReleaseManifest)({
        ...VALID,
        channel: 'beta',
      }),
    );
    expect(read).toEqual(VALID);
  });

  it.each([
    ['a v-prefixed version', { version: 'v1.2.3' }],
    ['a two-part version', { version: '1.2' }],
    ['a pre-release version', { version: '1.2.3-rc.1' }],
    ['a leading zero', { version: '01.2.3' }],
    ['a date with no time', { date: '2026-10-06' }],
    ['a time with no zone', { date: '2026-10-06T14:30:00' }],
    ['a local offset', { date: '2026-10-06T14:30:00+02:00' }],
    ['a day the month does not have', { date: '2026-02-31T00:00:00Z' }],
    ['a month that does not exist', { date: '2026-13-01T00:00:00Z' }],
    ['an http link', { notes: 'http://releases.networkcanvas.com/n' }],
    ['a link that is not a URL', { notes: 'notes' }],
    ['no migration', { migration: undefined }],
    ['a migration that is not a string', { migration: 2 }],
    ['a migration with no slug', { migration: '0002' }],
    ['a migration with a short ordinal', { migration: '2_add_widgets' }],
    ['a migration with an upper-case slug', { migration: '0002_Add' }],
    ['a migration path', { migration: 'migrations/0002_add_widgets' }],
  ] as const)('refuses %s', (_name, change) => {
    expect(decodes({ ...VALID, ...change })).toBe(false);
  });
});

describe('upgradeAppliesMigration', () => {
  const release = (migration: string): ReleaseManifest => ({
    ...VALID,
    migration,
  });

  it('finds a migration when the release skipped to carries one the running build lacks, though the release itself is code-only', () => {
    // Running 1.0 (newest 0001); 1.1 added 0002; the target 1.2 added none.
    expect(
      upgradeAppliesMigration(release('0002_add_widgets'), '0001_initial'),
    ).toBe(true);
  });

  it('finds none when the release’s newest migration is the running build’s', () => {
    expect(
      upgradeAppliesMigration(release('0001_initial'), '0001_initial'),
    ).toBe(false);
  });

  it('finds one when the running build’s migrations are unknown', () => {
    expect(upgradeAppliesMigration(release('0001_initial'), null)).toBe(true);
  });
});

describe('isNewer', () => {
  it.each([
    ['1.0.1', '1.0.0'],
    ['1.1.0', '1.0.9'],
    ['2.0.0', '1.99.99'],
    ['1.10.0', '1.9.0'],
  ])('finds %s newer than %s, comparing numbers rather than text', (a, b) => {
    expect(isNewer(a, b)).toBe(true);
    expect(isNewer(b, a)).toBe(false);
  });

  it('does not find a version newer than itself', () => {
    expect(isNewer('1.2.3', '1.2.3')).toBe(false);
  });

  it.each([
    ['1.2.3-rc.1', '1.2.2'],
    ['1.2.3', '1.2.3-rc.1'],
    ['latest', '1.2.3'],
    ['1.2.4', ''],
    ['99999999999999999999.0.0', '1.0.0'],
  ])(
    'is never newer when either side is not strict x.y.z (%s over %s)',
    (a, b) => {
      expect(isNewer(a, b)).toBe(false);
    },
  );
});
