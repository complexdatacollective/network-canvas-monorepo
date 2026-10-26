import { describe, expect, it } from 'vitest';

import { usableBindings } from '../useDynamicValueSite.ts';

describe('usableBindings', () => {
  const partnerName = { path: 'ego.partner_name' };
  const pronoun = {
    path: 'ego.gender',
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
        badCase: { path: 'ego.age', cases: { old: null } },
        notARecord: 'ego.age',
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
