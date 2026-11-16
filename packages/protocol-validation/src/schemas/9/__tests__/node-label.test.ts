import { describe, expect, it } from 'vitest';

import { collectLocalizedStringsFromSchema } from '../../../utils/collectLocalizedStrings.ts';
import {
  dynamicValueConditionPathFor,
  dynamicValueConnectivityPathFor,
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

describe('node label value paths', () => {
  it('round-trips connectivity and condition paths', () => {
    expect(
      parseDynamicValuePath(dynamicValueConnectivityPathFor('connected')),
    ).toEqual({ kind: 'connectivity', role: 'node', measure: 'connected' });
    expect(
      parseDynamicValuePath(
        dynamicValueConnectivityPathFor('mostConnected', 'near'),
      ),
    ).toEqual({
      kind: 'connectivity',
      role: 'node',
      measure: 'mostConnected',
      edgeType: 'near',
    });
    expect(
      parseDynamicValuePath(dynamicValueConditionPathFor('isBig')),
    ).toEqual({ kind: 'condition', role: 'node', conditionId: 'isBig' });
  });

  it('names nothing for an unknown $ segment rather than an attribute', () => {
    expect(parseDynamicValuePath('node.$nothing')).toBeUndefined();
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
        linked: { path: 'node.$connected', cases: { yes: true } },
        nodeLabel: { path: 'node.$label' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('refuses a condition id that cannot be an argument name', () => {
    const result = NodeLabelSchema.safeParse({
      text: { en: 'x' },
      conditions: {
        'not ok': {
          name: 'Not ok',
          filter: {
            rules: [
              {
                type: 'node',
                id: 'r1',
                options: { type: 'place', operator: 'EXISTS' },
              },
            ],
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('findNodeLabelProblems', () => {
  it('accepts attributes, the default label, connectivity and conditions', () => {
    expect(
      problemsOf({
        text: {
          en: '{kind, select, missing {} hospital {🏥 } other {}}{linked, select, yes {🔗 } other {}}{big, select, yes {⭐ } other {}}{nodeLabel}',
        },
        dynamicValues: {
          kind: { path: 'node.kind', cases: { hospital: 'hospital' } },
          linked: { path: 'node.$connected.near', cases: { yes: true } },
          big: { path: 'node.$condition.big', cases: { yes: true } },
          nodeLabel: { path: 'node.$label' },
        },
        conditions: {
          big: {
            name: 'Big',
            filter: {
              rules: [
                {
                  type: 'node',
                  id: 'r1',
                  options: {
                    type: 'place',
                    attribute: 'nameVar',
                    operator: 'EXISTS',
                  },
                },
              ],
            },
          },
        },
      }),
    ).toEqual([]);
  });

  it('requires a version for when an attribute is missing', () => {
    const problems = problemsOf({
      text: { en: '{name}' },
      dynamicValues: { name: { path: 'node.nameVar' } },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.path).toEqual([
      'codebook',
      'node',
      'place',
      'dynamicLabel',
      'text',
      'en',
    ]);
  });

  it.each([
    ['today’s date', { path: 'now' }],
    ['an ego attribute', { path: 'ego.anything' }],
    ['an encrypted attribute', { path: 'node.secret' }],
    ['an edge type that does not exist', { path: 'node.$connected.gone' }],
    ['a condition that does not exist', { path: 'node.$condition.gone' }],
  ])('refuses %s', (_, binding) => {
    const problems = problemsOf({
      text: { en: 'x' },
      dynamicValues: { value: binding },
    });
    expect(problems.map((problem) => problem.path)).toEqual([
      [
        'codebook',
        'node',
        'place',
        'dynamicLabel',
        'dynamicValues',
        'value',
        'path',
      ],
    ]);
  });

  it('refuses showing a connectivity value as words', () => {
    const problems = problemsOf({
      text: { en: '{linked}' },
      dynamicValues: { linked: { path: 'node.$connected' } },
    });
    expect(problems[0]?.message).toContain('only chooses wording');
  });

  it('refuses a case other than the true case on a connectivity value', () => {
    const problems = problemsOf({
      text: { en: '{linked, select, no {a} other {b}}' },
      dynamicValues: {
        linked: { path: 'node.$connected', cases: { no: false } },
      },
    });
    expect(problems[0]?.path).toEqual([
      'codebook',
      'node',
      'place',
      'dynamicLabel',
      'dynamicValues',
      'linked',
      'cases',
      'no',
    ]);
  });
});

describe('a protocol whose node type has a label of its own', () => {
  type Draft = ReturnType<typeof completeProtocol>;
  const firstOf = (record: Record<string, unknown> | undefined) => {
    const [id] = Object.keys(record ?? {});
    if (id === undefined) throw new Error('The fixture holds no such entity');
    return id;
  };

  const protocolWith = (
    label: (ids: {
      nodeType: string;
      edgeType: string;
      textVariable: string;
    }) => unknown,
  ) => {
    const protocol: Draft = completeProtocol();
    const nodeTypes: Record<string, { variables?: Record<string, unknown> }> =
      protocol.codebook.node;
    const nodeType = Object.keys(nodeTypes).find((id) =>
      Object.values(nodeTypes[id]?.variables ?? {}).some(
        (variable) =>
          typeof variable === 'object' &&
          variable !== null &&
          Reflect.get(variable, 'type') === 'text' &&
          Reflect.get(variable, 'encrypted') !== true,
      ),
    );
    if (nodeType === undefined) throw new Error('No node type with text');
    const textVariable = Object.entries(
      nodeTypes[nodeType]?.variables ?? {},
    ).find(
      ([, variable]) =>
        typeof variable === 'object' &&
        variable !== null &&
        Reflect.get(variable, 'type') === 'text' &&
        Reflect.get(variable, 'encrypted') !== true,
    )?.[0];
    if (textVariable === undefined) throw new Error('No text variable');
    const edgeType = firstOf(protocol.codebook.edge);
    Reflect.set(
      nodeTypes[nodeType] ?? {},
      'dynamicLabel',
      label({ nodeType, edgeType, textVariable }),
    );
    return { protocol, nodeType };
  };

  const issuesOf = (protocol: unknown) => {
    const result = ProtocolSchemaV9.safeParse(protocol);
    return result.success
      ? []
      : result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
  };

  it('is valid with attributes, connectivity and a condition', () => {
    const { protocol } = protocolWith(
      ({ nodeType, edgeType, textVariable }) => ({
        text: {
          en: '{named, select, yes {⭐ } other {}}{linked, select, yes {🔗 } other {}}{nodeLabel}',
        },
        dynamicValues: {
          named: { path: 'node.$condition.named', cases: { yes: true } },
          linked: {
            path: `node.$connected.${edgeType}`,
            cases: { yes: true },
          },
          nodeLabel: { path: 'node.$label' },
        },
        conditions: {
          named: {
            name: 'Named',
            filter: {
              join: 'AND',
              rules: [
                {
                  type: 'node',
                  id: 'r1',
                  options: {
                    type: nodeType,
                    attribute: textVariable,
                    operator: 'EXISTS',
                  },
                },
                {
                  type: 'edge',
                  id: 'r2',
                  options: { type: edgeType, operator: 'EXISTS' },
                },
              ],
            },
          },
        },
      }),
    );
    expect(issuesOf(protocol)).toEqual([]);
  });

  it('refuses a condition rule about another node type', () => {
    const { protocol, nodeType } = protocolWith(() => ({
      text: { en: '{named, select, yes {⭐} other {x}}' },
      dynamicValues: {
        named: { path: 'node.$condition.named', cases: { yes: true } },
      },
      conditions: {
        named: {
          name: 'Named',
          filter: {
            rules: [
              {
                type: 'node',
                id: 'r1',
                options: { type: 'someOtherType', operator: 'EXISTS' },
              },
            ],
          },
        },
      },
    }));
    expect(issuesOf(protocol).map((issue) => issue.path)).toContain(
      `codebook.node.${nodeType}.dynamicLabel.conditions.named.filter.rules.0.options.type`,
    );
  });

  it('refuses a condition rule about the participant', () => {
    const { protocol, nodeType } = protocolWith(() => ({
      text: { en: '{named, select, yes {⭐} other {x}}' },
      dynamicValues: {
        named: { path: 'node.$condition.named', cases: { yes: true } },
      },
      conditions: {
        named: {
          name: 'Named',
          filter: {
            rules: [
              {
                type: 'ego',
                id: 'r1',
                options: { attribute: 'egoName', operator: 'EXISTS' },
              },
            ],
          },
        },
      },
    }));
    expect(issuesOf(protocol).map((issue) => issue.path)).toContain(
      `codebook.node.${nodeType}.dynamicLabel.conditions.named.filter.rules.0.type`,
    );
  });

  it('refuses a label that shows an attribute where it could be missing', () => {
    const { protocol, nodeType } = protocolWith(({ textVariable }) => ({
      text: { en: '{name}' },
      dynamicValues: { name: { path: `node.${textVariable}` } },
    }));
    expect(issuesOf(protocol).map((issue) => issue.path)).toEqual([
      `codebook.node.${nodeType}.dynamicLabel.text.en`,
    ]);
  });
});
