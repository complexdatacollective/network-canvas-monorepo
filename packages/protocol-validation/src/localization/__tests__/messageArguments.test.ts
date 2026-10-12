import { describe, expect, it } from 'vitest';

import {
  composeMessage,
  findMessageArgumentProblem,
  findMissingPlacement,
  type MessageArguments,
  messageVariants,
  pluralCategoriesOf,
  pluralCountExamples,
  requiredArgumentsOf,
  requirePlacements,
} from '../messageArguments.ts';

/** What the Family Pedigree tracker's parents entry may use. */
const PARENTS: MessageArguments = {
  isYou: { kind: 'select', cases: ['true'] },
  name: { kind: 'text' },
  missing: { kind: 'plural' },
};

/** The interview's own English wording for it, before it became a setting. */
const PARENTS_EN =
  '{isYou, select, true {{missing, plural, one {Add your other biological parent} other {Add your biological parents}}} other {{missing, plural, one {Add another biological parent for “{name}”} other {Add biological parents for “{name}”}}}}';

describe('which messages a setting can hold', () => {
  it('accepts the arguments it declares, each as its kind says', () => {
    expect(findMessageArgumentProblem(PARENTS_EN, PARENTS)).toBeUndefined();
    expect(
      findMessageArgumentProblem(
        '{missing, plural, other {# missing}}',
        PARENTS,
      ),
    ).toBeUndefined();
  });

  it('accepts one phrase that uses no argument at all', () => {
    expect(
      findMessageArgumentProblem('Add biological parents', PARENTS),
    ).toBeUndefined();
  });

  it.each([
    ['an argument it does not declare', 'Add {relative}'],
    ['a select shown as a value', 'Add {isYou}'],
    ['a number shown as a value', 'Add {missing} parents'],
    ['a text argument used as a select', '{name, select, other {x}}'],
    ['a case it does not declare', '{isYou, select, false {x} other {y}}'],
    ['an exact plural arm', '{missing, plural, =1 {x} other {y}}'],
    ['a plural offset', '{missing, plural, offset:1 other {x}}'],
    ['an ordinal plural', '{missing, selectordinal, other {x}}'],
    ['number formatting', '{missing, number}'],
    ['a blank arm', '{isYou, select, true { } other {y}}'],
    ['broken syntax', '{isYou, select, true {x}'],
  ])('refuses %s', (_case, message) => {
    expect(findMessageArgumentProblem(message, PARENTS)).toEqual(
      expect.any(String),
    );
  });

  it('refuses every argument for a setting that declares none', () => {
    expect(findMessageArgumentProblem('Hello {name}', {})).toEqual(
      expect.stringContaining('cannot contain placeholders'),
    );
  });
});

describe('a message as its variants', () => {
  it('reads every combination of case and plural category', () => {
    expect(messageVariants(PARENTS_EN, PARENTS, 'en')).toEqual([
      {
        when: { isYou: 'true', missing: 'one' },
        parts: ['Add your other biological parent'],
      },
      {
        when: { isYou: 'true', missing: 'other' },
        parts: ['Add your biological parents'],
      },
      {
        when: { isYou: 'other', missing: 'one' },
        parts: [
          'Add another biological parent for “',
          { argument: 'name' },
          '”',
        ],
      },
      {
        when: { isYou: 'other', missing: 'other' },
        parts: ['Add biological parents for “', { argument: 'name' }, '”'],
      },
    ]);
  });

  it('has a variant for each plural category a whole number selects', () => {
    // Polish `other` is for fractions only; a count is never one.
    expect(pluralCategoriesOf('pl')).toEqual(['one', 'few', 'many']);
    expect(pluralCategoriesOf('zh-Hans')).toEqual(['other']);
    // French `many` begins at a million.
    expect(pluralCategoriesOf('fr')).toEqual(['one', 'many', 'other']);
    expect(pluralCategoriesOf('cs')).toEqual(['one', 'few', 'other']);
    expect(
      messageVariants('Add biological parents', PARENTS, 'pl'),
    ).toHaveLength(6);
  });

  it('gives examples of the counts each category is for', () => {
    expect(pluralCountExamples('fr').get('many')).toEqual([
      1_000_000, 2_000_000, 3_000_000, 10_000_000,
    ]);
    expect(pluralCountExamples('pl').get('few')).toEqual([2, 3, 4, 22]);
    expect(pluralCountExamples('pl').has('other')).toBe(false);
  });

  it('reads `#` in a plural as its number, and outside one as text', () => {
    expect(
      messageVariants('{missing, plural, other {# left}}', PARENTS, 'zh-Hans'),
    ).toEqual([
      {
        when: { isYou: 'true', missing: 'other' },
        parts: [{ argument: 'missing' }, ' left'],
      },
      {
        when: { isYou: 'other', missing: 'other' },
        parts: [{ argument: 'missing' }, ' left'],
      },
    ]);
  });
});

