import { describe, expect, it } from 'vitest';

import {
  type Conditions,
  dynamicValueNameFor,
  parseDynamicValueName,
  ProtocolObjectIdSchema,
  type Variable,
} from '@codaco/protocol-validation';

import {
  conditionMet,
  logicInputsFor,
  type LogicSources,
} from '../logicInputs.ts';

const AGE = '3377af3f-3c79-4a4e-9a6b-1d2c3e4f5a6b';
const KIND = '5b2f9c1e-7d4a-4e3b-8c2d-9f0a1b2c3d4e';
const ADULT = '8e1d2c3b-4a5f-4e6d-9c7b-0a1f2e3d4c5b';
const JUDGED = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const UNDECLARED = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const DYNAMIC_ATTRIBUTE = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

const KIND_VARIABLE: Variable = {
  name: 'kind',
  type: 'categorical',
  options: [
    {
      id: ProtocolObjectIdSchema.parse('6c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'),
      label: { en: 'Friend' },
      value: 'friend',
    },
    {
      id: ProtocolObjectIdSchema.parse('7d2e3f4a-5b6c-4d7e-9f8a-0b1c2d3e4f5a'),
      label: { en: 'Family' },
      value: 'family',
    },
  ],
};
const AGE_VARIABLE: Variable = { name: 'age', type: 'number' };

const conditions = {
  [ADULT]: {
    about: 'ego',
    join: 'AND',
    rules: [
      {
        id: 'adult-rule',
        type: 'ego',
        options: {
          attribute: AGE,
          operator: 'GREATER_THAN_OR_EQUAL',
          value: 18,
        },
      },
    ],
  },
} as unknown as Conditions;

const sources = (ego: Record<string, unknown>): LogicSources => ({
  attributes: { ego, node: { [KIND]: 'friend' } },
  conditions,
  conditionFacts: { [JUDGED]: true },
  variablesFor: (role): Readonly<Record<string, Variable>> =>
    role === 'node' ? { [KIND]: KIND_VARIABLE } : { [AGE]: AGE_VARIABLE },
});

const egoAge = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: AGE,
});
const nodeKind = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: KIND,
});
const dynamicAttribute = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: DYNAMIC_ATTRIBUTE,
});
const undeclaredCondition = dynamicValueNameFor({
  kind: 'condition',
  conditionId: UNDECLARED,
});

describe('logicInputsFor', () => {
  it('reads an attribute of an entity on screen, with the variable whose options logic chooses by', () => {
    const inputs = logicInputsFor(sources({ [AGE]: 30 }), 'en');
    expect(inputs.valueOf(egoAge)).toEqual({ missing: false, value: 30 });
    expect(inputs.valueOf(nodeKind)).toEqual({
      missing: false,
      value: 'friend',
      variable: KIND_VARIABLE,
    });
    expect(inputs.locale).toBe('en');
  });

  it('reads an unanswered value, a role not on screen and a dynamic attribute as missing', () => {
    for (const unanswered of [undefined, null, '  ', Number.NaN, []]) {
      expect(
        logicInputsFor(sources({ [AGE]: unanswered }), 'en').valueOf(egoAge),
      ).toEqual({ missing: true });
    }
    const inputs = logicInputsFor(sources({ [AGE]: 0 }), 'en');
    // 0 is an answer.
    expect(inputs.valueOf(egoAge)).toEqual({ missing: false, value: 0 });
    expect(
      inputs.valueOf(
        dynamicValueNameFor({
          kind: 'attribute',
          role: 'edge',
          variableId: AGE,
        }),
      ),
    ).toEqual({ missing: true });
    // The name parses, so this reads the dynamic attribute, not a name that
    // stands for nothing.
    expect(parseDynamicValueName(dynamicAttribute)).toEqual({
      kind: 'dynamicAttribute',
      id: DYNAMIC_ATTRIBUTE,
    });
    expect(inputs.valueOf(dynamicAttribute)).toEqual({ missing: true });
    // Nothing supplies the participant, a label or today's date here.
    expect(
      inputs.valueOf(
        dynamicValueNameFor({ kind: 'participant', role: 'node' }),
      ),
    ).toEqual({ missing: true });
    expect(inputs.valueOf('now')).toEqual({ missing: true });
  });

  it('judges a condition by its rules, unless the caller has judged it', () => {
    expect(conditionMet(ADULT, sources({ [AGE]: 30 }))).toBe(true);
    expect(conditionMet(ADULT, sources({ [AGE]: 12 }))).toBe(false);
    expect(conditionMet(JUDGED, sources({}))).toBe(true);
    expect(conditionMet(UNDECLARED, sources({}))).toBeUndefined();

    const inputs = logicInputsFor(sources({ [AGE]: 30 }), 'en');
    expect(inputs.conditionMet(ADULT)).toBe(true);
    expect(
      inputs.valueOf(
        dynamicValueNameFor({ kind: 'condition', conditionId: ADULT }),
      ),
    ).toEqual({ missing: false, value: true });
    expect(parseDynamicValueName(undeclaredCondition)).toEqual({
      kind: 'condition',
      conditionId: UNDECLARED,
    });
    expect(inputs.valueOf(undeclaredCondition)).toEqual({ missing: true });
  });
});

/**
 * "If: Ego has first_name", otherwise the wording without it: the rule that
 * gives a piped value a version for when it is missing has to agree with the
 * piped value about when that is, or the participant reads "Thank you, !".
 */
describe('a rule about whether an attribute has an answer', () => {
  const NAME = '4c5d6e7f-8a9b-4c0d-9e1f-2a3b4c5d6e7f';
  const HAS_NAME = '5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a';
  const NO_NAME = '6e7f8a9b-0c1d-4e2f-9a3b-4c5d6e7f8a9b';
  const NODE_HAS_NAME = '7f8a9b0c-1d2e-4f3a-8b4c-5d6e7f8a9b0c';
  const presence = {
    [HAS_NAME]: {
      join: 'AND',
      rules: [
        {
          id: 'has-name',
          type: 'ego',
          options: { attribute: NAME, operator: 'EXISTS' },
        },
      ],
    },
    [NO_NAME]: {
      join: 'AND',
      rules: [
        {
          id: 'no-name',
          type: 'ego',
          options: { attribute: NAME, operator: 'NOT_EXISTS' },
        },
      ],
    },
    [NODE_HAS_NAME]: {
      about: 'node',
      join: 'AND',
      rules: [
        {
          id: 'node-has-name',
          type: 'node',
          options: { type: 'person', attribute: NAME, operator: 'EXISTS' },
        },
      ],
    },
  } as unknown as Conditions;
  const egoName = dynamicValueNameFor({
    kind: 'attribute',
    role: 'ego',
    variableId: NAME,
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['empty text', ''],
    ['text of only spaces', '   '],
    ['no options selected', []],
    ['a partial number', Number.NaN],
    ['text', 'Sam'],
    ['zero', 0],
    ['no', false],
    ['an option', ['a']],
  ])('agrees with the piped value for %s', (_name, value) => {
    const read: LogicSources = {
      attributes: { ego: { [NAME]: value }, node: { [NAME]: value } },
      conditions: presence,
    };
    const shown = !logicInputsFor(read, 'en').valueOf(egoName).missing;

    expect(conditionMet(HAS_NAME, read)).toBe(shown);
    expect(conditionMet(NO_NAME, read)).toBe(!shown);
    expect(conditionMet(NODE_HAS_NAME, read)).toBe(shown);
  });
});
