import { describe, expect, it } from 'vitest';

import { testId, testVariableId } from '../../../__tests__/testIds.ts';
import {
  dynamicMessageParts,
  type DynamicValueState,
} from '../../../localization/dynamicValueMessages.ts';
import {
  DYNAMIC_VALUE_ROLES,
  dynamicValueCaseOf,
  dynamicValueNameFor,
  dynamicValueReferencesIn,
  type DynamicValueSiteContext,
  dynamicValueStatus,
  isAttributeDynamicValueRole,
  isLabelledDynamicValueRole,
  optionCaseKey,
  optionIdFromCaseKey,
  type ParsedDynamicValuePath,
  parseDynamicValueName,
  rewriteDynamicValueReferences,
} from '../dynamic-values.ts';

const VARIABLE = '3377af3f-3c79-41da-9b0b-6570fb519b93';
const CONDITION = testId('condition');

describe('the names text uses for values', () => {
  const every: ParsedDynamicValuePath[] = [
    { kind: 'intrinsic', name: 'now' },
    { kind: 'participant', role: 'node' },
    { kind: 'condition', conditionId: CONDITION },
    ...DYNAMIC_VALUE_ROLES.flatMap((role): ParsedDynamicValuePath[] => [
      ...(isLabelledDynamicValueRole(role)
        ? [{ kind: 'label' as const, role }]
        : []),
      ...(isAttributeDynamicValueRole(role)
        ? [{ kind: 'attribute' as const, role, variableId: VARIABLE }]
        : []),
    ]),
  ];

  it.each(every.map((value) => [dynamicValueNameFor(value), value]))(
    'reads %s back as what it was made from',
    (name, value) => {
      expect(parseDynamicValueName(name)).toEqual(value);
    },
  );

  it('writes an id with underscores, which a message accepts as a name', () => {
    expect(
      dynamicValueNameFor({
        kind: 'attribute',
        role: 'ego',
        variableId: VARIABLE,
      }),
    ).toBe('ego_3377af3f_3c79_41da_9b0b_6570fb519b93');
    expect(dynamicValueNameFor({ kind: 'label', role: 'dyadSource' })).toBe(
      'dyadSource_label',
    );
    expect(dynamicValueNameFor({ kind: 'participant', role: 'node' })).toBe(
      'node_isParticipant',
    );
    // Every name is usable in a message.
    const message = every
      .map((value) => `{${dynamicValueNameFor(value)}}`)
      .join(' ');
    expect(dynamicValueReferencesIn(message)).toHaveLength(every.length);
  });

  it.each([
    'someone',
    'ego',
    'ego_',
    '_label',
    'stranger_label',
    'ego_label',
    'edge_label',
    'ego_isParticipant',
    'dyadSource_isParticipant',
    `edgeFrom_${VARIABLE.replaceAll('-', '_')}`,
    'condition_',
    // The id part must be a whole UUID written with underscores.
    'ego_egoName',
    'ego_first_name',
    'ego_now',
    'ego_toString',
    'ego_constructor',
    `ego_${VARIABLE}`,
    `ego_${VARIABLE.replaceAll('-', '_')}_x`,
    `ego_${VARIABLE.replaceAll('-', '_').slice(1)}`,
    'condition_if1',
    `condition_${VARIABLE.replaceAll('-', '_')}_x`,
  ])('reads %s as naming nothing', (name) => {
    expect(parseDynamicValueName(name)).toBeUndefined();
  });

  it('writes an option id as a case key and reads it back', () => {
    const optionId = testId('option');
    expect(optionCaseKey(optionId)).not.toContain('-');
    expect(optionIdFromCaseKey(optionCaseKey(optionId))).toBe(optionId);
  });

  it('reads no option id from a key that spells no UUID', () => {
    expect(optionIdFromCaseKey('true')).toBeUndefined();
    expect(optionIdFromCaseKey('friend')).toBeUndefined();
    expect(
      optionIdFromCaseKey(`${optionCaseKey(testId('option'))}_x`),
    ).toBeUndefined();
  });
});

describe('dynamicValueStatus', () => {
  const context: DynamicValueSiteContext = {
    roles: new Set(['ego'] as const),
    variablesFor: () => ({
      [VARIABLE]: { name: 'Age', type: 'number' },
    }),
  };

  it('finds an attribute only among the variables’ own keys', () => {
    for (const variableId of ['toString', 'constructor', '__proto__']) {
      expect(
        dynamicValueStatus(
          { kind: 'attribute', role: 'ego', variableId },
          context,
        ),
      ).toEqual({
        status: 'unknown',
        problem: 'refers to an attribute that no longer exists',
      });
    }
    expect(
      dynamicValueStatus(
        { kind: 'attribute', role: 'ego', variableId: VARIABLE },
        context,
      ).status,
    ).toBe('available');
  });
});

describe('dynamicValueReferencesIn', () => {
  it('gives each name once, with what it names and the cases its selects give', () => {
    const name = `ego_${VARIABLE.replaceAll('-', '_')}`;
    expect(
      dynamicValueReferencesIn(
        `{${name}, select, missing {} a1 {x} other {{now}}} {${name}, select, b2 {y} a1 {z} other {}}`,
      ),
    ).toEqual([
      {
        name,
        parsed: { kind: 'attribute', role: 'ego', variableId: VARIABLE },
        caseKeys: ['a1', 'b2'],
      },
      { name: 'now', parsed: { kind: 'intrinsic', name: 'now' }, caseKeys: [] },
    ]);
  });

  it('finds nothing in a message that does not parse', () => {
    expect(dynamicValueReferencesIn('{broken')).toEqual([]);
  });
});

