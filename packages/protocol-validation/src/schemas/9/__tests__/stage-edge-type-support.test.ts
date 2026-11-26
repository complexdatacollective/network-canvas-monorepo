import { describe, expect, it, vi } from 'vitest';

import { testTypeId, withTestIds } from '../../../__tests__/testIds.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import {
  STAGE_EDGE_TYPE_SUPPORT,
  stageEdgeTypeSupportIssues,
} from '../stage-capabilities.ts';
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

// The complete protocol, with its Sociogram creating `knows` edges so every
// stage type in the table names an edge type.
const baseProtocol = () => {
  const protocol = completeProtocol();
  const stages: unknown[] = protocol.stages;
  for (const stage of stages) {
    if (!isRecord(stage) || stage.type !== 'Sociogram') continue;
    const { prompts } = stage;
    if (!Array.isArray(prompts)) continue;
    for (const prompt of prompts) {
      if (isRecord(prompt)) prompt.edges = { create: 'knows' };
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

  it('names every stage type in the table', () => {
    expect(STAGE_EDGE_TYPES.map(([type]) => type).toSorted()).toEqual(
      Object.keys(STAGE_EDGE_TYPE_SUPPORT).toSorted(),
    );
  });

  it('accepts the protocol with undirected edge types and no rules', async () => {
    expect(await issuesOf(baseProtocol())).toEqual([]);
  });

  describe.each(STAGE_EDGE_TYPES)('%s', (stageType, edgeType) => {
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

  const sociogramOf = (protocol: Protocol) => {
    const stage: unknown = protocol.stages.find(
      ({ type }) => type === 'Sociogram',
    );
    if (!isRecord(stage)) throw new Error('No Sociogram');
    return stage;
  };

  it('accepts a directed edge type named only in a filter rule', async () => {
    const protocol = withAdviceEdgeType(baseProtocol());
    sociogramOf(protocol).filter = {
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
    sociogramOf(protocol).conditions = {
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
});
