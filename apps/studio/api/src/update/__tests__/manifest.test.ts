import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { isNewer, ReleaseManifest, UPDATE_MANIFEST_URL } from '../manifest.ts';

const VALID = {
  version: '1.2.3',
  date: '2026-10-06T14:30:00Z',
  notes: 'https://releases.networkcanvas.com/studio/1.2.3/notes',
  schemaChange: false,
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
    expect(decodes({ ...VALID, schemaChange: true })).toBe(true);
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
    ['a string for schemaChange', { schemaChange: 'false' }],
    ['no schemaChange', { schemaChange: undefined }],
  ] as const)('refuses %s', (_name, change) => {
    expect(decodes({ ...VALID, ...change })).toBe(false);
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
