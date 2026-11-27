import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type Conditions,
  ConditionsSchema,
  createProtocolObjectId,
  type DynamicAttributes,
  DynamicAttributesSchema,
  dynamicValueNameFor,
  type LocaleTag,
  type LocalizationDeclaration,
  type LocalizedString,
  optionCaseKey,
  type Variable,
} from '@codaco/protocol-validation';

import { testId, testVariableId } from '../../__tests__/testIds';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import { useResolveLocalizedStringIn } from '../../localization/ProtocolLocalizationProvider';
import { DynamicMarkdown, DynamicTextParts } from '../DynamicText';
import {
  type DynamicValueSources,
  markdownSource,
} from '../resolveDynamicText';

const GENDER = testVariableId('gender');
const CHILDREN = testVariableId('children');
const AGE = testVariableId('age');
const NAME = testVariableId('name');
const WOMAN = testId('option woman');
const MAN = testId('option man');
const ADULT = testId('condition adult');

const VARIABLES: Record<string, Variable> = {
  [GENDER]: {
    name: 'gender',
    type: 'categorical',
    options: [
      { id: WOMAN, label: { en: 'Woman' }, value: 'woman' },
      { id: MAN, label: { en: 'Man' }, value: 'man' },
    ],
  },
  [CHILDREN]: { name: 'children', type: 'number' },
  [AGE]: { name: 'age', type: 'number' },
  [NAME]: { name: 'name', type: 'text' },
} as Record<string, Variable>;

const CONDITIONS: Conditions = ConditionsSchema.parse({
  [ADULT]: {
    rules: [
      {
        type: 'ego',
        id: createProtocolObjectId(),
        options: {
          attribute: AGE,
          operator: 'GREATER_THAN_OR_EQUAL',
          value: 18,
        },
      },
    ],
  },
});

const ID = {
  pronoun: testId('dynamic pronoun'),
  children: testId('dynamic children'),
  work: testId('dynamic work'),
  you: testId('dynamic you'),
  gone: testId('dynamic gone'),
  dear: testId('dynamic dear'),
  family: testId('dynamic family'),
  kidsOf: testId('dynamic kids of'),
  loose: testId('dynamic loose'),
  loopA: testId('dynamic loop a'),
  loopB: testId('dynamic loop b'),
};

const ego = (variableId: string) =>
  dynamicValueNameFor({ kind: 'attribute', role: 'ego', variableId });

const DEFINITIONS: DynamicAttributes = DynamicAttributesSchema.parse({
  [ID.pronoun]: {
    logic: 'answers',
    value: ego(GENDER),
    missing: { en: 'their', es: 'su' },
    answers: [
      { answer: optionCaseKey(WOMAN), wording: { en: 'her', es: 'su' } },
      // No Spanish: falls back to the protocol's default language.
      { answer: optionCaseKey(MAN), wording: { en: 'his' } },
    ],
    other: { en: 'their', es: 'su' },
  },
  [ID.children]: {
    logic: 'number',
    value: ego(CHILDREN),
    missing: { en: 'your children', es: 'sus hijos' },
    wording: {
      en: '{count, plural, one {# child} other {# children}}',
      es: '{count, plural, one {# hijo} other {# hijos}}',
    },
  },
  [ID.work]: {
    logic: 'conditions',
    cases: [{ condition: ADULT, when: 'met', wording: { en: 'your work' } }],
    otherwise: { en: 'your school' },
  },
  [ID.you]: {
    logic: 'participant',
    participant: { en: 'you' },
    otherwise: { en: 'this person' },
  },
  // Wording that is bold or italic and shows an attribute.
  [ID.dear]: {
    logic: 'conditions',
    cases: [
      {
        condition: ADULT,
        when: 'met',
        wording: { en: `**dear** {${ego(NAME)}}` },
      },
    ],
    otherwise: { en: `*young* {${ego(NAME)}}` },
  },
  // Wording that shows another dynamic attribute.
  [ID.family]: {
    logic: 'conditions',
    cases: [
      {
        condition: ADULT,
        when: 'met',
        wording: {
          en: `{${dynamicValueNameFor({ kind: 'dynamicAttribute', id: ID.pronoun })}} family`,
        },
      },
    ],
    otherwise: { en: 'the family' },
  },
  // Number wording whose versions show an attribute.
  [ID.kidsOf]: {
    logic: 'number',
    value: ego(CHILDREN),
    missing: { en: 'no one' },
    wording: {
      en: `{count, plural, one {# child of **{${ego(NAME)}}**} other {# children of {${ego(NAME)}}}}`,
    },
  },
  // Markup that is not closed inside the wording.
  [ID.loose]: {
    logic: 'participant',
    participant: { en: '*you' },
    otherwise: { en: '*them' },
  },
  // Two dynamic attributes whose wording shows each other.
  [ID.loopA]: {
    logic: 'participant',
    participant: { en: 'a' },
    otherwise: {
      en: `a {${dynamicValueNameFor({ kind: 'dynamicAttribute', id: ID.loopB })}}`,
    },
  },
  [ID.loopB]: {
    logic: 'participant',
    participant: { en: 'b' },
    otherwise: {
      en: `b {${dynamicValueNameFor({ kind: 'dynamicAttribute', id: ID.loopA })}}`,
    },
  },
});

