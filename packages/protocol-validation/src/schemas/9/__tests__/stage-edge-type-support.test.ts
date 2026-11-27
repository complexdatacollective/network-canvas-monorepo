import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { testTypeId, withTestIds } from '../../../__tests__/testIds.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import { getEntityTypeReferenceDescriptor } from '../entity-type-reference.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import {
  STAGE_EDGE_TYPE_SUPPORT,
  stageEdgeTypeSupportIssues,
} from '../stage-capabilities.ts';
import { stageSchema } from '../stages/index.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

type EdgeStageType = keyof typeof STAGE_EDGE_TYPE_SUPPORT;

// The edge type each stage of the complete protocol names, readable key.
const STAGE_EDGE_TYPES: ReadonlyArray<readonly [EdgeStageType, string]> = [
  ['Sociogram', 'knows'],
  ['Narrative', 'knows'],
  ['DyadCensus', 'knows'],
  ['OneToManyDyadCensus', 'knows'],
  ['TieStrengthCensus', 'knows'],
  ['NetworkComposer', 'knows'],
  ['AlterEdgeForm', 'knows'],
  ['FamilyPedigree', 'family'],
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type Protocol = ReturnType<typeof completeProtocol>;

// The complete protocol, with each of its Sociogram's prompts a connect task
// creating `knows` edges, so every stage type in the table names an edge type.
const baseProtocol = () => {
  const protocol = completeProtocol();
  const stages: unknown[] = protocol.stages;
  for (const stage of stages) {
    if (!isRecord(stage) || stage.type !== 'Sociogram') continue;
    const { prompts } = stage;
    if (!Array.isArray(prompts)) continue;
    for (const prompt of prompts) {
      if (!isRecord(prompt)) continue;
      prompt.task = 'connect';
      prompt.edges = { create: 'knows' };
      delete prompt.highlight;
    }
  }
  return protocol;
};

const withEdgeTypeSettings = (
  protocol: Protocol,
  edgeType: string,
  settings: Record<string, unknown>,
) => {
  const edgeTypes: Record<string, unknown> = protocol.codebook.edge;
  const definition = edgeTypes[edgeType];
  if (!isRecord(definition)) throw new Error(`No edge type ${edgeType}`);
  Object.assign(definition, settings);
  return protocol;
};

const issuesOf = async (protocol: Protocol) => {
  const result = await validateProtocol(withTestIds(protocol));
  return result.success ? [] : result.error.issues;
};

const stageIndexOf = (protocol: Protocol, type: EdgeStageType) =>
  protocol.stages.findIndex((stage) => stage.type === type);

const DIRECTED_MESSAGE = /is directed, which this stage cannot use\./;
const RULES_MESSAGE =
  /limits which node types it connects, which this stage cannot use\./;

// Each issue as `<stage type> <path below the stage>: <message>`, so a list of
// them reads the same however the fixture orders its stages.
const describeIssues = (
  protocol: Protocol,
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
) =>
  issues.map(({ path, message }) => {
    const [root, index, ...rest] = path;
    const stage =
      root === 'stages' && typeof index === 'number'
        ? protocol.stages[index]?.type
        : String(root);
    return `${stage} ${rest.map(String).join('.')}: ${message}`;
  });

// The runtime (non-type) module specifiers a source file loads: imports,
// side-effect imports and re-exports. A dynamic import is reported as
// `import()`, since its specifier need not be a literal.
const runtimeImports = (relativePath: string) => {
  const source = readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  );
  return [
    ...[
      ...source.matchAll(
        /^(?:import|export)\s+(?!type\b)(?:[^;'"]*?from\s+)?['"]([^'"]+)['"];?/gm,
      ),
    ].map((match) => match[1]),
    ...(/\bimport\s*\(/.test(source) ? ['import()'] : []),
  ];
};

// Whether a schema tags an edge type reference outside the places where an
// edge type's direction and endpoint rules do not matter (mirrors the
// traversal of the entity type reference extractor).
const tagsDrawnEdgeType = (
  schema: z.ZodType,
  path: readonly string[] = [],
  seen = new Set<z.ZodType>(),
): boolean => {
  if (seen.has(schema)) return false;
  seen.add(schema);
  const blind = path.some(
    (segment, index) =>
      segment === 'rules' &&
      path[index + 1] === '*' &&
      path[index + 2] === 'options',
  );
  if (getEntityTypeReferenceDescriptor(schema)?.entity === 'edge' && !blind)
    return true;
  const child = (next: unknown, segment?: string): boolean =>
    next instanceof z.ZodType &&
    tagsDrawnEdgeType(
      next,
      segment === undefined ? path : [...path, segment],
      seen,
    );
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  )
    return child(schema.unwrap());
  if (schema instanceof z.ZodPipe) return child(schema.in);
  if (schema instanceof z.ZodObject)
    return Object.entries(schema.shape).some(([key, value]) =>
      child(value, key),
    );
  if (schema instanceof z.ZodArray) return child(schema.element, '*');
  if (schema instanceof z.ZodRecord) return child(schema.valueType, '*');
  if (schema instanceof z.ZodUnion)
    return schema.options.some((option) => child(option));
  return false;
};

const stageTypeOf = (schema: z.ZodType) => {
  if (!(schema instanceof z.ZodObject)) return undefined;
  const type: unknown = schema.shape.type;
  return type instanceof z.ZodLiteral ? String(type.value) : undefined;
};

describe('stage edge type support', () => {
  // The module must be a leaf: `common/subjects.ts` imports it while the
  // stage schemas are still being defined, so loading it first must not reach
  // back into a stage schema that is not yet initialised.
  it('importing stage-capabilities first does not throw', async () => {
    vi.resetModules();
    const capabilities = await import('../stage-capabilities.ts');
    const schema = await import('../schema.ts');
    expect(Object.keys(capabilities.STAGE_EDGE_TYPE_SUPPORT)).toHaveLength(8);
    expect(schema.ProtocolSchemaV9).toBeDefined();
  });

  it('imports at runtime only the edge type rules and edge identity', () => {
    expect(runtimeImports('../stage-capabilities.ts')).toEqual([
      '../../utils/edgeTypeRules.ts',
    ]);
    expect(runtimeImports('../../../utils/edgeTypeRules.ts')).toEqual([
      '@codaco/shared-consts/edge-identity',
    ]);
  });

  it('lists every stage type whose schema names an edge type it draws or creates', () => {
    const drawing = stageSchema.options
      .filter((option) => tagsDrawnEdgeType(option))
      .map((option) => stageTypeOf(option) ?? 'a stage with no type literal');
    expect(drawing.toSorted()).toEqual(
      Object.keys(STAGE_EDGE_TYPE_SUPPORT).toSorted(),
    );
  });

  it('reports each directed edge type use once, by name, at its field', async () => {
    const protocol = withEdgeTypeSettings(baseProtocol(), 'knows', {
      directed: true,
    });
    const message =
      'Edge type "Knows" is directed, which this stage cannot use.';
    expect(describeIssues(protocol, await issuesOf(protocol))).toEqual([
      `NetworkComposer edges.0.subject.type: ${message}`,
      `AlterEdgeForm subject.type: ${message}`,
      `DyadCensus prompts.0.createEdge: ${message}`,
      `TieStrengthCensus prompts.0.createEdge: ${message}`,
      `OneToManyDyadCensus prompts.0.createEdge: ${message}`,
    ]);
  });

  it('reports each endpoint-rule edge type use once, by name, at its field', async () => {
    const protocol = withEdgeTypeSettings(baseProtocol(), 'family', {
      endpointRules: [{ sourceType: 'relative', targetType: 'relative' }],
    });
    expect(describeIssues(protocol, await issuesOf(protocol))).toEqual([
      'FamilyPedigree edgeConfiguration.type: Edge type "Family" limits which node types it connects, which this stage cannot use.',
    ]);
  });

  it('names every stage type in the table', () => {
    expect(STAGE_EDGE_TYPES.map(([type]) => type).toSorted()).toEqual(
      Object.keys(STAGE_EDGE_TYPE_SUPPORT).toSorted(),
    );
  });

  it('accepts the protocol with undirected edge types and no rules', async () => {
    expect(await issuesOf(baseProtocol())).toEqual([]);
  });

  it('lets a Sociogram use directed edge types and endpoint rules', () => {
    expect(STAGE_EDGE_TYPE_SUPPORT.Sociogram).toEqual({
      directed: true,
      endpointRules: true,
    });
  });

  it('lets a Narrative draw directed edge types and endpoint rules', async () => {
    expect(STAGE_EDGE_TYPE_SUPPORT.Narrative).toEqual({
      directed: true,
      endpointRules: true,
    });
    const protocol = withEdgeTypeSettings(baseProtocol(), 'knows', {
      directed: true,
      endpointRules: [{ sourceType: 'person', targetType: 'person' }],
    });
    const index = stageIndexOf(protocol, 'Narrative');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(
      (await issuesOf(protocol)).filter(
        (issue) => issue.path[0] === 'stages' && issue.path[1] === index,
      ),
    ).toEqual([]);
  });

  it('accepts a directed edge type on a Sociogram', async () => {
    const protocol = withEdgeTypeSettings(baseProtocol(), 'knows', {
      directed: true,
      endpointRules: [{ sourceType: 'person', targetType: 'person' }],
    });
    const index = stageIndexOf(protocol, 'Sociogram');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(
      (await issuesOf(protocol)).filter(
        (issue) => issue.path[0] === 'stages' && issue.path[1] === index,
      ),
    ).toEqual([]);
  });

  describe.each(
    STAGE_EDGE_TYPES.filter(
      ([stageType]) => !STAGE_EDGE_TYPE_SUPPORT[stageType].directed,
    ),
  )('%s', (stageType, edgeType) => {
    it('refuses a directed edge type', async () => {
      const protocol = withEdgeTypeSettings(baseProtocol(), edgeType, {
        directed: true,
      });
      const index = stageIndexOf(protocol, stageType);
      expect(index).toBeGreaterThanOrEqual(0);
      const issues = await issuesOf(protocol);
      expect(
        issues.some(
          (issue) =>
            issue.path[0] === 'stages' &&
            issue.path[1] === index &&
            DIRECTED_MESSAGE.test(issue.message),
        ),
      ).toBe(true);
    });

    it('refuses an edge type with endpoint rules', async () => {
      const nodeType = stageType === 'FamilyPedigree' ? 'relative' : 'person';
      const protocol = withEdgeTypeSettings(baseProtocol(), edgeType, {
        endpointRules: [{ sourceType: nodeType, targetType: nodeType }],
      });
      const index = stageIndexOf(protocol, stageType);
      const issues = await issuesOf(protocol);
      expect(
        issues.some(
          (issue) =>
            issue.path[0] === 'stages' &&
            issue.path[1] === index &&
            RULES_MESSAGE.test(issue.message),
        ),
      ).toBe(true);
    });
  });

  // A directed edge type with rules that no stage draws or creates.
  const withAdviceEdgeType = (protocol: Protocol) => {
    Object.assign(protocol.codebook.edge, {
      advice: {
        name: 'Advice',
        color: 'edge-color-seq-3',
        directed: true,
        endpointRules: [{ sourceType: 'person', targetType: 'person' }],
      },
    });
    return protocol;
  };

  // A stage that still refuses directed edge types and endpoint rules.
  const dyadCensusOf = (protocol: Protocol) => {
    const stage: unknown = protocol.stages.find(
      ({ type }) => type === 'DyadCensus',
    );
    if (!isRecord(stage)) throw new Error('No Dyad Census');
    return stage;
  };

  it('accepts a directed edge type named only in a filter rule', async () => {
    const protocol = withAdviceEdgeType(baseProtocol());
    dyadCensusOf(protocol).filter = {
      join: 'AND',
      rules: [
        {
          id: 'adviceRule',
          type: 'edge',
          options: { type: 'advice', operator: 'EXISTS' },
        },
      ],
    };
    expect(await issuesOf(protocol)).toEqual([]);
  });

  it("accepts a directed edge type named only in a condition's edge-count rule", async () => {
    const protocol = withAdviceEdgeType(baseProtocol());
    dyadCensusOf(protocol).conditions = {
      [testTypeId('adviceCondition')]: {
        about: 'node',
        rules: [
          {
            id: 'adviceCount',
            type: 'edge',
            options: { type: 'advice', count: 'MOST' },
          },
        ],
      },
    };
    expect(await issuesOf(protocol)).toEqual([]);
  });

  it('does not judge a stage type outside the table', async () => {
    const result = await ProtocolSchemaV9.safeParseAsync(
      withTestIds(withAdviceEdgeType(baseProtocol())),
    );
    if (!result.success) throw result.error;
    const protocol = result.data;
    const stageIndex = (type: string) =>
      protocol.stages.findIndex((stage) => stage.type === type);
    const hit = (index: number) => ({
      path: ['stages', index, 'someField'],
      typeId: testTypeId('advice'),
      entity: 'edge' as const,
    });
    const nameGenerator = stageIndex('NameGenerator');
    const dyadCensus = stageIndex('DyadCensus');
    expect(nameGenerator).toBeGreaterThanOrEqual(0);
    expect(
      stageEdgeTypeSupportIssues(protocol, [
        hit(nameGenerator),
        hit(dyadCensus),
      ]).map(({ path }) => path[1]),
    ).toEqual([dyadCensus, dyadCensus]);
  });

  it.each([
    [['rules', 0, 'someField'], 2],
    [['rules', 'options', 'type'], 2],
    [['rules', 'byName', 'options', 'type'], 2],
    [['conditions', 'c1', 'someField'], 2],
    [['conditions', 'c1', 'rules', 0, 'options', 'type'], 0],
  ])(
    'judges a hit at %j only when it is not in the options of a rule',
    async (rest, count) => {
      const result = await ProtocolSchemaV9.safeParseAsync(
        withTestIds(withAdviceEdgeType(baseProtocol())),
      );
      if (!result.success) throw result.error;
      const protocol = result.data;
      const dyadCensus = protocol.stages.findIndex(
        (stage) => stage.type === 'DyadCensus',
      );
      expect(
        stageEdgeTypeSupportIssues(protocol, [
          {
            path: ['stages', dyadCensus, ...rest],
            typeId: testTypeId('advice'),
            entity: 'edge',
          },
        ]),
      ).toHaveLength(count);
    },
  );

  it('does not judge a node type hit that shares an edge type id', async () => {
    const result = await ProtocolSchemaV9.safeParseAsync(
      withTestIds(withAdviceEdgeType(baseProtocol())),
    );
    if (!result.success) throw result.error;
    const protocol = result.data;
    const dyadCensus = protocol.stages.findIndex(
      (stage) => stage.type === 'DyadCensus',
    );
    expect(
      stageEdgeTypeSupportIssues(protocol, [
        {
          path: ['stages', dyadCensus, 'subject', 'types', 0],
          typeId: testTypeId('advice'),
          entity: 'node',
        },
      ]),
    ).toEqual([]);
  });

  it.each([
    {
      support: { directed: false, endpointRules: false },
      expected: [DIRECTED_MESSAGE, RULES_MESSAGE],
    },
    {
      support: { directed: true, endpointRules: false },
      expected: [RULES_MESSAGE],
    },
    {
      support: { directed: false, endpointRules: true },
      expected: [DIRECTED_MESSAGE],
    },
    { support: { directed: true, endpointRules: true }, expected: [] },
  ])(
    'judges each setting by its own flag when a stage supports $support',
    async ({ support, expected }) => {
      const result = await ProtocolSchemaV9.safeParseAsync(
        withTestIds(withAdviceEdgeType(baseProtocol())),
      );
      if (!result.success) throw result.error;
      const protocol = result.data;
      const dyadCensus = protocol.stages.findIndex(
        (stage) => stage.type === 'DyadCensus',
      );
      const saved = STAGE_EDGE_TYPE_SUPPORT.DyadCensus;
      STAGE_EDGE_TYPE_SUPPORT.DyadCensus = support;
      try {
        const messages = stageEdgeTypeSupportIssues(protocol, [
          {
            path: ['stages', dyadCensus, 'someField'],
            typeId: testTypeId('advice'),
            entity: 'edge',
          },
        ]).map(({ message }) => message);
        expect(messages).toHaveLength(expected.length);
        expected.forEach((pattern, index) =>
          expect(messages[index]).toMatch(pattern),
        );
      } finally {
        STAGE_EDGE_TYPE_SUPPORT.DyadCensus = saved;
      }
    },
  );
});