describe('dynamicValueCaseOf', () => {
  const options = [
    { id: testId('first'), value: 'a' },
    { id: testId('second'), value: 'b' },
    { id: testId('third'), value: 3 },
  ];
  const variable = { options };
  const keyOf = (index: number) => optionCaseKey(options[index]!.id);

  it('chooses the option an answer holds', () => {
    expect(dynamicValueCaseOf('b', variable, [keyOf(0), keyOf(1)])).toBe(
      keyOf(1),
    );
    expect(dynamicValueCaseOf(3, variable, [keyOf(2)])).toBe(keyOf(2));
  });

  it('compares an answer with option values as the schema does, so 3 and "3" are one value', () => {
    expect(dynamicValueCaseOf('3', variable, [keyOf(2)])).toBe(keyOf(2));
    expect(dynamicValueCaseOf(['3'], variable, [keyOf(2)])).toBe(keyOf(2));
    const numbered = { options: [{ id: testId('one'), value: '1' }] };
    expect(
      dynamicValueCaseOf(1, numbered, [optionCaseKey(testId('one'))]),
    ).toBe(optionCaseKey(testId('one')));
  });

  it('chooses none for an option the select gives no version for', () => {
    expect(dynamicValueCaseOf('b', variable, [keyOf(0)])).toBeUndefined();
  });

  it('chooses, of several options, the first in the codebook that the select gives a version for', () => {
    // The order of the answer and of the select's versions does not matter.
    expect(dynamicValueCaseOf(['b', 'a'], variable, [keyOf(1), keyOf(0)])).toBe(
      keyOf(0),
    );
    expect(dynamicValueCaseOf([3, 'b'], variable, [keyOf(2), keyOf(1)])).toBe(
      keyOf(1),
    );
    expect(dynamicValueCaseOf(['a', 'b'], variable, [keyOf(1)])).toBe(keyOf(1));
    expect(dynamicValueCaseOf(['a'], variable, [keyOf(1)])).toBeUndefined();
  });

  it('chooses true or false for a yes/no value', () => {
    expect(dynamicValueCaseOf(true, undefined, ['true', 'false'])).toBe('true');
    expect(dynamicValueCaseOf(false, undefined, ['true', 'false'])).toBe(
      'false',
    );
    expect(dynamicValueCaseOf(false, undefined, ['true'])).toBeUndefined();
  });
});

describe('a select on several options of one answer', () => {
  const options = [
    { id: testId('friend'), value: 'friend' },
    { id: testId('family'), value: 'family' },
  ];
  const FRIEND = optionCaseKey(options[0]!.id);
  const FAMILY = optionCaseKey(options[1]!.id);

  it('reads, in each select, the version for the first option in the codebook it gives', () => {
    const message = `{kind, select, ${FAMILY} {Family} other {Other}} / {kind, select, ${FRIEND} {Friend} ${FAMILY} {Family} other {Other}}`;
    const stateOf = (
      _name: string,
      keys: readonly string[],
    ): DynamicValueState => {
      const chosen = dynamicValueCaseOf(
        ['family', 'friend'],
        { options },
        keys,
      );
      return {
        missing: false,
        ...(chosen !== undefined && { case: chosen }),
      };
    };
    expect(dynamicMessageParts(message, 'en', stateOf)).toEqual([
      'Family / Friend',
    ]);
  });
});

describe('rewriteDynamicValueReferences', () => {
  it('renames names and case keys, wherever they are', () => {
    expect(
      rewriteDynamicValueReferences(
        "It's {a, select, missing {} k1 {{b} '{'x'}'} other {{a}}}",
        {
          name: (name) => (name === 'a' ? 'c' : undefined),
          caseKey: (name, key) =>
            name === 'a' && key === 'k1' ? 'k2' : undefined,
        },
      ),
    ).toBe("It's {c, select, missing {} k2 {{b} '{'x'}'} other {{c}}}");
  });

  it('returns the message as it was when nothing changes, or it does not parse', () => {
    const message = "It''s {a}";
    expect(
      rewriteDynamicValueReferences(message, { name: () => undefined }),
    ).toBe(message);
    expect(rewriteDynamicValueReferences('{broken', { name: () => 'x' })).toBe(
      '{broken',
    );
  });

  it('leaves missing and other alone', () => {
    expect(
      rewriteDynamicValueReferences('{a, select, missing {m} other {o}}', {
        caseKey: () => 'renamed',
      }),
    ).toBe('{a, select, missing {m} other {o}}');
  });

  it('keeps a variable id renamed through its name', () => {
    const name = dynamicValueNameFor({
      kind: 'attribute',
      role: 'node',
      variableId: testVariableId('a'),
    });
    const renamed = dynamicValueNameFor({
      kind: 'attribute',
      role: 'node',
      variableId: testVariableId('b'),
    });
    expect(
      rewriteDynamicValueReferences(`{${name}}`, {
        name: (each) => (each === name ? renamed : undefined),
      }),
    ).toBe(`{${renamed}}`);
  });
});
