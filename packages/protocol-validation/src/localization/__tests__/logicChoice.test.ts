import { describe, expect, it } from 'vitest';

import { testId, testVariableId } from '../../__tests__/testIds.ts';
import {
  type DynamicAttribute,
  logicOfDynamicAttribute,
} from '../../schemas/9/dynamic-attributes.ts';
import {
  dynamicValueNameFor,
  optionCaseKey,
} from '../../schemas/9/dynamic-value-names.ts';
import {
  type ContentLogic,
  printContentDocument,
  readContentDocument,
} from '../contentDocument.ts';
import { fieldBlockMarkdown } from '../fieldBlock.ts';
import {
  chooseVersion,
  type LogicInputs,
  type LogicValue,
  shownContent,
  shownFieldIds,
} from '../logicChoice.ts';

const CONDITION_A = testId('condition-a');
const CONDITION_B = testId('condition-b');
const FRIEND_ID = testId('friend');
const FAMILY_ID = testId('family');

const A = dynamicValueNameFor({ kind: 'condition', conditionId: CONDITION_A });
const B = dynamicValueNameFor({ kind: 'condition', conditionId: CONDITION_B });
const KIND = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: testVariableId('kind'),
});
const COUNT = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: testVariableId('children'),
});
const PARTICIPANT = dynamicValueNameFor({ kind: 'participant', role: 'node' });

const KIND_VARIABLE = {
  options: [
    { id: FRIEND_ID, value: 'friend' },
    { id: FAMILY_ID, value: 'family' },
  ],
};

const MISSING: LogicValue = { missing: true };

/** What logic reads: the conditions met, and each value by its name. */
const inputs = ({
  met = [],
  values = {},
  locale = 'en',
}: {
  met?: readonly string[];
  values?: Readonly<Record<string, LogicValue>>;
  locale?: string;
}): LogicInputs => ({
  conditionMet: (conditionId) => met.includes(conditionId),
  valueOf: (name) => values[name] ?? MISSING,
  locale,
});

const logicOf = (message: string): ContentLogic => {
  const [block] = readContentDocument(message).nodes;
  if (block?.kind !== 'logic') throw new Error('Not a logic block');
  return block.logic;
};

const shown = (message: string, given: LogicInputs) =>
  printContentDocument(chooseVersion(logicOf(message), given).content);

describe('chooseVersion: logic blocks', () => {
  const rows = `{${A}, select, true {First.} other {{${B}, select, false {Second.} other {Third.}}}}`;

  it('shows the first version of a conditions block whose condition is as the version asks', () => {
    expect(shown(rows, inputs({ met: [CONDITION_A] }))).toBe('First.');
    expect(shown(rows, inputs({ met: [CONDITION_A, CONDITION_B] }))).toBe(
      'First.',
    );
    // B is not met, which the second version asks for.
    expect(shown(rows, inputs({}))).toBe('Second.');
    expect(shown(rows, inputs({ met: [CONDITION_B] }))).toBe('Third.');
  });

  it('reads a condition whose result is not known as not met', () => {
    expect(
      shown(rows, {
        ...inputs({}),
        conditionMet: () => undefined,
      }),
    ).toBe('Second.');
  });

  const answers = `{${KIND}, select, missing {No answer.} ${optionCaseKey(FRIEND_ID)} {A friend.} other {Someone.}}`;

  it('shows the version of an answers block for the answer', () => {
    const answered = (value: unknown) =>
      shown(
        answers,
        inputs({
          values: {
            [KIND]: { missing: false, value, variable: KIND_VARIABLE },
          },
        }),
      );
    expect(answered('friend')).toBe('A friend.');
    expect(answered('family')).toBe('Someone.');
    // Of several answers, the first option with a version is chosen.
    expect(answered(['family', 'friend'])).toBe('A friend.');
    expect(shown(answers, inputs({}))).toBe('No answer.');
  });

  it('shows the version for true or false of a Boolean attribute', () => {
    const message = `{${KIND}, select, missing {Unknown.} true {Yes.} false {No.} other {Other.}}`;
    const answered = (value: boolean) =>
      shown(message, inputs({ values: { [KIND]: { missing: false, value } } }));
    expect(answered(true)).toBe('Yes.');
    expect(answered(false)).toBe('No.');
  });

  const number = `{${COUNT}, select, missing {No number.} other {{${COUNT}, plural, one {# child} few {# kids} other {# children}}}}`;

  it('shows the version of a number block for the plural category of the number in the text’s language', () => {
    const counted = (value: unknown, locale = 'en') =>
      chooseVersion(
        logicOf(number),
        inputs({ values: { [COUNT]: { missing: false, value } }, locale }),
      ).content;
    // Each `#` shows the number, as the value the block is on: the version
    // is shown outside the plural, where `#` would be only text.
    expect(printContentDocument(counted(1))).toBe(`{${COUNT}} child`);
    expect(printContentDocument(counted(3))).toBe(`{${COUNT}} children`);
    // Czech has a category for a few; English does not.
    expect(printContentDocument(counted(3, 'cs'))).toBe(`{${COUNT}} kids`);
    expect(printContentDocument(counted('three'))).toBe('No number.');
    expect(shown(number, inputs({}))).toBe('No number.');
  });

  it('shows the version of a participant block for the participant', () => {
    const message = `{${PARTICIPANT}, select, true {You.} other {Them.}}`;
    expect(
      shown(
        message,
        inputs({ values: { [PARTICIPANT]: { missing: false, value: true } } }),
      ),
    ).toBe('You.');
    expect(
      shown(
        message,
        inputs({ values: { [PARTICIPANT]: { missing: false, value: false } } }),
      ),
    ).toBe('Them.');
    expect(shown(message, inputs({}))).toBe('Them.');
  });
});

