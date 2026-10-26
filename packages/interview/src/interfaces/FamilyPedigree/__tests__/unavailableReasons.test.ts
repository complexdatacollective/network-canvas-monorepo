import { describe, expect, test } from 'vitest';

import {
  carrierRecordedReason,
  joinReasons,
  type ReasonContext,
  sexConflictReason,
} from '../components/unavailableReasons';
import { readFamily } from '../model';
import { config, link, person } from './fixtures';
import { pedigreeWordsIn } from './pedigreeWords';

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
  words: pedigreeWordsIn(),
  family,
  displayName: (id) => family.byId.get(id)?.name ?? id,
  sexLabels: {
    female: 'Female',
    male: 'Male',
    intersex: 'Intersex',
    unknown: 'Don’t know',
    preferNotToSay: 'Prefer not to say',
  },
  formatList: (items) =>
    new Intl.ListFormat('en', { type: 'conjunction' }).format(items),
};

const surrogateCarried = (childId: string) =>
  sexConflictReason(context, 'ego', {
    sex: 'male',
    childId,
    rule: 'surrogate',
  });
const carried = (childId: string) =>
  sexConflictReason(context, 'ego', {
    sex: 'male',
    childId,
    rule: 'carried',
    linkId: `ego-${childId}-biological`,
  });

describe('joinReasons', () => {
  test('says a reason about several children once, naming them together', () => {
    expect(
      joinReasons(context, [surrogateCarried('ava'), surrogateCarried('ben')]),
    ).toBe(
      '“Male” is unavailable because you are recorded as having carried Ava and Ben, and nobody recorded as “Male” at birth can carry a pregnancy. To choose it, first change how you are connected to Ava and Ben.',
    );
    expect(joinReasons(context, [carried('ava'), carried('ben')])).toBe(
      'You are recorded as having carried Ava and Ben, and nobody recorded as “Male” at birth can carry a pregnancy. If you save, you will no longer be recorded as having carried Ava and Ben.',
    );
  });

  test('says a conflict about the participant once, not again for their siblings', () => {
    const sameSexAs = (childId: string) =>
      sexConflictReason(context, 'new', {
        rule: 'sameSexGeneticParent',
        sex: 'female',
        childId,
        coParentId: 'mum',
      });
    expect(
      joinReasons(context, [
        sameSexAs('ava'),
        sameSexAs('ego'),
        sameSexAs('ben'),
      ]),
    ).toBe(
      'This person and “Mum” are both your genetic parents, and “Mum” is also recorded as “Female” at birth. Nobody has two genetic parents of the same sex at birth, so if you save, the sex at birth of “Mum” will be cleared for you to answer again.',
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
    ).toMatch(/^Surrogate and Yes are unavailable because/);
  });
});
