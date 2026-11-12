import { describe, expect, it } from 'vitest';

import {
  EVERY_VERSION,
  composeMessage,
  findMessageArgumentProblem,
  findMissingPlacement,
  type MessageArguments,
  messageVariants,
  pluralCategoriesOf,
  pluralCountExamples,
  requiredArgumentsOf,
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

describe('what a message must show', () => {
  const NOTICE: MessageArguments = { count: { kind: 'plural' } };
  const notice: MessageArguments = {
    count: { kind: 'plural', required: EVERY_VERSION },
  };
  // Everyone but the participant is named, and the count never has to show.
  const parents: MessageArguments = {
    ...PARENTS,
    name: { kind: 'text', required: [{ isYou: 'other' }] },
  };

  // A requirement names the cases it is about and no others: a message with
  // a second select is held to it in every case of that select.
  it('requires a value in every version whose cases include the ones named', () => {
    const declaration: MessageArguments = {
      isYou: { kind: 'select', cases: ['true'] },
      current: { kind: 'select', cases: ['true'] },
      name: { kind: 'text', required: [{ isYou: 'other' }] },
    };
    expect(
      findMissingPlacement(
        '{isYou, select, true {Your partner} other {{current, select, true {{name}\u2019s partner} other {A former partner}}}}',
        declaration,
        'en',
      ),
    ).toEqual({
      argument: 'name',
      when: { isYou: 'other', current: 'other' },
    });
    expect(
      findMissingPlacement(
        '{isYou, select, true {Your partner} other {{current, select, true {{name}\u2019s partner} other {{name}\u2019s former partner}}}}',
        declaration,
        'en',
      ),
    ).toBeUndefined();
  });

  it('requires a value in every version when no case is named', () => {
    const declaration: MessageArguments = {
      isYou: { kind: 'select', cases: ['true'] },
      term: { kind: 'text', required: EVERY_VERSION },
    };
    expect(
      findMissingPlacement(
        '{isYou, select, true {Your relative} other {Their {term}}}',
        declaration,
        'en',
      ),
    ).toEqual({ argument: 'term', when: { isYou: 'true' } });
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