const LOCALIZATION: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

const nameOf = (id: string) =>
  dynamicValueNameFor({ kind: 'dynamicAttribute', id });

function Shown({
  value,
  sources,
}: {
  value: LocalizedString;
  sources: DynamicValueSources;
}) {
  const resolveIn = useResolveLocalizedStringIn();
  return <p data-testid="shown">{resolveIn(value, sources).text}</p>;
}

/** The text as it is drawn: as plain text, or as markdown. */
function Drawn({
  value,
  sources,
  markdown,
}: {
  value: LocalizedString;
  sources: DynamicValueSources;
  markdown: boolean;
}) {
  const resolveIn = useResolveLocalizedStringIn();
  const { text, parts } = resolveIn(value, sources);
  if (parts === undefined) return <p data-testid="drawn">{text}</p>;
  return (
    <div data-testid="drawn">
      {markdown ? (
        <DynamicMarkdown parts={parts} />
      ) : (
        <DynamicTextParts parts={parts} />
      )}
    </div>
  );
}

const shown = (
  message: Readonly<Record<string, string>>,
  {
    attributes = {},
    participant,
    locale = 'en',
  }: {
    attributes?: Record<string, unknown>;
    participant?: boolean;
    locale?: LocaleTag;
  } = {},
): string => {
  const sources: DynamicValueSources = {
    intrinsics: { now: undefined },
    attributes: { ego: attributes },
    labels: {},
    conditions: CONDITIONS,
    dynamicAttributes: DEFINITIONS,
    ...(participant !== undefined && { participants: { node: participant } }),
    variablesFor: (role) => (role === 'ego' ? VARIABLES : undefined),
  };
  const { unmount } = render(
    <TestProtocolLocalization localization={LOCALIZATION} locale={locale}>
      <Shown value={message} sources={sources} />
    </TestProtocolLocalization>,
  );
  const text = screen.getByTestId('shown').textContent;
  unmount();
  return text;
};

