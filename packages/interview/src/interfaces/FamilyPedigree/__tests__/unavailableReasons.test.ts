import { describe, expect, test } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import {
  carrierRecordedReason,
  joinReasons,
  type ReasonContext,
  sexRuledOutReason,
} from '../components/unavailableReasons';
import { readFamily } from '../model';
import { config, link, person } from './fixtures';

const family = readFamily(
  [
    person('ego', { isEgo: true, sex: ['female'] }),
    person('ava', { name: 'Ava' }),
    person('ben', { name: 'Ben' }),
    person('mum', { name: 'Mum', sex: ['female'] }),
  ],
  [
    link('mum', 'ego', 'biological', { carrier: true }),
    link('ego', 'ava', 'biological', { carrier: true }),
    link('ego', 'ben', 'biological', { carrier: true }),
  ],
  config,
);

const context: ReasonContext = {
  intl: createAppIntl({ locale: 'en' }),
  family,
  displayName: (id) => family.byId.get(id)?.name ?? id,
  sexLabels: {
    female: 'Female',
    male: 'Male',
    intersex: 'Intersex',
    unknown: 'Don’t know',
    preferNotToSay: 'Prefer not to say',
  },
};

const carried = (childId: string) =>
  sexRuledOutReason(context, 'ego', { sex: 'male', childId, rule: 'carried' });

describe('joinReasons', () => {
  test('says a reason about several children once, naming them together', () => {
    expect(joinReasons(context, [carried('ava'), carried('ben')])).toBe(
      '“Male” is unavailable because you are recorded as having carried “Ava” and “Ben”, and nobody recorded as “Male” at birth can carry a pregnancy. To choose it, first change how you are connected to “Ava” and “Ben”.',
    );
  });

  test('says each sentence once, and nothing when there is no reason', () => {
    const surrogate = carrierRecordedReason('ego', 'mum', [
      { value: 'surrogate', label: 'Surrogate' },
    ]);
    expect(joinReasons(context, [surrogate, surrogate, undefined])).toBe(
      '“Surrogate” is unavailable because “Mum” is recorded as having carried you, and only one person carries a pregnancy. To choose it, first change how “Mum” is connected to you.',
    );
    expect(joinReasons(context, [undefined, false])).toBeUndefined();
  });

  test('names every answer a reason disables', () => {
    expect(
      joinReasons(context, [
        carrierRecordedReason('ego', 'mum', [
          { value: 'surrogate', label: 'Surrogate' },
          { value: 'true', label: 'Yes' },
        ]),
      ]),
    ).toMatch(/^“Surrogate” and “Yes” are unavailable because/);
  });
});
