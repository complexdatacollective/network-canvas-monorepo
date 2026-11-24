import { describe, expect, it } from 'vitest';

import {
  type DynamicValueArguments,
  type DynamicValueLookup,
  type DynamicValueState,
  dynamicMessageParts,
  findDynamicMessageSyntaxProblem,
  findDynamicValueProblem,
  pluralValueExamples,
} from '../dynamicValueMessages.ts';

const VALUES: DynamicValueArguments = {
  name: {
    description: 'the "Name" attribute of the participant',
    cases: [],
    numeric: false,
    optional: true,
  },
  kind: {
    description: 'the "Kind" attribute of the participant',
    cases: ['friend', 'family'],
    numeric: false,
    optional: true,
  },
  count: {
    description: 'the "Count" attribute of the participant',
    cases: [],
    numeric: true,
    optional: true,
  },
  id: {
    description: 'the "ID" attribute of the participant',
    cases: [],
    numeric: false,
    optional: false,
  },
};

const UNKNOWN = 'This text uses a value that it cannot show.';

/**
 * A lookup that offers exactly `values`, read as own properties, and refuses
 * any other name.
 */
const lookupOf =
  (values: DynamicValueArguments): DynamicValueLookup =>
  (name) =>
    (Object.hasOwn(values, name) ? values[name] : undefined) ?? UNKNOWN;

describe('findDynamicMessageSyntaxProblem', () => {
  it('accepts arguments, selects and plurals', () => {
    expect(
      findDynamicMessageSyntaxProblem(
        '{a} {b, select, x {y} other {z}} {c, plural, one {#} other {#}}',
      ),
    ).toBeUndefined();
  });

  it('refuses formatting, unparseable text and the marker', () => {
    expect(findDynamicMessageSyntaxProblem('{a, number}')).toContain(
      'cannot format',
    );
    expect(findDynamicMessageSyntaxProblem('{a, date, short}')).toContain(
      'cannot format',
    );
    expect(findDynamicMessageSyntaxProblem('{oops')).toContain(
      'not valid message syntax',
    );
    expect(findDynamicMessageSyntaxProblem('ab')).toContain('U+E000');
    // Quoting does not hide it.
    expect(findDynamicMessageSyntaxProblem("'{''}'")).toContain('U+E000');
  });
});

describe('findDynamicMessageSyntaxProblem on blank text', () => {
  it('refuses text that is blank in every version, but not one blank version', () => {
    expect(
      findDynamicMessageSyntaxProblem('{name, select, missing {} other {}}'),
    ).toContain('blank in every version');
    // Spaces and zero-width characters show nothing either.
    expect(
      findDynamicMessageSyntaxProblem(
        '{name, select, missing { } other {{kind, select, friend {} other {\u200B}}}}',
      ),
    ).toContain('blank in every version');
    // Text only in versions no value reaches: a missing value never takes
    // an inner version for when it is present, nor the reverse.
    expect(
      findDynamicMessageSyntaxProblem(
        '{name, select, missing {{name, select, missing {} other {visible}}} other {{name, select, missing {visible} other {}}}}',
      ),
    ).toContain('blank in every version');
    expect(
      findDynamicMessageSyntaxProblem(
        '{name, select, missing {} other {{name}}}',
      ),
    ).toBeUndefined();
    expect(
      findDynamicMessageSyntaxProblem(
        '{kind, select, friend {Friend} other {{kind, select, friend {} other {}}}}',
      ),
    ).toBeUndefined();
    expect(
      findDynamicMessageSyntaxProblem('{count, plural, one {} other {#}}'),
    ).toBeUndefined();
  });

  it('judges text with many values without giving up', () => {
    // Seven values with three cases each make 78,125 combinations of what
    // they may be, more than could be read one by one.
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const blank = names
      .map((name) => `{${name}, select, x {} y {} z {} other {}}`)
      .join('');
    expect(findDynamicMessageSyntaxProblem(blank)).toContain(
      'blank in every version',
    );
    expect(
      findDynamicMessageSyntaxProblem(
        `${blank}{g, select, z {{a, select, y {visible} other {}}} other {}}`,
      ),
    ).toBeUndefined();
    // Choices on one value still agree with each other: inside the version
    // for z, the value is z.
    expect(
      findDynamicMessageSyntaxProblem(
        `${blank}{g, select, z {{g, select, z {} other {visible}}} other {}}`,
      ),
    ).toContain('blank in every version');
  });

  it('accepts wording that a select inside another chooses by a different case', () => {
    // A value that can be several cases at once (a categorical answer with
    // several options) can be z in the outer select and y in the inner one.
    expect(
      findDynamicMessageSyntaxProblem(
        '{g, select, missing {} z {{g, select, y {visible} other {}}} other {}}',
      ),
    ).toBeUndefined();
  });
});

