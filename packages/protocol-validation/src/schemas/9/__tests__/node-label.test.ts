import { describe, expect, it } from 'vitest';

import {
  testId,
  testVariableId,
  withTestIds,
} from '../../../__tests__/testIds.ts';
import { collectLocalizedStringsFromSchema } from '../../../utils/collectLocalizedStrings.ts';
import { ConditionSchema } from '../conditions.ts';
import {
  dynamicValueNameFor,
  optionCaseKey,
  parseDynamicValueName,
} from '../dynamic-values.ts';
import { findNodeLabelProblems, NodeLabelSchema } from '../node-label.ts';
import { ProtocolStructureSchema } from '../protocol-structure.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

const HOSPITAL_ID = testId('hospital');
const HOSPITAL = optionCaseKey(HOSPITAL_ID);
const BIG_ID = testId('big');
const BIG = dynamicValueNameFor({ kind: 'condition', conditionId: BIG_ID });
const NAME_VAR = testVariableId('nameVar');
const KIND_VAR = testVariableId('kind');
const SECRET_VAR = testVariableId('secret');
const KIND = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: KIND_VAR,
});
const NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: NAME_VAR,
});

const codebook = (label: unknown) => ({
  node: {
    place: {
      name: 'Place',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        [NAME_VAR]: { name: 'name', type: 'text' },
        [KIND_VAR]: {
          name: 'kind',
          type: 'ordinal',
          options: [
            { id: HOSPITAL_ID, label: { en: 'Hospital' }, value: 'hospital' },
            { id: testId('school'), label: { en: 'School' }, value: 'school' },
          ],
        },
        [SECRET_VAR]: { name: 'secret', type: 'text', encrypted: true },
      },
      dynamicLabel: label,
    },
  },
  edge: {
    near: { name: 'Near', color: 'edge-color-seq-1' },
  },
});

const problemsOf = (label: unknown) => {
  const protocol = { codebook: codebook(label), stages: [] };
  return findNodeLabelProblems(
    protocol,
    collectLocalizedStringsFromSchema(ProtocolStructureSchema, protocol),
  );
};

const LABEL_PATH = ['codebook', 'node', 'place', 'dynamicLabel'];

describe('condition names', () => {
  it('round-trips a condition name', () => {
    expect(parseDynamicValueName(BIG)).toEqual({
      kind: 'condition',
      conditionId: BIG_ID,
    });
  });

  it('names nothing for a condition without an id', () => {
    expect(parseDynamicValueName('condition_')).toBeUndefined();
  });
});

