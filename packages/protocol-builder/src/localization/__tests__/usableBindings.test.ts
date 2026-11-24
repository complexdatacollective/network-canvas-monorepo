import { describe, expect, it } from 'vitest';

import { testVariableId } from '../../testing/testId.ts';
import { usableBindings } from '../useDynamicValueSite.ts';

const PARTNER_NAME = testVariableId('partner_name');
const GENDER = testVariableId('gender');
const AGE = testVariableId('age');

describe('usableBindings', () => {
  const partnerName = { path: `ego.${PARTNER_NAME}` };
  const pronoun = {
    path: `ego.${GENDER}`,
    cases: { woman: 'she', man: 'he', nonbinary: 'they' },
  };

  it('reads every binding the stage holds', () => {
    expect(usableBindings({ partnerName, pronoun })).toEqual({
      partnerName,
      pronoun,
    });
  });

  // The bindings a text edit writes back are built from the ones read here,
  // so one malformed entry must not hide the others.
  it('leaves out only an entry that is not shaped like a binding', () => {
    expect(
      usableBindings({
        partnerName,
        noPath: { cases: { yes: 'a' } },
        badCase: { path: `ego.${AGE}`, cases: { old: null } },
        notARecord: `ego.${AGE}`,
        pronoun,
      }),
    ).toEqual({ partnerName, pronoun });
  });

  it.each([undefined, null, 'bindings', ['partnerName']])(
    'reads %j as no bindings',
    (value) => {
      expect(usableBindings(value)).toEqual({});
    },
  );
});