describe('findDynamicValueProblem on a value with several cases at once', () => {
  const kinds = (
    cases: readonly string[],
    more: Partial<DynamicValueArguments[string]> = {},
  ): DynamicValueLookup =>
    lookupOf({
      kind: {
        description: 'the "Kind" attribute of the participant',
        cases,
        numeric: false,
        optional: true,
        multiple: true,
        ...more,
      },
    });

  it('reads a case in a select inside one for another case', () => {
    const message =
      '{kind, select, missing {} friend {{kind, select, family {Both} other {}}} other {}}';
    expect(
      findDynamicValueProblem(message, kinds(['friend', 'family']), 'en'),
    ).toBeUndefined();
    // A value that is one case at a time is never both.
    expect(
      findDynamicValueProblem(
        message,
        kinds(['friend', 'family'], { multiple: false }),
        'en',
      ),
    ).toContain('blank in every version');
  });

  it('chooses, in each select, the first of its cases in the order of the cases', () => {
    // A select that reads family when it also gives friend proves the value
    // is not friend, if friend comes first.
    const message =
      '{kind, select, missing {} friend {} family {{kind, select, friend {visible} other {}}} other {}}';
    expect(
      findDynamicValueProblem(message, kinds(['friend', 'family']), 'en'),
    ).toContain('blank in every version');
    expect(
      findDynamicValueProblem(message, kinds(['family', 'friend']), 'en'),
    ).toBeUndefined();
  });

  it('is at least one of its cases when they are every answer it has', () => {
    const message =
      '{kind, select, missing {} friend {} other {{kind, select, family {} other {visible}}}}';
    expect(
      findDynamicValueProblem(message, kinds(['friend', 'family']), 'en'),
    ).toBeUndefined();
    expect(
      findDynamicValueProblem(
        message,
        kinds(['friend', 'family'], { exhaustive: true }),
        'en',
      ),
    ).toContain('blank in every version');
  });
});