describe('ConditionSchema', () => {
  const nodeRule = (id: string) => ({
    type: 'node',
    id: testId(id),
    options: { type: 'place', attribute: 'nameVar', operator: 'EXISTS' },
  });

  it('accepts an edge count against a number, and the most without one', () => {
    expect(
      ConditionSchema.safeParse({
        about: 'node',
        join: 'OR',
        rules: [
          {
            type: 'edge',
            id: testId('a'),
            options: { type: 'near', count: 'GREATER_THAN', value: 2 },
          },
          { type: 'edge', id: testId('b'), options: { count: 'MOST' } },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    ['a number with the most', { count: 'MOST', value: 1 }],
    ['no number with a comparison', { count: 'EXACTLY' }],
    ['a fraction of an edge', { count: 'EXACTLY', value: 1.5 }],
  ])('refuses %s', (_, options) => {
    expect(
      ConditionSchema.safeParse({
        about: 'node',
        rules: [{ type: 'edge', id: testId('a'), options }],
      }).success,
    ).toBe(false);
  });

  it('requires a join for several rules, and what a node rule is about', () => {
    expect(
      ConditionSchema.safeParse({
        about: 'node',
        rules: [nodeRule('a'), nodeRule('b')],
      }).success,
    ).toBe(false);
    expect(ConditionSchema.safeParse({ rules: [nodeRule('a')] }).success).toBe(
      false,
    );
  });
});

describe('NodeLabelSchema', () => {
  it('accepts a label with nested versions', () => {
    const result = NodeLabelSchema.safeParse({
      text: {
        en: `{${KIND}, select, missing {} ${HOSPITAL} {🏥 {${BIG}, select, true {🔗} other {}}} other {}}{node_label}`,
      },
      conditions: {
        [BIG_ID]: {
          about: 'node',
          rules: [
            {
              type: 'edge',
              id: testId('r1'),
              options: { count: 'GREATER_THAN', value: 0 },
            },
          ],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('refuses a condition id that is not a UUID', () => {
    const result = NodeLabelSchema.safeParse({
      text: { en: 'x' },
      conditions: {
        big: {
          about: 'node',
          rules: [
            {
              type: 'node',
              id: testId('r1'),
              options: { type: 'place', operator: 'EXISTS' },
            },
          ],
        },
      },
    });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['conditions', 'big'],
        message:
          'The condition id "big" is not a UUID. Every condition id must be a UUID.',
      }),
    ]);
  });
});

describe('findNodeLabelProblems', () => {
  const big = {
    about: 'node',
    rules: [
      {
        type: 'node',
        id: testId('r1'),
        options: { type: 'place', attribute: NAME_VAR, operator: 'EXISTS' },
      },
    ],
  };

  it('accepts attributes, the default label and conditions, met or not', () => {
    expect(
      problemsOf({
        text: {
          en: `{${KIND}, select, missing {} ${HOSPITAL} {🏥 } other {}}{${BIG}, select, true {⭐ } other {}}{${BIG}, select, false {· } other {}}{node_label}`,
        },
        conditions: { [BIG_ID]: big },
      }),
    ).toEqual([]);
  });

  it('requires a version for when an attribute is missing', () => {
    const problems = problemsOf({
      text: { en: `{${NAME}}` },
    });
    expect(problems.map((problem) => problem.path)).toEqual([
      [...LABEL_PATH, 'text', 'en'],
    ]);
  });

  it.each([
    [
      'today’s date',
      'now',
      'This label cannot use today’s date: a node’s label can show only what is known about that node.',
    ],
    [
      'an ego attribute',
      dynamicValueNameFor({
        kind: 'attribute',
        role: 'ego',
        variableId: testVariableId('anything'),
      }),
      'This label cannot use an attribute of the participant, because the text does not refer to the participant.',
    ],
    [
      'an encrypted attribute',
      dynamicValueNameFor({
        kind: 'attribute',
        role: 'node',
        variableId: SECRET_VAR,
      }),
      'This label cannot use the "secret" attribute of the node that the label is on, because the attribute is encrypted.',
    ],
    [
      'an attribute that does not exist',
      dynamicValueNameFor({
        kind: 'attribute',
        role: 'node',
        variableId: testVariableId('gone'),
      }),
      'This label refers to an attribute that no longer exists.',
    ],
    [
      'a condition that does not exist',
      dynamicValueNameFor({ kind: 'condition', conditionId: testId('gone') }),
      'This label has an If block whose rules no longer exist.',
    ],
    [
      'a name that refers to nothing',
      'node_kind',
      'This label cannot use "node_kind": it does not refer to an attribute, a node’s label, a condition or today’s date.',
    ],
  ])(
    'refuses %s, and names it as a researcher knows it',
    (_, name, message) => {
      expect(
        problemsOf({ text: { en: `{${name}, select, missing {} other {x}}` } }),
      ).toEqual([{ path: [...LABEL_PATH, 'text', 'en'], message }]);
    },
  );

  it('refuses showing a condition as words', () => {
    const problems = problemsOf({
      text: { en: `{${BIG}}` },
      conditions: { [BIG_ID]: big },
    });
    expect(problems[0]?.message).toBe(
      'An If block cannot be shown as words. It chooses which version of the text is shown. Give the text a version for when its rules are met and a version for when they are not.',
    );
  });

  it('refuses a case that is neither true nor false', () => {
    expect(
      problemsOf({
        text: { en: `{${BIG}, select, yes {a} other {b}}` },
        conditions: { [BIG_ID]: big },
      }),
    ).toEqual([
      {
        path: [...LABEL_PATH, 'text', 'en'],
        message:
          'This label chooses its wording by an If block, but one of its versions is neither for when its rules are met nor for when they are not.',
      },
    ]);
  });

  it('refuses a case that is not one of the attribute’s options', () => {
    expect(
      problemsOf({
        text: {
          en: `{${KIND}, select, hospital {a} ${optionCaseKey(testId('deleted'))} {c} other {b}}`,
        },
      }),
    ).toEqual([
      {
        path: [...LABEL_PATH, 'text', 'en'],
        message:
          'This label chooses its wording by the "kind" attribute of the node that the label is on, but one of its versions is for an option that no longer exists.',
      },
    ]);
  });
});

describe('a protocol whose text chooses its wording by conditions', () => {
  type Draft = ReturnType<typeof completeProtocol>;
  const isPlainText = (variable: unknown) =>
    typeof variable === 'object' &&
    variable !== null &&
    Reflect.get(variable, 'type') === 'text' &&
    Reflect.get(variable, 'encrypted') !== true;

  const fixture = () => {
    const protocol: Draft = withTestIds(completeProtocol());
    const nodeTypes: Record<string, { variables?: Record<string, unknown> }> =
      protocol.codebook.node;
    const nodeType = Object.keys(nodeTypes).find((id) =>
      Object.values(nodeTypes[id]?.variables ?? {}).some(isPlainText),
    );
    if (nodeType === undefined) throw new Error('No node type with text');
    const textVariable = Object.entries(
      nodeTypes[nodeType]?.variables ?? {},
    ).find(([, variable]) => isPlainText(variable))?.[0];
    const [edgeType] = Object.keys(protocol.codebook.edge);
    const [egoVariable] = Object.keys(protocol.codebook.ego.variables);
    if (
      textVariable === undefined ||
      edgeType === undefined ||
      egoVariable === undefined
    ) {
      throw new Error('The fixture lacks an attribute or an edge type');
    }
    const setLabel = (label: unknown) =>
      Reflect.set(nodeTypes[nodeType] ?? {}, 'dynamicLabel', label);
    return {
      protocol,
      nodeType,
      textVariable,
      edgeType,
      egoVariable,
      setLabel,
    };
  };

  const issuePathsOf = (protocol: unknown) => {
    const result = ProtocolSchemaV9.safeParse(protocol);
    return result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join('.'));
  };

  const NAMED_ID = testId('named');
  const labelWith = (rules: unknown[], join?: string) => ({
    text: {
      en: `{${dynamicValueNameFor({ kind: 'condition', conditionId: NAMED_ID })}, select, true {⭐ } other {}}{node_label}`,
    },
    conditions: {
      [NAMED_ID]: { about: 'node', ...(join && { join }), rules },
    },
  });

  it('is valid with an attribute rule, an edge rule and an edge count', () => {
    const { protocol, nodeType, textVariable, edgeType, setLabel } = fixture();
    setLabel(
      labelWith(
        [
          {
            type: 'node',
            id: testId('r1'),
            options: {
              type: nodeType,
              attribute: textVariable,
              operator: 'EXISTS',
            },
          },
          {
            type: 'edge',
            id: testId('r2'),
            options: { type: edgeType, operator: 'EXISTS' },
          },
          {
            type: 'edge',
            id: testId('r3'),
            options: { type: edgeType, count: 'MOST' },
          },
          {
            type: 'edge',
            id: testId('r4'),
            options: { count: 'GREATER_THAN_OR_EQUAL', value: 2 },
          },
        ],
        'AND',
      ),
    );
    expect(issuePathsOf(protocol)).toEqual([]);
  });

  it('refuses a label rule about another node type, the participant, or an edge type that does not exist', () => {
    const { protocol, nodeType, egoVariable, setLabel } = fixture();
    setLabel(
      labelWith(
        [
          {
            type: 'node',
            id: testId('r1'),
            options: { type: 'someOtherType', operator: 'EXISTS' },
          },
          {
            type: 'ego',
            id: testId('r2'),
            options: { attribute: egoVariable, operator: 'EXISTS' },
          },
          {
            type: 'edge',
            id: testId('r3'),
            options: { type: 'gone', count: 'MOST' },
          },
        ],
        'OR',
      ),
    );
    const base = `codebook.node.${nodeType}.dynamicLabel.conditions.${NAMED_ID}.rules`;
    const paths = issuePathsOf(protocol);
    expect(paths).toContain(`${base}.0.options.type`);
    expect(paths).toContain(`${base}.1.type`);
    expect(paths).toContain(`${base}.2.options.type`);
  });

  it('refuses a label rule that names a layout', () => {
    const { protocol, nodeType, setLabel } = fixture();
    const [layoutId] = Object.keys(protocol.codebook.layouts ?? {});
    if (layoutId === undefined) throw new Error('The fixture has no layout');
    setLabel(
      labelWith([
        {
          type: 'node',
          id: testId('r1'),
          options: { type: nodeType, attribute: layoutId, operator: 'EXISTS' },
        },
      ]),
    );
    expect(issuePathsOf(protocol)).toEqual([
      `codebook.node.${nodeType}.dynamicLabel.conditions.${NAMED_ID}.rules.0.options.attribute`,
    ]);
  });

  it('lets a stage’s text ask about the participant, and refuses a condition about a node the stage does not have', () => {
    const { protocol, egoVariable } = fixture();
    const stages: Record<string, unknown>[] = protocol.stages;
    const index = stages.findIndex((stage) => stage.type === 'Information');
    const stage = stages[index];
    if (stage === undefined) throw new Error('No Information stage');
    stage.conditions = {
      [testId('answered')]: {
        rules: [
          {
            type: 'ego',
            id: testId('r1'),
            options: { attribute: egoVariable, operator: 'EXISTS' },
          },
        ],
      },
    };
    expect(issuePathsOf(protocol)).toEqual([]);

    stage.conditions = {
      [testId('linked')]: {
        about: 'node',
        rules: [{ type: 'edge', id: testId('r1'), options: { count: 'MOST' } }],
      },
    };
    expect(issuePathsOf(protocol)).toContain(
      `stages.${index}.conditions.${testId('linked')}.about`,
    );
  });
});
