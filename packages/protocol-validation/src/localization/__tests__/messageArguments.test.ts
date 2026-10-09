import { describe, expect, it } from 'vitest';

import {
  composeMessage,
  findMessageArgumentProblem,
  type MessageArguments,
  messageVariants,
  pluralCategoriesOf,
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

  it('has a variant for each plural category of the language', () => {
    expect(pluralCategoriesOf('pl')).toEqual(['one', 'few', 'many', 'other']);
    expect(pluralCategoriesOf('zh-Hans')).toEqual(['other']);
    expect(
      messageVariants('Add biological parents', PARENTS, 'pl'),
    ).toHaveLength(8);
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