describe('shownContent', () => {
  const { nodes } = readContentDocument(
    [
      'Intro.',
      '',
      fieldBlockMarkdown('first'),
      '',
      `{${A}, select, true {${fieldBlockMarkdown('shown when met')}} other {{${B}, select, true {${fieldBlockMarkdown('shown when B')}} other {Nothing.}}}}`,
      '',
      fieldBlockMarkdown('last'),
    ].join('\n'),
  );
  const blocks = (given: LogicInputs) =>
    shownContent(nodes, given).map((block) => [
      block.kind === 'field' ? block.fieldId : printContentDocument([block]),
      block.at.join('.'),
    ]);

  it('lists the blocks that the document shows, each with its place', () => {
    expect(blocks(inputs({ met: [CONDITION_A] }))).toEqual([
      ['Intro.', '0'],
      ['first', '1'],
      ['shown when met', '2.0.0'],
      ['last', '3'],
    ]);
    expect(blocks(inputs({ met: [CONDITION_B] }))).toEqual([
      ['Intro.', '0'],
      ['first', '1'],
      ['shown when B', '2.1.0'],
      ['last', '3'],
    ]);
    expect(blocks(inputs({}))).toEqual([
      ['Intro.', '0'],
      ['first', '1'],
      ['Nothing.', '2.2.0'],
      ['last', '3'],
    ]);
  });

  it('gives each run of markdown the nodes that the document reads', () => {
    const [intro] = shownContent(nodes, inputs({}));
    expect(intro?.kind === 'markdown' && intro.nodes).toBe(
      nodes[0]?.kind === 'markdown' && nodes[0].nodes,
    );
  });
});

describe('shownFieldIds', () => {
  it('lists the fields of a document in order, with those of the version each logic block shows', () => {
    const { nodes } = readContentDocument(
      [
        'Intro.',
        '',
        fieldBlockMarkdown('first'),
        '',
        `{${A}, select, true {${fieldBlockMarkdown('shown when met')}} other {{${B}, select, true {${fieldBlockMarkdown('shown when B')}} other {Nothing.}}}}`,
        '',
        fieldBlockMarkdown('last'),
      ].join('\n'),
    );
    expect(shownFieldIds(nodes, inputs({ met: [CONDITION_A] }))).toEqual([
      'first',
      'shown when met',
      'last',
    ]);
    expect(shownFieldIds(nodes, inputs({ met: [CONDITION_B] }))).toEqual([
      'first',
      'shown when B',
      'last',
    ]);
    expect(shownFieldIds(nodes, inputs({}))).toEqual(['first', 'last']);
  });
});