describe('findDynamicValueProblem', () => {
  const ok = (message: string) =>
    expect(
      findDynamicValueProblem(message, lookupOf(VALUES), 'en'),
    ).toBeUndefined();
  const refused = (message: string, problem: string) =>
    expect(findDynamicValueProblem(message, lookupOf(VALUES), 'en')).toContain(
      problem,
    );

  it('accepts literal text', () => {
    ok("Don't '{'worry'}'");
  });

  it('shows a guaranteed value anywhere', () => {
    ok('Interview {id}');
  });

  it('shows a value that can be missing only where it has one', () => {
    refused(
      'Hi {name}',
      'The "Name" attribute of the participant can be missing, so the text needs a version for when it is missing, and can show it only in its other versions.',
    );
    ok('{name, select, missing {Hi} other {Hi {name}}}');
    ok('Hi {name, select, missing {there} other {{name}}}!');
    refused(
      '{name, select, other {Hi {name}}}',
      '"Name" attribute of the participant can be missing',
    );
    refused(
      '{name, select, missing {Hi {name}} other {Hi}}',
      '"Name" attribute of the participant can be missing',
    );
  });

  it('keeps an outer guard through an inner select on the same value', () => {
    ok('{name, select, missing {none} other {{name, select, other {{name}}}}}');
    ok(
      '{name, select, missing {none} other {{name, select, missing {{name}} other {{name}}}}}',
    );
    refused(
      '{name, select, missing {none} other {Hi}} {name, select, other {{name}}}',
      '"Name" attribute of the participant can be missing',
    );
  });

  it('treats a case version as one where the value is present', () => {
    ok(
      '{kind, select, friend {Your {kind}} other {{kind, select, missing {Them} other {{kind}}}}}',
    );
    refused(
      '{kind, select, colleague {x} other {y}}',
      'This text has a version that the "Kind" attribute of the participant can never choose.',
    );
  });

  it('allows a version for when the value is missing to be blank', () => {
    ok('Hello{name, select, missing {} other {, {name}}}!');
  });

  it('refuses text that shows nothing whatever the values are', () => {
    refused('{name, select, missing {} other {}}', 'blank in every version');
  });

  it("reads only the plural versions the text's language can choose", () => {
    // English never chooses `few`, so this text shows nothing in English.
    const fewOnly =
      '{count, select, missing {} other {{count, plural, few {visible} other {}}}}';
    refused(fewOnly, 'blank in every version');
    expect(
      findDynamicValueProblem(fewOnly, lookupOf(VALUES), 'cs'),
    ).toBeUndefined();
    // A value the stage always has is never missing.
    ok('{id, select, missing {} other {Interview}}');
    // Cases the binding does not define are never chosen.
    refused(
      '{kind, select, missing {} friend {} family {} other {}}',
      'blank in every version',
    );
  });

  it('chooses by number only for a number, where it has one', () => {
    ok(
      '{count, select, missing {Some} other {{count, plural, one {# year} other {# years}}}}',
    );
    refused(
      '{count, plural, one {#} other {#}}',
      '"Count" attribute of the participant can be missing',
    );
    refused(
      '{name, select, missing {x} other {{name, plural, one {#} other {#}}}}',
      'not a number',
    );
    refused(
      '{count, select, missing {x} other {{count, plural, =1 {one} other {#}}}}',
      'not a plural category',
    );
    refused(
      '{count, select, missing {x} other {{count, selectordinal, one {#st} other {#th}}}}',
      'not a number',
    );
  });

  it('reports the problem the lookup gives for a name the text cannot use, at the first place it is used', () => {
    refused('{other}', UNKNOWN);
    refused('{constructor}', UNKNOWN);
    refused('{toString, select, missing {x} other {y}}', UNKNOWN);
    // In the order the message reads: the unguarded value comes first.
    expect(
      findDynamicValueProblem('{name} {ghost}', lookupOf(VALUES), 'en'),
    ).toContain('can be missing');
    expect(
      findDynamicValueProblem('{ghost} {name}', lookupOf(VALUES), 'en'),
    ).toBe(UNKNOWN);
  });

  it('names a value by its description in every problem about it, never by its name', () => {
    expect(
      findDynamicValueProblem(
        '{count, select, missing {x} other {{count, plural, offset:1 one {#} other {#}}}}',
        lookupOf(VALUES),
        'en',
      ),
    ).toBe(
      'The singular and plural versions for the "Count" attribute of the participant cannot use an offset.',
    );
    expect(
      findDynamicValueProblem(
        '{name, select, missing {x} other {{name, plural, one {#} other {#}}}}',
        lookupOf(VALUES),
        'en',
      ),
    ).toBe(
      'The "Name" attribute of the participant is not a number, so it cannot choose a version of the text by number.',
    );
  });

  it('chooses versions by a value it cannot show as words, but never shows it', () => {
    const values: DynamicValueArguments = {
      flag: {
        description: 'the "Flag" attribute of the participant',
        cases: ['yes'],
        numeric: false,
        optional: true,
        unshowable: 'it has no labels.',
      },
    };
    expect(
      findDynamicValueProblem(
        '{flag, select, missing {Hm.} yes {Good.} other {Hm.}}',
        lookupOf(values),
        'en',
      ),
    ).toBeUndefined();
    expect(
      findDynamicValueProblem(
        '{flag, select, missing {Hm.} yes {Said {flag}.} other {Hm.}}',
        lookupOf(values),
        'en',
      ),
    ).toBe(
      'The "Flag" attribute of the participant cannot be shown as words. It has no labels.',
    );
  });
});

