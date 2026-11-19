import { describe, expect, it } from 'vitest';

import { testId, withTestIds } from '../../../__tests__/testIds.ts';
import { collectLocalizedStringsFromSchema } from '../../../utils/collectLocalizedStrings.ts';
import { ConditionSchema } from '../conditions.ts';
import {
  dynamicValueConditionPathFor,
  parseDynamicValuePath,
} from '../dynamic-values.ts';
import { findNodeLabelProblems, NodeLabelSchema } from '../node-label.ts';
import { ProtocolStructureSchema } from '../protocol-structure.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

const codebook = (label: unknown) => ({
  node: {
    place: {
      name: 'Place',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        nameVar: { name: 'name', type: 'text' },
        kind: {
          name: 'kind',
          type: 'ordinal',
          options: [
            { label: { en: 'Hospital' }, value: 'hospital' },
            { label: { en: 'School' }, value: 'school' },
          ],
        },
        secret: { name: 'secret', type: 'text', encrypted: true },
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

describe('condition paths', () => {
  it('round-trips a condition path', () => {
    expect(
      parseDynamicValuePath(dynamicValueConditionPathFor('isBig')),
    ).toEqual({ kind: 'condition', conditionId: 'isBig' });
  });

  it('names nothing for any other path that starts with $', () => {
    expect(parseDynamicValuePath('$nothing')).toBeUndefined();
    expect(parseDynamicValuePath('$condition.')).toBeUndefined();
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
        en: '{kind, select, missing {} hospital {🏥 {linked, select, yes {🔗} other {}}} other {}}{nodeLabel}',
      },
      dynamicValues: {
        kind: { path: 'node.kind', cases: { hospital: 'hospital' } },
        linked: { path: '$condition.linked', cases: { yes: true } },
        nodeLabel: { path: 'node.$label' },
      },
      conditions: {
        linked: {
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

  it('refuses a condition id that cannot be an argument name', () => {
    const result = NodeLabelSchema.safeParse({
      text: { en: 'x' },
      conditions: {
        'not ok': {
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
    expect(result.success).toBe(false);
  });
});

describe('findNodeLabelProblems', () => {
  const big = {
    about: 'node',
    rules: [
      {
        type: 'node',
        id: testId('r1'),
        options: { type: 'place', attribute: 'nameVar', operator: 'EXISTS' },
      },
    ],
  };

  it('accepts attributes, the default label and conditions, met or not', () => {
    expect(
      problemsOf({
        text: {
          en: '{kind, select, missing {} hospital {🏥 } other {}}{big, select, yes {⭐ } other {}}{small, select, no {· } other {}}{nodeLabel}',
        },
        dynamicValues: {
          kind: { path: 'node.kind', cases: { hospital: 'hospital' } },
          big: { path: '$condition.big', cases: { yes: true } },
          small: { path: '$condition.big', cases: { no: false } },
          nodeLabel: { path: 'node.$label' },
        },
        conditions: { big },
      }),
    ).toEqual([]);
  });

  it('requires a version for when an attribute is missing', () => {
    const problems = problemsOf({
      text: { en: '{name}' },
      dynamicValues: { name: { path: 'node.nameVar' } },
    });
    expect(problems.map((problem) => problem.path)).toEqual([
      [...LABEL_PATH, 'text', 'en'],
    ]);
  });

  it.each([
    ['today’s date', { path: 'now' }],
    ['an ego attribute', { path: 'ego.anything' }],
    ['an encrypted attribute', { path: 'node.secret' }],
    ['a condition that does not exist', { path: '$condition.gone' }],
  ])('refuses %s', (_, binding) => {
    const problems = problemsOf({
      text: { en: 'x' },
      dynamicValues: { value: binding },
    });
    expect(problems.map((problem) => problem.path)).toEqual([
      [...LABEL_PATH, 'dynamicValues', 'value', 'path'],
    ]);
  });

  it('refuses showing a condition as words', () => {
    const problems = problemsOf({
      text: { en: '{big}' },
      dynamicValues: { big: { path: '$condition.big' } },
      conditions: { big },
    });
    expect(problems[0]?.message).toContain('only chooses wording');
  });

  it('refuses a case that stands for neither true nor false', () => {
    const problems = problemsOf({
      text: { en: '{big, select, maybe {a} other {b}}' },
      dynamicValues: {
        big: { path: '$condition.big', cases: { maybe: true } },
      },
      conditions: { big },
    });
    expect(problems.map((problem) => problem.path)).toContainEqual([
      ...LABEL_PATH,
      'dynamicValues',
      'big',
      'cases',
      'maybe',
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

  const labelWith = (rules: unknown[], join?: string) => ({
    text: { en: '{named, select, yes {⭐ } other {}}{nodeLabel}' },
    dynamicValues: {
      named: { path: '$condition.named', cases: { yes: true } },
      nodeLabel: { path: 'node.$label' },
    },
    conditions: { named: { about: 'node', ...(join && { join }), rules } },
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
    const base = `codebook.node.${nodeType}.dynamicLabel.conditions.named.rules`;
    const paths = issuePathsOf(protocol);
    expect(paths).toContain(`${base}.0.options.type`);
    expect(paths).toContain(`${base}.1.type`);
    expect(paths).toContain(`${base}.2.options.type`);
  });

  it('lets a stage’s text ask about the participant, and refuses a condition about a node the stage does not have', () => {
    const { protocol, egoVariable } = fixture();
    const stages: Record<string, unknown>[] = protocol.stages;
    const index = stages.findIndex((stage) => stage.type === 'Information');
    const stage = stages[index];
    if (stage === undefined) throw new Error('No Information stage');
    stage.conditions = {
      answered: {
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
      linked: {
        about: 'node',
        rules: [{ type: 'edge', id: testId('r1'), options: { count: 'MOST' } }],
      },
    };
    expect(issuePathsOf(protocol)).toContain(
      `stages.${index}.conditions.linked.about`,
    );
  });
});