describe('variants written back as a message', () => {
  const roundTrip = (message: string, locale = 'en') =>
    composeMessage(messageVariants(message, PARENTS, locale), PARENTS, locale);

  it('gives back a message that reads the same in every variant', () => {
    expect(messageVariants(roundTrip(PARENTS_EN), PARENTS, 'en')).toEqual(
      messageVariants(PARENTS_EN, PARENTS, 'en'),
    );
    expect(
      findMessageArgumentProblem(roundTrip(PARENTS_EN), PARENTS),
    ).toBeUndefined();
  });

  it('writes one phrase where every variant reads the same', () => {
    expect(roundTrip('Add biological parents')).toBe('Add biological parents');
    expect(
      roundTrip('{isYou, select, true {Add parents} other {Add parents}}'),
    ).toBe('Add parents');
  });

  it('writes a choice only where its versions differ', () => {
    expect(
      roundTrip(
        '{isYou, select, true {Mine} other {{missing, plural, one {Theirs} other {Theirs}}}}',
      ),
    ).toBe('{isYou, select, true {Mine} other {Theirs}}');
  });

  it('writes the `other` ICU requires where no count selects it', () => {
    const variants = messageVariants(
      '{missing, plural, one {# rodzic} few {# rodzice} many {# rodziców} other {# rodzica}}',
      { missing: { kind: 'plural' } },
      'pl',
    );
    const message = composeMessage(
      variants,
      { missing: { kind: 'plural' } },
      'pl',
    );
    expect(message).toBe(
      '{missing, plural, one {# rodzic} few {# rodzice} many {# rodziców} other {# rodziców}}',
    );
    expect(
      findMessageArgumentProblem(message, { missing: { kind: 'plural' } }),
    ).toBeUndefined();
  });

  it('keeps a plural whose number is shown', () => {
    expect(roundTrip('{missing, plural, other {# left}}', 'zh-Hans')).toBe(
      '{missing, plural, other {# left}}',
    );
  });

  it.each([
    'Don’t {isYou, select, true {stop} other {go}}',
    "It's {name}'s turn",
    "Braces '{' and '}' stay text",
    "{missing, plural, one {'#'1 for {name}} other {# for {name}}}",
    "{missing, plural, one {it's '#'} other {# isn''t}}",
  ])('keeps the text of %s', (message) => {
    expect(findMessageArgumentProblem(message, PARENTS)).toBeUndefined();
    const composed = roundTrip(message);
    expect(findMessageArgumentProblem(composed, PARENTS)).toBeUndefined();
    expect(messageVariants(composed, PARENTS, 'en')).toEqual(
      messageVariants(message, PARENTS, 'en'),
    );
  });
});

describe('what a translation must show', () => {
  const NOTICE: MessageArguments = { count: { kind: 'plural' } };
  const NOTICE_EN =
    '{count, plural, one {Add # more person} other {Add # more people}}';
  const notice = requirePlacements(NOTICE, NOTICE_EN, 'en');
  const parents = requirePlacements(PARENTS, PARENTS_EN, 'en');

  it('requires what the original shows, in the versions it shows it', () => {
    // The English names everyone but the participant, and never the count.
    expect(parents).toEqual({
      isYou: { kind: 'select', cases: ['true'] },
      name: { kind: 'text', required: [{ isYou: 'other' }] },
      missing: { kind: 'plural' },
    });
    expect(notice).toEqual({ count: { kind: 'plural', required: [{}] } });
  });

  it('requires text only where the original shows it in every version', () => {
    expect(
      requirePlacements(
        PARENTS,
        '{missing, plural, one {Add a parent for {name}} other {Add parents}}',
        'en',
      ).name,
    ).toEqual({ kind: 'text' });
  });

  it('accepts a translation showing what it must', () => {
    expect(
      findMissingPlacement(
        '{isYou, select, true {Ajoutez vos parents} other {Ajoutez les parents de « {name} »}}',
        parents,
        'fr',
      ),
    ).toBeUndefined();
    // One phrase for everyone shows the name in every version.
    expect(
      findMissingPlacement('Ajoutez les parents de « {name} »', parents, 'fr'),
    ).toBeUndefined();
  });

  it('names the argument and the version a translation leaves it out of', () => {
    expect(
      findMissingPlacement(
        '{isYou, select, true {Ajoutez vos parents} other {Ajoutez des parents}}',
        parents,
        'fr',
      ),
    ).toEqual({
      argument: 'name',
      when: { isYou: 'other', missing: 'one' },
    });
    expect(findMissingPlacement('Ajoutez des parents', parents, 'fr')).toEqual({
      argument: 'name',
      when: { isYou: 'other', missing: 'one' },
    });
  });

  // English "one" is only 1, so "one person" says the number; Russian "one"
  // is also 21, 31 and so on, so its words cannot.
  it('lets a version for a single number leave the number out', () => {
    expect(
      findMissingPlacement(
        '{count, plural, one {Add one more person} other {Add # more people}}',
        notice,
        'en',
      ),
    ).toBeUndefined();
    expect(
      findMissingPlacement(
        '{count, plural, one {Добавьте ещё одного человека} few {Добавьте ещё # человека} many {Добавьте ещё # человек} other {Добавьте ещё # человека}}',
        notice,
        'ru',
      ),
    ).toEqual({ argument: 'count', when: { count: 'one' } });
    // French "one" is 0 and 1.
    expect(
      findMissingPlacement(
        '{count, plural, one {Ajoutez une personne} other {Ajoutez # personnes}}',
        notice,
        'fr',
      ),
    ).toEqual({ argument: 'count', when: { count: 'one' } });
  });

  it('requires nothing of a declaration without requirements', () => {
    expect(findMissingPlacement('Add people', NOTICE, 'en')).toBeUndefined();
  });

  it('lists what a version must show', () => {
    const variants = messageVariants('', notice, 'ar');
    expect(
      variants.map((variant) => [
        variant.when.count,
        requiredArgumentsOf(variant, notice, 'ar'),
      ]),
    ).toEqual([
      ['zero', []],
      ['one', []],
      ['two', []],
      ['few', ['count']],
      ['many', ['count']],
      ['other', ['count']],
    ]);
  });
});