describe('dynamic attributes in the interview', () => {
  it.each([false, true])(
    'shows the wording as the words around it, not as a value filled in (markdown: %s)',
    (markdown) => {
      const message = {
        en: `Ask about {${nameOf(ID.pronoun)}} family, as a {${ego(GENDER)}}.`,
      };
      render(
        <TestProtocolLocalization localization={LOCALIZATION}>
          <Drawn
            value={message}
            markdown={markdown}
            sources={{
              intrinsics: { now: undefined },
              attributes: { ego: { [GENDER]: ['woman'] } },
              labels: {},
              conditions: CONDITIONS,
              dynamicAttributes: DEFINITIONS,
              variablesFor: (role) => (role === 'ego' ? VARIABLES : undefined),
            }}
          />
        </TestProtocolLocalization>,
      );
      const drawn = screen.getByTestId('drawn');
      expect(drawn).toHaveTextContent('Ask about her family, as a Woman.');
      // Only the participant's answer is marked out as a value; the wording
      // that logic chose has no tint and no isolation of its own.
      const values = [...drawn.querySelectorAll('[data-dynamic-value]')];
      expect(values.map((value) => value.textContent)).toEqual(['Woman']);
      expect(
        [...drawn.querySelectorAll('bdi')].map((value) => value.textContent),
      ).toEqual(['Woman']);
    },
  );

  it('shows the wording for the answer given, and for no answer', () => {
    const message = { en: `Ask about {${nameOf(ID.pronoun)}} family.` };
    expect(shown(message, { attributes: { [GENDER]: ['woman'] } })).toBe(
      'Ask about her family.',
    );
    expect(shown(message, { attributes: { [GENDER]: ['man'] } })).toBe(
      'Ask about his family.',
    );
    expect(shown(message)).toBe('Ask about their family.');
  });

  it('shows the wording in the language of the text, else in the default language', () => {
    const message = {
      en: `About {${nameOf(ID.pronoun)}} family.`,
      es: `Sobre {${nameOf(ID.pronoun)}} familia.`,
    };
    expect(
      shown(message, { attributes: { [GENDER]: ['woman'] }, locale: 'es' }),
    ).toBe('Sobre su familia.');
    // The man's version has no Spanish wording.
    expect(
      shown(message, { attributes: { [GENDER]: ['man'] }, locale: 'es' }),
    ).toBe('Sobre his familia.');
  });

  it('formats a number’s wording with the number, in the text’s language', () => {
    const message = {
      en: `You have {${nameOf(ID.children)}}.`,
      es: `Tiene {${nameOf(ID.children)}}.`,
    };
    expect(shown(message, { attributes: { [CHILDREN]: 1 } })).toBe(
      'You have 1 child.',
    );
    expect(shown(message, { attributes: { [CHILDREN]: 3 } })).toBe(
      'You have 3 children.',
    );
    expect(
      shown(message, { attributes: { [CHILDREN]: 1 }, locale: 'es' }),
    ).toBe('Tiene 1 hijo.');
    expect(shown(message)).toBe('You have your children.');
  });

  it('chooses by a condition, and by whether the person is the participant', () => {
    const work = { en: `Tell us about {${nameOf(ID.work)}}.` };
    expect(shown(work, { attributes: { [AGE]: 40 } })).toBe(
      'Tell us about your work.',
    );
    expect(shown(work, { attributes: { [AGE]: 9 } })).toBe(
      'Tell us about your school.',
    );

    const you = { en: `Tell us about {${nameOf(ID.you)}}.` };
    expect(shown(you, { participant: true })).toBe('Tell us about you.');
    expect(shown(you, { participant: false })).toBe(
      'Tell us about this person.',
    );
  });

  it('shows nothing for a dynamic attribute that the text’s owner does not have', () => {
    expect(shown({ en: `Hello{${nameOf(ID.gone)}}!` })).toBe('Hello!');
  });
});

/** The text drawn as plain text or as markdown, with the element it is in. */
const drawn = (
  message: Readonly<Record<string, string>>,
  markdown: boolean,
  {
    attributes = {},
    participant,
  }: { attributes?: Record<string, unknown>; participant?: boolean } = {},
): HTMLElement => {
  // One drawing at a time.
  cleanup();
  render(
    <TestProtocolLocalization localization={LOCALIZATION}>
      <Drawn
        value={message}
        markdown={markdown}
        sources={{
          intrinsics: { now: undefined },
          attributes: { ego: attributes },
          labels: {},
          conditions: CONDITIONS,
          dynamicAttributes: DEFINITIONS,
          ...(participant !== undefined && {
            participants: { node: participant },
          }),
          variablesFor: (role) => (role === 'ego' ? VARIABLES : undefined),
        }}
      />
    </TestProtocolLocalization>,
  );
  return screen.getByTestId('drawn');
};