describe('chooseVersion: dynamic attributes', () => {
  const chooseFor = (definition: DynamicAttribute, given: LogicInputs) =>
    chooseVersion(logicOfDynamicAttribute(definition), given);
  const en = (text: string) => ({ en: text });

  it('chooses the wording of the first case whose condition is as it asks', () => {
    const definition: DynamicAttribute = {
      logic: 'conditions',
      cases: [
        { condition: CONDITION_A, when: 'met', wording: en('first') },
        { condition: CONDITION_B, when: 'notMet', wording: en('second') },
      ],
      otherwise: en('otherwise'),
    };
    const choose = (met: readonly string[]) =>
      chooseFor(definition, inputs({ met }));
    expect(choose([CONDITION_A])).toEqual({
      kind: 'version',
      content: en('first'),
    });
    expect(choose([])).toEqual({ kind: 'version', content: en('second') });
    expect(choose([CONDITION_B])).toEqual({
      kind: 'version',
      content: en('otherwise'),
    });
  });

  it('chooses the wording for the answer, for no answer, or for any other answer', () => {
    const definition: DynamicAttribute = {
      logic: 'answers',
      value: KIND,
      missing: en('them'),
      answers: [
        { answer: optionCaseKey(FRIEND_ID), wording: en('your friend') },
      ],
      other: en('your relative'),
    };
    const choose = (value: LogicValue) =>
      chooseFor(definition, inputs({ values: { [KIND]: value } }));
    expect(
      choose({ missing: false, value: 'friend', variable: KIND_VARIABLE }),
    ).toEqual({ kind: 'version', content: en('your friend') });
    expect(
      choose({ missing: false, value: 'family', variable: KIND_VARIABLE }),
    ).toEqual({ kind: 'version', content: en('your relative') });
    expect(choose(MISSING)).toEqual({ kind: 'version', content: en('them') });
  });

  it('gives a number its plural wording and the number, and no number the wording for none', () => {
    const definition: DynamicAttribute = {
      logic: 'number',
      value: COUNT,
      missing: en('your children'),
      wording: en('{count, plural, one {your child} other {your # children}}'),
    };
    expect(
      chooseFor(
        definition,
        inputs({ values: { [COUNT]: { missing: false, value: 2 } } }),
      ),
    ).toEqual({ kind: 'counted', content: definition.wording, count: 2 });
    expect(chooseFor(definition, inputs({}))).toEqual({
      kind: 'version',
      content: en('your children'),
    });
  });

  it('chooses the wording for the participant or for anyone else', () => {
    const definition: DynamicAttribute = {
      logic: 'participant',
      participant: en('you'),
      otherwise: en('they'),
    };
    expect(
      chooseFor(
        definition,
        inputs({ values: { [PARTICIPANT]: { missing: false, value: true } } }),
      ),
    ).toEqual({ kind: 'version', content: en('you') });
    expect(chooseFor(definition, inputs({}))).toEqual({
      kind: 'version',
      content: en('they'),
    });
  });
});

describe('chooseVersion: one choice for both kinds of logic', () => {
  const en = (text: string) => ({ en: text });

  it('chooses the same version of a logic block and of a dynamic attribute with the same logic', () => {
    const block = logicOf(
      `{${A}, select, true {first} other {{${B}, select, false {second} other {otherwise}}}}`,
    );
    const attribute = logicOfDynamicAttribute({
      logic: 'conditions',
      cases: [
        { condition: CONDITION_A, when: 'met', wording: en('first') },
        { condition: CONDITION_B, when: 'notMet', wording: en('second') },
      ],
      otherwise: en('otherwise'),
    });
    for (const met of [
      [],
      [CONDITION_A],
      [CONDITION_B],
      [CONDITION_A, CONDITION_B],
    ]) {
      const given = inputs({ met });
      expect(printContentDocument(chooseVersion(block, given).content)).toBe(
        chooseVersion(attribute, given).content.en,
      );
    }
  });

  it('chooses a version of any content, by the same rules', () => {
    const logic = {
      kind: 'answers',
      value: KIND,
      missing: 0,
      versions: [{ caseKey: optionCaseKey(FAMILY_ID), content: 1 }],
      other: 2,
    } as const;
    const answered = (value: unknown) =>
      chooseVersion(
        logic,
        inputs({
          values: {
            [KIND]: { missing: false, value, variable: KIND_VARIABLE },
          },
        }),
      );
    expect(answered('family')).toEqual({ kind: 'version', content: 1 });
    expect(answered('friend')).toEqual({ kind: 'version', content: 2 });
    expect(chooseVersion(logic, inputs({}))).toEqual({
      kind: 'version',
      content: 0,
    });
  });

  it('gives a number by plural category its version, and a number by one message the message and the number', () => {
    const byCategory = {
      kind: 'number',
      value: COUNT,
      missing: 'none',
      counted: {
        by: 'category',
        versions: [{ category: 'one', content: 'one child' }],
        other: 'children',
      },
    } as const;
    const byMessage = {
      kind: 'number',
      value: COUNT,
      missing: 'none',
      counted: { by: 'message', content: 'plural message' },
    } as const;
    const count = (value: number) =>
      inputs({ values: { [COUNT]: { missing: false, value } } });
    expect(chooseVersion(byCategory, count(1))).toEqual({
      kind: 'version',
      content: 'one child',
    });
    expect(chooseVersion(byCategory, count(4))).toEqual({
      kind: 'version',
      content: 'children',
    });
    expect(chooseVersion(byMessage, count(4))).toEqual({
      kind: 'counted',
      content: 'plural message',
      count: 4,
    });
    expect(chooseVersion(byMessage, inputs({}))).toEqual({
      kind: 'version',
      content: 'none',
    });
  });
});
