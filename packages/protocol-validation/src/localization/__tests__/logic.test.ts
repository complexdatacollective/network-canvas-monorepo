import { describe, expect, it } from 'vitest';

import { testId, testVariableId } from '../../__tests__/testIds.ts';
import {
  type DynamicAttribute,
  dynamicAttributeOfLogic,
  dynamicAttributeVersions,
  logicOfDynamicAttribute,
  readDynamicAttributeLogic,
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
import {
  type Logic,
  logicReads,
  logicValueNames,
  logicVersions,
} from '../logic.ts';

const CONDITION_A = testId('condition-a');
const CONDITION_B = testId('condition-b');
const FRIEND = optionCaseKey(testId('friend'));
const FAMILY = optionCaseKey(testId('family'));

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

const en = (text: string) => ({ en: text });

const blockOf = (message: string): ContentLogic => {
  const [block] = readContentDocument(message).nodes;
  if (block?.kind !== 'logic') throw new Error('Not a logic block');
  return block.logic;
};

/** Each version of a logic block: its role, key and text. */
const blockVersions = (message: string) =>
  logicVersions(blockOf(message)).map(({ role, key, content }) => [
    role,
    key,
    printContentDocument(content),
  ]);

/** Each version of a dynamic attribute: its role, key and wording. */
const attributeVersions = (definition: DynamicAttribute) =>
  logicVersions(logicOfDynamicAttribute(definition)).map(
    ({ role, key, content }) => [role, key, content.en],
  );

describe('logicVersions', () => {
  it('lists the versions of a conditions logic, each with its condition, then otherwise', () => {
    expect(
      blockVersions(
        `{${A}, select, true {First.} other {{${B}, select, false {Second.} other {Third.}}}}`,
      ),
    ).toEqual([
      ['condition', CONDITION_A, 'First.'],
      ['condition', CONDITION_B, 'Second.'],
      ['otherwise', undefined, 'Third.'],
    ]);
    expect(
      attributeVersions({
        logic: 'conditions',
        cases: [
          { condition: CONDITION_A, when: 'met', wording: en('first') },
          { condition: CONDITION_B, when: 'notMet', wording: en('second') },
        ],
        otherwise: en('third'),
      }),
    ).toEqual([
      ['condition', CONDITION_A, 'first'],
      ['condition', CONDITION_B, 'second'],
      ['otherwise', undefined, 'third'],
    ]);
  });

  it('lists the versions of an answers logic: no answer, each answer, any other answer', () => {
    expect(
      blockVersions(
        `{${KIND}, select, missing {None.} ${FRIEND} {Friend.} other {Other.}}`,
      ),
    ).toEqual([
      ['missing', undefined, 'None.'],
      ['answer', FRIEND, 'Friend.'],
      ['other', undefined, 'Other.'],
    ]);
    expect(
      attributeVersions({
        logic: 'answers',
        value: KIND,
        missing: en('none'),
        answers: [{ answer: FRIEND, wording: en('friend') }],
        other: en('other'),
      }),
    ).toEqual([
      ['missing', undefined, 'none'],
      ['answer', FRIEND, 'friend'],
      ['other', undefined, 'other'],
    ]);
  });

  it('lists a number block’s version for each plural category, other last, and a dynamic attribute’s one plural message', () => {
    expect(
      blockVersions(
        `{${COUNT}, select, missing {None.} other {{${COUNT}, plural, other {# children} one {# child}}}}`,
      ),
    ).toEqual([
      ['missing', undefined, 'None.'],
      ['number', 'one', '# child'],
      ['other', undefined, '# children'],
    ]);
    const plural = '{count, plural, one {# child} other {# children}}';
    expect(
      attributeVersions({
        logic: 'number',
        value: COUNT,
        missing: en('none'),
        wording: en(plural),
      }),
    ).toEqual([
      ['missing', undefined, 'none'],
      ['number', undefined, plural],
    ]);
  });

  it('lists the participant’s version, then anyone else’s', () => {
    expect(
      blockVersions(`{${PARTICIPANT}, select, true {You.} other {Them.}}`),
    ).toEqual([
      ['participant', undefined, 'You.'],
      ['otherwise', undefined, 'Them.'],
    ]);
  });
});

describe('logicReads', () => {
  it('reads each condition once, in order, and no other value', () => {
    const logic: Logic<string> = {
      kind: 'conditions',
      versions: [
        { conditionId: CONDITION_A, when: 'met', content: 'a' },
        { conditionId: CONDITION_B, when: 'notMet', content: 'b' },
        { conditionId: CONDITION_A, when: 'notMet', content: 'c' },
      ],
      otherwise: 'd',
    };
    expect(logicReads(logic)).toEqual({
      conditionIds: [CONDITION_A, CONDITION_B],
      values: [],
    });
    expect(logicValueNames(logic)).toEqual([A, B]);
  });

  it('reads the attribute of an answers logic, with each case key it gives a version once', () => {
    const logic: Logic<string> = {
      kind: 'answers',
      value: KIND,
      missing: '',
      versions: [
        { caseKey: FRIEND, content: 'a' },
        { caseKey: FAMILY, content: 'b' },
        { caseKey: FRIEND, content: 'c' },
      ],
      other: '',
    };
    expect(logicReads(logic)).toEqual({
      conditionIds: [],
      values: [{ name: KIND, caseKeys: [FRIEND, FAMILY] }],
    });
    expect(logicValueNames(logic)).toEqual([KIND]);
  });

  it('reads the attribute of a number logic without case keys, in either form', () => {
    const expected = {
      conditionIds: [],
      values: [{ name: COUNT, caseKeys: [] }],
    };
    expect(
      logicReads(
        blockOf(
          `{${COUNT}, select, missing {} other {{${COUNT}, plural, one {x} other {y}}}}`,
        ),
      ),
    ).toEqual(expected);
    expect(
      logicReads(
        logicOfDynamicAttribute({
          logic: 'number',
          value: COUNT,
          missing: en(''),
          wording: en('{count, plural, other {#}}'),
        }),
      ),
    ).toEqual(expected);
  });

  it('reads whether the node is the participant', () => {
    expect(
      logicReads({
        kind: 'participant',
        participant: 'you',
        otherwise: 'they',
      }),
    ).toEqual({
      conditionIds: [],
      values: [{ name: PARTICIPANT, caseKeys: ['true'] }],
    });
  });

  it('reads the same things from a logic block and a dynamic attribute with the same logic', () => {
    expect(
      logicReads(
        blockOf(
          `{${KIND}, select, missing {} ${FRIEND} {x} ${FAMILY} {y} other {}}`,
        ),
      ),
    ).toEqual(
      logicReads(
        logicOfDynamicAttribute({
          logic: 'answers',
          value: KIND,
          missing: en(''),
          answers: [
            { answer: FRIEND, wording: en('x') },
            { answer: FAMILY, wording: en('y') },
          ],
          other: en(''),
        }),
      ),
    );
  });
});

describe('the logic of a stored dynamic attribute', () => {
  const definitions: readonly DynamicAttribute[] = [
    {
      logic: 'conditions',
      cases: [
        { condition: CONDITION_A, when: 'met', wording: en('a') },
        { condition: CONDITION_B, when: 'notMet', wording: en('b') },
      ],
      otherwise: en('c'),
    },
    {
      logic: 'answers',
      value: KIND,
      missing: en('a'),
      answers: [{ answer: FRIEND, wording: en('b') }],
      other: en('c'),
    },
    {
      logic: 'number',
      value: COUNT,
      missing: en('a'),
      wording: en('{count, plural, other {#}}'),
    },
    { logic: 'participant', participant: en('a'), otherwise: en('b') },
  ];

  it('is stored again as the same definition', () => {
    for (const definition of definitions) {
      expect(
        dynamicAttributeOfLogic(logicOfDynamicAttribute(definition)),
      ).toEqual(definition);
    }
  });

  it('places each version at the path of its wording, and a condition or answer at the path of its key', () => {
    expect(dynamicAttributeVersions(definitions[0]!)).toEqual([
      {
        path: ['cases', 0, 'wording'],
        keyPath: ['cases', 0, 'condition'],
        role: 'condition',
        key: CONDITION_A,
        wording: en('a'),
      },
      {
        path: ['cases', 1, 'wording'],
        keyPath: ['cases', 1, 'condition'],
        role: 'condition',
        key: CONDITION_B,
        wording: en('b'),
      },
      { path: ['otherwise'], role: 'otherwise', wording: en('c') },
    ]);
    expect(
      dynamicAttributeVersions(definitions[2]!).map(({ path }) => path),
    ).toEqual([['missing'], ['wording']]);
  });

  it('is read leniently from a definition whose wording is still being written', () => {
    expect(
      readDynamicAttributeLogic({
        logic: 'conditions',
        // Not yet a UUID, and with no wording at all.
        cases: [{ condition: 'condition-1', when: 'met' }],
        otherwise: 7,
      }),
    ).toEqual({
      kind: 'conditions',
      versions: [
        { conditionId: 'condition-1', when: 'met', content: undefined },
      ],
      otherwise: 7,
    });
    expect(readDynamicAttributeLogic({ logic: 'unknown' })).toBeUndefined();
    expect(readDynamicAttributeLogic('pronoun')).toBeUndefined();
  });
});