describe('the wording of a dynamic attribute in the interview', () => {
  it('shows the values that the wording shows, each filled in as a value', () => {
    const message = { en: `Hello, {${nameOf(ID.dear)}}.` };
    expect(shown(message, { attributes: { [AGE]: 40, [NAME]: 'Ann' } })).toBe(
      'Hello, dear Ann.',
    );
    expect(shown(message, { attributes: { [AGE]: 9, [NAME]: 'Ann' } })).toBe(
      'Hello, young Ann.',
    );
    const element = drawn(message, true, {
      attributes: { [AGE]: 40, [NAME]: 'Ann' },
    });
    expect(
      [...element.querySelectorAll('[data-dynamic-value]')].map(
        (value) => value.textContent,
      ),
    ).toEqual(['Ann']);
  });

  it('shows the dynamic attributes that the wording shows', () => {
    const message = { en: `Ask about {${nameOf(ID.family)}}.` };
    expect(
      shown(message, { attributes: { [AGE]: 40, [GENDER]: ['woman'] } }),
    ).toBe('Ask about her family.');
    expect(shown(message, { attributes: { [AGE]: 9 } })).toBe(
      'Ask about the family.',
    );
  });

  it('shows the number and the values in each version of number wording', () => {
    const message = { en: `You named {${nameOf(ID.kidsOf)}}.` };
    expect(
      shown(message, { attributes: { [CHILDREN]: 1, [NAME]: 'Ann' } }),
    ).toBe('You named 1 child of Ann.');
    expect(
      shown(message, { attributes: { [CHILDREN]: 3, [NAME]: 'Ann' } }),
    ).toBe('You named 3 children of Ann.');
  });

  it('draws bold and italics in formatted text, and only the words in plain text', () => {
    const message = { en: `Hello, {${nameOf(ID.dear)}}.` };
    const attributes = { [AGE]: 40, [NAME]: 'Ann' };
    const formatted = drawn(message, true, { attributes });
    expect(formatted).toHaveTextContent('Hello, dear Ann.');
    expect(formatted.querySelector('strong')?.textContent).toBe('dear');
    const plain = drawn(message, false, { attributes });
    expect(plain).toHaveTextContent('Hello, dear Ann.');
    expect(plain.querySelector('strong')).toBeNull();
    expect(plain.textContent).not.toContain('*');
    const young = drawn(message, true, {
      attributes: { [AGE]: 9, [NAME]: 'Ann' },
    });
    expect(young.querySelector('em')?.textContent).toBe('young');
  });

  it('never reads the markup of the wording with the markup around it', () => {
    // `*you` and the `*` after it would be italics if read as one text.
    const message = { en: `Ask {${nameOf(ID.loose)}} and your* family.` };
    const element = drawn(message, true, { participant: true });
    expect(element).toHaveTextContent('Ask *you and your* family.');
    expect(element.querySelector('em')).toBeNull();
  });

  it('writes the wording as markdown, with its values as text, for text read as markdown', () => {
    function Source() {
      const resolveIn = useResolveLocalizedStringIn();
      const resolved = resolveIn(
        { en: `Hello, {${nameOf(ID.dear)}}.` },
        {
          intrinsics: { now: undefined },
          attributes: { ego: { [AGE]: 40, [NAME]: '*Ann*' } },
          labels: {},
          conditions: CONDITIONS,
          dynamicAttributes: DEFINITIONS,
          variablesFor: (role) => (role === 'ego' ? VARIABLES : undefined),
        },
      );
      return <p data-testid="source">{markdownSource(resolved)}</p>;
    }
    render(
      <TestProtocolLocalization localization={LOCALIZATION}>
        <Source />
      </TestProtocolLocalization>,
    );
    expect(screen.getByTestId('source').textContent).toBe(
      'Hello, **dear** \\*Ann\\*.',
    );
  });

  it('shows nothing where wording would show a dynamic attribute already being shown', () => {
    expect(
      shown({ en: `Then {${nameOf(ID.loopA)}}.` }, { participant: false }),
    ).toBe('Then a b.');
  });
});