describe('dynamicMessageParts', () => {
  const states =
    (map: Record<string, DynamicValueState>) =>
    (name: string): DynamicValueState =>
      map[name] ?? { missing: false };

  const message =
    '{name, select, missing {Tell us about this person.} other {Tell us about {name}.}}';

  it('takes the missing version for a missing value, and the other otherwise', () => {
    expect(
      dynamicMessageParts(message, 'en', states({ name: { missing: true } })),
    ).toEqual(['Tell us about this person.']);
    expect(dynamicMessageParts(message, 'en', states({}))).toEqual([
      'Tell us about ',
      { argument: 'name' },
      '.',
    ]);
  });

  it('takes an exact plural version before the count’s category', () => {
    const counted =
      '{count, plural, =0 {Nobody} one {One person} other {# people}}';
    const of = (count: number) =>
      dynamicMessageParts(
        counted,
        'en',
        states({ count: { missing: false, count } }),
      );
    expect(of(0)).toEqual(['Nobody']);
    expect(of(1)).toEqual(['One person']);
    expect(of(3)).toEqual([{ argument: 'count' }, ' people']);
  });

  it('takes a case version, then other', () => {
    const cased = '{kind, select, friend {A friend} other {Someone}}';
    expect(
      dynamicMessageParts(
        cased,
        'en',
        states({ kind: { missing: false, case: 'friend' } }),
      ),
    ).toEqual(['A friend']);
    expect(
      dynamicMessageParts(
        cased,
        'en',
        states({ kind: { missing: false, case: 'family' } }),
      ),
    ).toEqual(['Someone']);
    // Without a missing version, a missing value reads `other`.
    expect(
      dynamicMessageParts(cased, 'en', states({ kind: { missing: true } })),
    ).toEqual(['Someone']);
  });

  it("takes a plural version by the language's rules, with # as the value", () => {
    const plural = '{count, plural, one {# year} few {# roky} other {# years}}';
    expect(
      dynamicMessageParts(
        plural,
        'en',
        states({ count: { missing: false, count: 1 } }),
      ),
    ).toEqual([{ argument: 'count' }, ' year']);
    expect(
      dynamicMessageParts(
        plural,
        'cs',
        states({ count: { missing: false, count: 3 } }),
      ),
    ).toEqual([{ argument: 'count' }, ' roky']);
    expect(
      dynamicMessageParts(
        plural,
        'en',
        states({ count: { missing: false, count: 0 } }),
      ),
    ).toEqual([{ argument: 'count' }, ' years']);
  });

  it('never chooses the zero version for a tiny nonzero number', () => {
    const plural = '{count, plural, zero {none} other {# items}}';
    expect(
      dynamicMessageParts(
        plural,
        'ar',
        states({ count: { missing: false, count: Number.MIN_VALUE } }),
      ),
    ).toEqual([{ argument: 'count' }, ' items']);
    expect(
      dynamicMessageParts(
        plural,
        'ar',
        states({ count: { missing: false, count: 0 } }),
      ),
    ).toEqual(['none']);
  });

  it('chooses a plural version for an integer too large to be exact by its digits', () => {
    // French chooses `many` for a whole multiple of a million.
    const plural = '{count, plural, one {one} many {many} other {other}}';
    const chosen = (count: number) =>
      dynamicMessageParts(
        plural,
        'fr',
        states({ count: { missing: false, count } }),
      );
    expect(chosen(1e20)).toEqual(['many']);
    expect(chosen(-1e20)).toEqual(['many']);
    expect(chosen(1e20 + 2 ** 17)).toEqual(['other']);
    expect(chosen(1e6)).toEqual(['many']);
  });

  it('chooses a plural version for a huge integer by the digits it is shown with', () => {
    // Shown as 100000000000000020000, though its exact value ends in 16384:
    // Russian chooses `many` for a number ending in 0 and `few` for one
    // ending in 4.
    const count = 1e20 + 2 ** 14;
    expect(
      dynamicMessageParts(
        '{count, plural, one {one} few {few} many {many} other {other}}',
        'ru',
        states({ count: { missing: false, count } }),
      ),
    ).toEqual(['many']);
  });

  it('chooses a plural version by the number as it is shown', () => {
    // 1.0001 is shown with all its digits, so it is not English `one`.
    const plural = '{count, plural, one {# item} other {# items}}';
    expect(
      dynamicMessageParts(
        plural,
        'en',
        states({ count: { missing: false, count: 1.0001 } }),
      ),
    ).toEqual([{ argument: 'count' }, ' items']);
    expect(
      dynamicMessageParts(
        plural,
        'en',
        states({ count: { missing: false, count: 1 } }),
      ),
    ).toEqual([{ argument: 'count' }, ' item']);
    // Rules that read fraction digits read the ones shown: Bosnian `few`
    // holds 0.02 but not 0.0201.
    const bosnian = '{count, plural, one {a} few {b} other {c}}';
    const versionFor = (count: number) =>
      dynamicMessageParts(
        bosnian,
        'bs',
        states({ count: { missing: false, count } }),
      );
    expect(versionFor(0.02)).toEqual(['b']);
    expect(versionFor(0.0201)).toEqual(['a']);
  });

  it('reads quoted syntax as text', () => {
    expect(
      dynamicMessageParts("'{name}' is literal", 'en', states({})),
    ).toEqual(['{name} is literal']);
  });
});

describe('dynamicMessageParts with prototype names', () => {
  it('does not take a version named after Object.prototype', () => {
    expect(
      dynamicMessageParts(
        '{kind, select, constructor {A} other {B}}',
        'en',
        () => ({ missing: false, case: 'toString' }),
      ),
    ).toEqual(['B']);
  });
});

describe('pluralValueExamples', () => {
  it('reaches the categories only a fraction selects, since a number answer can hold one', () => {
    // Czech gives `many` to fractions alone, Russian `other`.
    expect(pluralValueExamples('cs').get('many')).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect([...pluralValueExamples('cs').keys()]).toEqual([
      'one',
      'few',
      'many',
      'other',
    ]);
    expect(pluralValueExamples('ru').get('other')?.[0]).toBe(0.1);
  });

  it('names each category by its plainest numbers first', () => {
    expect(pluralValueExamples('en').get('one')).toEqual([1]);
    expect(pluralValueExamples('en').get('other')?.slice(0, 3)).toEqual([
      0, 2, 3,
    ]);
  });
});
