import { describe, expect, it } from 'vitest';

import {
  type DynamicValueArguments,
  type DynamicValueState,
  dynamicMessageParts,
  findDynamicMessageSyntaxProblem,
  findDynamicValueProblem,
  findMissingDynamicPlacement,
  TOO_MANY_DYNAMIC_VERSIONS,
} from '../dynamicValueMessages.ts';

const VALUES: DynamicValueArguments = {
  name: { cases: [], numeric: false, optional: true },
  kind: { cases: ['friend', 'family'], numeric: false, optional: true },
  count: { cases: [], numeric: true, optional: true },
  id: { cases: [], numeric: false, optional: false },
};

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
    // Choices on one value still agree with each other.
    expect(
      findDynamicMessageSyntaxProblem(
        `${blank}{g, select, z {{g, select, y {visible} other {}}} other {}}`,
      ),
    ).toContain('blank in every version');
  });
});

describe('findDynamicValueProblem', () => {
  const ok = (message: string) =>
    expect(findDynamicValueProblem(message, VALUES, 'en')).toBeUndefined();
  const refused = (message: string, problem: string) =>
    expect(findDynamicValueProblem(message, VALUES, 'en')).toContain(problem);

  it('accepts literal text', () => {
    ok("Don't '{'worry'}'");
  });

  it('shows a guaranteed value anywhere', () => {
    ok('Interview {id}');
  });

  it('shows a value that can be missing only where it has one', () => {
    refused('Hi {name}', '"name" can be missing');
    ok('{name, select, missing {Hi} other {Hi {name}}}');
    ok('Hi {name, select, missing {there} other {{name}}}!');
    refused('{name, select, other {Hi {name}}}', '"name" can be missing');
    refused(
      '{name, select, missing {Hi {name}} other {Hi}}',
      '"name" can be missing',
    );
  });

  it('keeps an outer guard through an inner select on the same value', () => {
    ok('{name, select, missing {none} other {{name, select, other {{name}}}}}');
    ok(
      '{name, select, missing {none} other {{name, select, missing {{name}} other {{name}}}}}',
    );
    refused(
      '{name, select, missing {none} other {Hi}} {name, select, other {{name}}}',
      '"name" can be missing',
    );
  });

  it('treats a case version as one where the value is present', () => {
    ok(
      '{kind, select, friend {Your {kind}} other {{kind, select, missing {Them} other {{kind}}}}}',
    );
    refused('{kind, select, colleague {x} other {y}}', '"colleague" is not');
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
    expect(findDynamicValueProblem(fewOnly, VALUES, 'cs')).toBeUndefined();
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
    refused('{count, plural, one {#} other {#}}', '"count" can be missing');
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

  it('does not take a name from Object.prototype for a value', () => {
    refused('{constructor}', '"constructor" is not a value');
    refused(
      '{toString, select, missing {x} other {y}}',
      '"toString" is not a value',
    );
  });

  it('names an unbound value', () => {
    refused('{other}', '"other" is not a value this text can show here');
    expect(findDynamicValueProblem('{x}', {}, 'en')).toContain(
      'No values are available here.',
    );
  });

  it('chooses versions by a value it cannot show as words, but never shows it', () => {
    const values: DynamicValueArguments = {
      flag: {
        cases: ['yes'],
        numeric: false,
        optional: true,
        unshowable: 'it has no labels.',
      },
    };
    expect(
      findDynamicValueProblem(
        '{flag, select, missing {Hm.} yes {Good.} other {Hm.}}',
        values,
        'en',
      ),
    ).toBeUndefined();
    expect(
      findDynamicValueProblem(
        '{flag, select, missing {Hm.} yes {Said {flag}.} other {Hm.}}',
        values,
        'en',
      ),
    ).toBe('"flag" cannot be shown as words: it has no labels.');
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

describe('findMissingDynamicPlacement', () => {
  const english =
    '{name, select, missing {Tell us about them.} other {Tell us about {name}.}}';

  it('accepts a translation that shows the value in the same versions', () => {
    expect(
      findMissingDynamicPlacement(
        english,
        'en',
        '{name, select, missing {Parlez-nous d’eux.} other {Parlez-nous de {name}.}}',
        'fr',
        VALUES,
      ),
    ).toBeUndefined();
  });

  it('names the value and the version a translation drops it from', () => {
    expect(
      findMissingDynamicPlacement(
        english,
        'en',
        '{name, select, missing {Parlez-nous d’eux.} other {Parlez-nous de cette personne.}}',
        'fr',
        VALUES,
      ),
    ).toEqual({ argument: 'name', when: { name: 'other' } });
  });

  it('needs nothing where the original shows nothing', () => {
    expect(
      findMissingDynamicPlacement(
        'Hello',
        'en',
        '{name, select, missing {Bonjour} other {Bonjour {name}}}',
        'fr',
        VALUES,
      ),
    ).toBeUndefined();
  });

  it('compares a case version with the same case', () => {
    const original =
      '{kind, select, missing {Them} friend {Your friend, {kind}} other {Them}}';
    expect(
      findMissingDynamicPlacement(
        original,
        'en',
        '{kind, select, missing {Eux} other {Eux}}',
        'fr',
        VALUES,
      ),
    ).toEqual({ argument: 'kind', when: { kind: 'friend' } });
  });

  it('asks nothing of a version no answer reaches', () => {
    // Every answer has a version of its own, so `other` is never shown.
    const values = {
      kind: {
        cases: ['friend', 'family'],
        numeric: false,
        optional: true,
        exhaustive: true,
      },
    };
    const original =
      '{kind, select, missing {Them} friend {Friend} family {Family} other {{kind}}}';
    const translation =
      '{kind, select, missing {Eux} friend {Ami} family {Famille} other {Eux}}';
    expect(
      findMissingDynamicPlacement(original, 'en', translation, 'fr', values),
    ).toBeUndefined();
    expect(
      findMissingDynamicPlacement(original, 'en', translation, 'fr', {
        kind: { ...values.kind, exhaustive: false },
      }),
    ).toEqual({ argument: 'kind', when: { kind: 'other' } });
  });

  it('checks a number’s fraction versions too', () => {
    // Czech gives fractions a version of their own (`many`).
    expect(
      findMissingDynamicPlacement(
        '{count, select, missing {?} other {{count} years}}',
        'en',
        '{count, select, missing {?} other {{count, plural, one {# rok} few {# roky} many {roku} other {# let}}}}',
        'cs',
        VALUES,
      ),
    ).toEqual({ argument: 'count', when: { count: '0.1' } });
  });

  it('compares every pair of versions the two languages give one number', () => {
    // The Arabic shows the count only in `other`; the Bosnian leaves it out
    // only in `few`. Only some numbers are both (102, 0.02), and the first
    // few examples of each category miss them all.
    expect(
      findMissingDynamicPlacement(
        '{count, select, missing {?} other {{count, plural, zero {none} one {one} two {two} few {few} many {many} other {# items}}}}',
        'ar',
        '{count, select, missing {?} other {{count, plural, one {# item} few {some items} other {# items}}}}',
        'bs',
        VALUES,
      ),
    ).toEqual({ argument: 'count', when: { count: '102' } });
  });

  it('waives a zero-only version only where the translation reaches that plural', () => {
    // Arabic `zero` holds only 0. The original shows the count only for
    // zero; the translation has a plural for it, but only in its version
    // for a friend.
    const original =
      '{kind, select, friend {Hi} other {{count, select, missing {Hi} other {{count, plural, zero {# people} other {Hi}}}}}}';
    const translation =
      '{kind, select, friend {{count, select, missing {Hi} other {{count, plural, zero {nobody} other {Hi}}}}} other {Hi}}';
    expect(
      findMissingDynamicPlacement(original, 'ar', translation, 'ar', VALUES),
    ).toMatchObject({ argument: 'count', when: { count: '0' } });
    // Where the version does go through the plural, "nobody" is fine.
    expect(
      findMissingDynamicPlacement(
        '{count, select, missing {Hi} other {{count, plural, zero {# people} other {# people}}}}',
        'ar',
        '{count, select, missing {Hi} other {{count, plural, zero {nobody} other {# people}}}}',
        'ar',
        VALUES,
      ),
    ).toBeUndefined();
  });

  it('does not waive a zero-only category the translation falls back to `other` for', () => {
    // Welsh `zero` holds only 0, but this translation writes no `zero` arm:
    // at 0 it reads its `other` version, written for many numbers, which
    // leaves out the count the Arabic shows for zero.
    expect(
      findMissingDynamicPlacement(
        '{count, select, missing {?} other {{count, plural, zero {#} other {none}}}}',
        'ar',
        '{count, select, missing {?} other {{count, plural, other {none}}}}',
        'cy',
        VALUES,
      ),
    ).toEqual({ argument: 'count', when: { count: '0' } });
    // A `zero` arm of its own may leave the number out.
    expect(
      findMissingDynamicPlacement(
        '{count, select, missing {?} other {{count, plural, zero {#} other {none}}}}',
        'ar',
        '{count, select, missing {?} other {{count, plural, zero {dim} other {none}}}}',
        'cy',
        VALUES,
      ),
    ).toBeUndefined();
  });

  it('does not waive a version that also holds a negative number', () => {
    // A number answer can be negative, and English `one` holds -1 as well
    // as 1, so "one item" would also be shown for -1.
    expect(
      findMissingDynamicPlacement(
        '{count, select, missing {No items} other {{count, plural, one {# item} other {# items}}}}',
        'en',
        '{count, select, missing {No items} other {{count, plural, one {one item} other {# items}}}}',
        'en',
        VALUES,
      ),
    ).toEqual({ argument: 'count', when: { count: '1' } });
  });

  it('refuses to accept what it has too many versions to check', () => {
    const many: DynamicValueArguments = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [
        `v${index}`,
        { cases: ['a', 'b'], numeric: false, optional: true },
      ]),
    );
    const message = Object.keys(many)
      .map((name) => `{${name}, select, missing {-} other {{${name}}}}`)
      .join(' ');
    expect(
      findMissingDynamicPlacement(message, 'en', message, 'fr', many),
    ).toBe(TOO_MANY_DYNAMIC_VERSIONS);
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
