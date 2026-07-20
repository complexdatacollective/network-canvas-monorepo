import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type SkipLogic,
  type SkipLogicDestination,
  type Stage,
  stageSchema,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  StageMetadataSchema,
} from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0];

type ZodLiteralDef = { _zod: { def: { values: string[] } } };
type ZodOptionShape = { shape: { type: ZodLiteralDef } };

/**
 * Extract all stage type literals from the protocol validation schema
 * at runtime, so this test automatically breaks when new stage types
 * are added to the schema but not handled by generateNetwork.
 */
function getAllStageTypes(): string[] {
  const options = (stageSchema as unknown as { options: ZodOptionShape[] })
    .options;
  return options.map((s) => {
    const value = s.shape.type._zod.def.values[0];
    if (!value) throw new Error('Could not extract stage type from schema');
    return value;
  });
}

function makeCodebook(overrides?: Partial<Codebook>): Codebook {
  return {
    node: {
      'node-type-1': {
        color: 'node-color-seq-1',
        variables: {
          'var-name': { name: 'Name', type: 'text' },
        },
      },
    },
    edge: {
      'edge-type-1': {
        color: 'edge-color-seq-1',
        variables: {},
      },
    },
    ...overrides,
  };
}

function makeNameGeneratorStage(overrides?: Record<string, unknown>): Stage {
  return {
    id: 'stage-ng',
    label: 'Name Generator',
    type: 'NameGenerator',
    subject: { entity: 'node', type: 'node-type-1' },
    prompts: [{ id: 'prompt-ng', text: 'Add people' }],
    behaviours: { minNodes: 5, maxNodes: 8 },
    ...overrides,
  } as Stage;
}

function makeRosterStage(overrides?: Record<string, unknown>): Stage {
  return {
    id: 'stage-ngr',
    label: 'Roster',
    type: 'NameGeneratorRoster',
    subject: { entity: 'node', type: 'node-type-1' },
    dataSource: 'roster-asset',
    prompts: [{ id: 'prompt-ngr', text: 'Pick people' }],
    behaviours: { minNodes: 1, maxNodes: 8 },
    ...overrides,
  } as Stage;
}

const ROSTER_UID_PREFIX = 'roster-row-';

function rosterNameFor(primaryKey: string): string {
  return `Roster person ${primaryKey.slice(ROSTER_UID_PREFIX.length)}`;
}

function isRosterUid(primaryKey: string): boolean {
  return primaryKey.startsWith(ROSTER_UID_PREFIX);
}

function makeRosterPool(count: number): NcNode[] {
  return Array.from({ length: count }, (_, i) => {
    const primaryKey = `${ROSTER_UID_PREFIX}${i}`;
    return {
      [entityPrimaryKeyProperty]: primaryKey,
      type: 'node-type-1',
      [entityAttributesProperty]: { 'var-name': rosterNameFor(primaryKey) },
    } as NcNode;
  });
}

function uniquePrimaryKeys(network: { nodes: NcNode[] }): number {
  return new Set(network.nodes.map((n) => n[entityPrimaryKeyProperty])).size;
}

function stripUnstableIds(network: { nodes: NcNode[]; edges: unknown[] }) {
  return {
    nodes: network.nodes.map((n) => ({
      ...n,
      [entityPrimaryKeyProperty]: isRosterUid(n[entityPrimaryKeyProperty])
        ? n[entityPrimaryKeyProperty]
        : 'fabricated',
    })),
    edgeCount: network.edges.length,
  };
}

function makeDyadCensusStage(overrides?: Record<string, unknown>): Stage {
  return {
    id: 'stage-dc',
    label: 'Dyad Census',
    type: 'DyadCensus',
    subject: { entity: 'node', type: 'node-type-1' },
    prompts: [
      { id: 'prompt-dc-1', text: 'Pair 1', createEdge: 'edge-type-1' },
      { id: 'prompt-dc-2', text: 'Pair 2', createEdge: 'edge-type-1' },
    ],
    ...overrides,
  } as Stage;
}

function makeTieStrengthCensusStage(
  overrides?: Record<string, unknown>,
): Stage {
  return {
    id: 'stage-tsc',
    label: 'Tie Strength',
    type: 'TieStrengthCensus',
    subject: { entity: 'node', type: 'node-type-1' },
    prompts: [
      { id: 'prompt-tsc', text: 'Strength', createEdge: 'edge-type-1' },
    ],
    ...overrides,
  } as Stage;
}

function makeFamilyPedigreeStage(overrides?: Record<string, unknown>): Stage {
  return {
    id: 'stage-fp',
    label: 'Family',
    type: 'FamilyPedigree',
    nodeConfig: {
      type: 'node-type-1',
      nodeLabelVariable: 'var-name',
      egoVariable: 'var-ego',
      biologicalSexVariable: 'var-sex',
      relationshipVariable: 'var-rel',
    },
    edgeConfig: {
      type: 'edge-type-1',
      relationshipTypeVariable: 'var-rel-type',
      isActiveVariable: 'var-active',
      isGestationalCarrierVariable: 'var-gestational',
    },
    censusPrompt: 'Tell us about your family',
    ...overrides,
  } as unknown as Stage;
}

function makeInformationStage(id: string, skipLogic?: SkipLogic): Stage {
  return {
    id,
    label: id,
    type: 'Information',
    title: id,
    items: [],
    skipLogic,
  } as Stage;
}

function makeTypedNameGeneratorStage(id: string, nodeType: string): Stage {
  return makeNameGeneratorStage({
    id,
    label: id,
    subject: { entity: 'node', type: nodeType },
    prompts: [{ id: `${id}-prompt`, text: id }],
    behaviours: { minNodes: 2, maxNodes: 2 },
  });
}

function makeHiddenSkipLogic(
  destination?: SkipLogicDestination,
  action: SkipLogic['action'] = 'SKIP',
): SkipLogic {
  return {
    action,
    filter: {
      rules: [
        {
          id: `${action.toLowerCase()}-consent-rule`,
          type: 'ego',
          options: {
            attribute: asEntityAttributeReference('consent'),
            operator: action === 'SKIP' ? 'NOT_EXISTS' : 'EXISTS',
          },
        },
      ],
    },
    destination,
  };
}

function makeSkipRoutingCodebook(): Codebook {
  const nodeDefinition = {
    color: 'node-color-seq-1',
    variables: { 'var-name': { name: 'Name', type: 'text' } },
  };

  return makeCodebook({
    ego: {
      variables: {
        consent: { name: 'Consent', type: 'boolean' },
      },
    },
    node: {
      bypassed: nodeDefinition,
      destination: nodeDefinition,
      final: nodeDefinition,
    },
  });
}

describe('generateNetwork', () => {
  describe('targeted skip destinations', () => {
    it('preserves the legacy one-stage skip when destination is absent', () => {
      const stages = [
        makeTypedNameGeneratorStage('skipped', 'bypassed'),
        makeTypedNameGeneratorStage('next', 'destination'),
      ];
      stages[0] = {
        ...stages[0]!,
        skipLogic: makeHiddenSkipLogic(),
      } as Stage;

      const { network } = generateNetwork(makeSkipRoutingCodebook(), stages, {
        seed: 42,
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes).toHaveLength(2);
      expect(network.nodes.every((node) => node.type === 'destination')).toBe(
        true,
      );
    });

    it('jumps over intermediate stages to a forward stage destination', () => {
      const stages = [
        makeInformationStage(
          'source',
          makeHiddenSkipLogic({ type: 'stage', stageId: 'target' }),
        ),
        makeTypedNameGeneratorStage('middle', 'bypassed'),
        makeTypedNameGeneratorStage('target', 'destination'),
      ];

      const { network } = generateNetwork(makeSkipRoutingCodebook(), stages, {
        seed: 42,
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes).toHaveLength(2);
      expect(network.nodes.every((node) => node.type === 'destination')).toBe(
        true,
      );
    });

    it('stops generation at a finish destination', () => {
      const stages = [
        makeInformationStage(
          'source',
          makeHiddenSkipLogic({ type: 'finish' }, 'SHOW'),
        ),
        makeTypedNameGeneratorStage('unreachable', 'bypassed'),
      ];

      const { network } = generateNetwork(makeSkipRoutingCodebook(), stages, {
        seed: 42,
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes).toHaveLength(0);
    });

    it('evaluates a hidden destination and follows its chained destination', () => {
      const stages = [
        makeInformationStage(
          'source',
          makeHiddenSkipLogic({ type: 'stage', stageId: 'second-source' }),
        ),
        makeTypedNameGeneratorStage('first-middle', 'bypassed'),
        makeInformationStage(
          'second-source',
          makeHiddenSkipLogic({ type: 'stage', stageId: 'target' }),
        ),
        makeTypedNameGeneratorStage('second-middle', 'bypassed'),
        makeTypedNameGeneratorStage('target', 'final'),
      ];

      const { network } = generateNetwork(makeSkipRoutingCodebook(), stages, {
        seed: 42,
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes).toHaveLength(2);
      expect(network.nodes.every((node) => node.type === 'final')).toBe(true);
    });

    it('does not activate skip logic on a bypassed stage', () => {
      const stages = [
        makeInformationStage(
          'source',
          makeHiddenSkipLogic({ type: 'stage', stageId: 'target' }),
        ),
        makeInformationStage(
          'bypassed-finish',
          makeHiddenSkipLogic({ type: 'finish' }),
        ),
        makeTypedNameGeneratorStage('target', 'destination'),
      ];

      const { network } = generateNetwork(makeSkipRoutingCodebook(), stages, {
        seed: 42,
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes).toHaveLength(2);
      expect(network.nodes.every((node) => node.type === 'destination')).toBe(
        true,
      );
    });
  });

  describe('FamilyPedigree stage', () => {
    it('should use nodeConfig.type for node types, not a hardcoded fallback', () => {
      const codebook = makeCodebook();
      const stages = [makeFamilyPedigreeStage()];

      const { network } = generateNetwork(codebook, stages, { seed: 42 });

      expect(network.nodes.length).toBeGreaterThan(0);

      for (const node of network.nodes) {
        expect(node.type).toBe('node-type-1');
      }
    });

    it('should use edgeConfig.type for edge types', () => {
      const codebook = makeCodebook();
      const stages = [makeFamilyPedigreeStage()];

      const { network } = generateNetwork(codebook, stages, { seed: 42 });

      expect(network.edges.length).toBeGreaterThan(0);

      for (const edge of network.edges) {
        expect(edge.type).toBe('edge-type-1');
      }
    });

    it('should only produce node types that exist in the codebook', () => {
      const codebook = makeCodebook();
      const stages = [makeFamilyPedigreeStage()];

      const { network } = generateNetwork(codebook, stages, { seed: 42 });

      const codebookNodeTypes = new Set(Object.keys(codebook.node ?? {}));

      for (const node of network.nodes) {
        expect(codebookNodeTypes.has(node.type)).toBe(true);
      }
    });

    it('should generate attributes from the codebook node type definition', () => {
      const codebook = makeCodebook();
      const stages = [makeFamilyPedigreeStage()];

      const { network } = generateNetwork(codebook, stages, { seed: 42 });

      for (const node of network.nodes) {
        const attrs = node[entityAttributesProperty];
        expect(attrs).toHaveProperty('var-name');
      }
    });

    it('should not create nodes when nodeConfig is missing', () => {
      const codebook = makeCodebook();
      const stages = [
        makeFamilyPedigreeStage({
          nodeConfig: undefined,
          edgeConfig: undefined,
        }),
      ];

      const { network } = generateNetwork(codebook, stages, { seed: 42 });

      expect(network.nodes.length).toBe(0);
      expect(network.edges.length).toBe(0);
    });
  });

  describe('all node types match codebook', () => {
    it('should never produce nodes with type "person" or "Unknown"', () => {
      const codebook = makeCodebook();
      const stages: Stage[] = [
        {
          id: 'stage-ng',
          label: 'Name Generator',
          type: 'NameGenerator',
          subject: { entity: 'node', type: 'node-type-1' },
          prompts: [{ id: 'prompt-1', text: 'Add people' }],
          behaviours: { minNodes: 2, maxNodes: 5 },
        } as Stage,
        makeFamilyPedigreeStage(),
      ];

      const { network } = generateNetwork(codebook, stages, { seed: 42 });

      for (const node of network.nodes) {
        expect(node.type).not.toBe('person');
        expect(node.type).not.toBe('Unknown');
        expect(node.type).toBe('node-type-1');
      }
    });
  });

  describe('name generator node bounds', () => {
    it('does not throw when minNodes exceeds the default maxNodes and maxNodes is omitted', () => {
      const codebook = makeCodebook();
      const stages = [makeNameGeneratorStage({ behaviours: { minNodes: 9 } })];

      const { network } = generateNetwork(codebook, stages, { seed: 42 });

      expect(network.nodes.length).toBeGreaterThanOrEqual(9);
      for (const node of network.nodes) {
        expect(node.type).toBe('node-type-1');
      }
    });

    it('does not throw when minNodes exceeds an explicit smaller maxNodes', () => {
      const codebook = makeCodebook();
      const stages = [
        makeNameGeneratorStage({ behaviours: { minNodes: 6, maxNodes: 3 } }),
      ];

      const { network } = generateNetwork(codebook, stages, { seed: 42 });

      expect(network.nodes.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('stageMetadata schema compliance', () => {
    it('FamilyPedigree writes isNetworkCommitted keyed by stage step', () => {
      const codebook = makeCodebook();
      const stages = [makeFamilyPedigreeStage()];

      const { stageMetadata } = generateNetwork(codebook, stages, { seed: 42 });

      expect(stageMetadata).toEqual({ 0: { isNetworkCommitted: true } });
      expect(StageMetadataSchema.safeParse(stageMetadata).success).toBe(true);
    });

    it('DyadCensus writes [promptIndex, fromId, toId, false] tuples keyed by stage step', () => {
      const codebook = makeCodebook();
      const stages = [makeNameGeneratorStage(), makeDyadCensusStage()];

      const { stageMetadata, network } = generateNetwork(codebook, stages, {
        seed: 42,
      });

      expect(stageMetadata).not.toBeNull();
      const meta = stageMetadata?.[1];
      expect(Array.isArray(meta)).toBe(true);

      const nodeIds = new Set(
        network.nodes.map((n) => n[entityPrimaryKeyProperty]),
      );
      const promptCount = 2;

      for (const tuple of meta as unknown[][]) {
        expect(tuple).toHaveLength(4);
        expect(typeof tuple[0]).toBe('number');
        expect(tuple[0] as number).toBeGreaterThanOrEqual(0);
        expect(tuple[0] as number).toBeLessThan(promptCount);
        expect(nodeIds.has(tuple[1] as string)).toBe(true);
        expect(nodeIds.has(tuple[2] as string)).toBe(true);
        expect(tuple[3]).toBe(false);
      }

      expect(StageMetadataSchema.safeParse(stageMetadata).success).toBe(true);
    });

    it('TieStrengthCensus writes the same tuple shape as DyadCensus', () => {
      const codebook = makeCodebook();
      const stages = [makeNameGeneratorStage(), makeTieStrengthCensusStage()];

      const { stageMetadata, network } = generateNetwork(codebook, stages, {
        seed: 42,
      });

      const meta = stageMetadata?.[1];
      expect(Array.isArray(meta)).toBe(true);

      const nodeIds = new Set(
        network.nodes.map((n) => n[entityPrimaryKeyProperty]),
      );

      for (const tuple of meta as unknown[][]) {
        expect(tuple).toHaveLength(4);
        expect(typeof tuple[0]).toBe('number');
        expect(nodeIds.has(tuple[1] as string)).toBe(true);
        expect(nodeIds.has(tuple[2] as string)).toBe(true);
        expect(tuple[3]).toBe(false);
      }

      expect(StageMetadataSchema.safeParse(stageMetadata).success).toBe(true);
    });

    it('mixed protocol with FamilyPedigree + DyadCensus produces schema-valid metadata', () => {
      const codebook = makeCodebook();
      const stages = [
        makeNameGeneratorStage(),
        makeDyadCensusStage(),
        makeFamilyPedigreeStage({ id: 'stage-fp-2' }),
      ];

      const { stageMetadata } = generateNetwork(codebook, stages, { seed: 42 });

      const result = StageMetadataSchema.safeParse(stageMetadata);
      expect(result.success).toBe(true);
      expect(stageMetadata?.[2]).toEqual({ isNetworkCommitted: true });
    });
  });

  describe('inProgressStageIndex option', () => {
    function makeBinCodebook(): Codebook {
      return makeCodebook({
        node: {
          'node-type-1': {
            color: 'node-color-seq-1',
            variables: {
              'var-name': { name: 'Name', type: 'text' },
              'var-ordinal': {
                name: 'Closeness',
                type: 'ordinal',
                options: [
                  { label: 'Low', value: 1 },
                  { label: 'Mid', value: 2 },
                  { label: 'High', value: 3 },
                ],
              },
              'var-cat': {
                name: 'Group',
                type: 'categorical',
                options: [
                  { label: 'A', value: 'a' },
                  { label: 'B', value: 'b' },
                ],
              },
              'var-other': { name: 'Other group', type: 'text' },
            },
          },
        },
      });
    }

    function makeOrdinalBinStage(): Stage {
      return {
        id: 'stage-ob',
        label: 'Ordinal Bin',
        type: 'OrdinalBin',
        subject: { entity: 'node', type: 'node-type-1' },
        prompts: [
          { id: 'prompt-ob', text: 'How close?', variable: 'var-ordinal' },
        ],
      } as Stage;
    }

    function makeCategoricalBinStage(): Stage {
      return {
        id: 'stage-cb',
        label: 'Categorical Bin',
        type: 'CategoricalBin',
        subject: { entity: 'node', type: 'node-type-1' },
        prompts: [
          {
            id: 'prompt-cb',
            text: 'Which group?',
            variable: 'var-cat',
            otherVariable: 'var-other',
          },
        ],
      } as Stage;
    }

    it('leaves every node placed when the option is not set', () => {
      const codebook = makeBinCodebook();
      const stages = [makeNameGeneratorStage(), makeOrdinalBinStage()];

      const { network } = generateNetwork(codebook, stages, { seed: 42 });

      expect(network.nodes.length).toBeGreaterThan(0);
      for (const node of network.nodes) {
        expect(node[entityAttributesProperty]['var-ordinal']).not.toBeNull();
      }
    });

    it('clears the prompt variable on roughly half the nodes of an in-progress OrdinalBin', () => {
      const codebook = makeBinCodebook();
      const stages = [makeNameGeneratorStage(), makeOrdinalBinStage()];

      const { network } = generateNetwork(codebook, stages, {
        seed: 42,
        inProgressStageIndex: 1,
      });

      const nodeCount = network.nodes.length;
      const unplaced = network.nodes.filter(
        (n) => n[entityAttributesProperty]['var-ordinal'] === null,
      );
      const placed = network.nodes.filter(
        (n) => n[entityAttributesProperty]['var-ordinal'] !== null,
      );

      expect(unplaced.length).toBe(Math.max(1, Math.floor(nodeCount / 2)));
      expect(placed.length).toBeGreaterThan(0);

      const optionValues = new Set([1, 2, 3]);
      for (const node of placed) {
        expect(
          optionValues.has(
            node[entityAttributesProperty]['var-ordinal'] as number,
          ),
        ).toBe(true);
      }
    });

    it('clears both the prompt variable and otherVariable of an in-progress CategoricalBin', () => {
      const codebook = makeBinCodebook();
      const stages = [makeNameGeneratorStage(), makeCategoricalBinStage()];

      const { network } = generateNetwork(codebook, stages, {
        seed: 42,
        inProgressStageIndex: 1,
      });

      const uncategorised = network.nodes.filter(
        (n) => n[entityAttributesProperty]['var-cat'] === null,
      );
      expect(uncategorised.length).toBeGreaterThan(0);

      for (const node of uncategorised) {
        expect(node[entityAttributesProperty]['var-other']).toBeNull();
      }
    });

    it('clears the layout variable of an in-progress Sociogram', () => {
      const codebook = makeCodebook({
        node: {
          'node-type-1': {
            color: 'node-color-seq-1',
            variables: {
              'var-name': { name: 'Name', type: 'text' },
              'var-layout': { name: 'Layout', type: 'layout' },
            },
          },
        },
      });
      const stages = [
        makeNameGeneratorStage(),
        {
          id: 'stage-soc',
          label: 'Sociogram',
          type: 'Sociogram',
          subject: { entity: 'node', type: 'node-type-1' },
          prompts: [
            {
              id: 'prompt-soc',
              text: 'Place people',
              layout: { layoutVariable: 'var-layout' },
            },
          ],
        } as Stage,
      ];

      const { network } = generateNetwork(codebook, stages, {
        seed: 42,
        inProgressStageIndex: 1,
      });

      const unplaced = network.nodes.filter(
        (n) => n[entityAttributesProperty]['var-layout'] === null,
      );
      expect(unplaced.length).toBe(
        Math.max(1, Math.floor(network.nodes.length / 2)),
      );
    });

    it('has no effect when the in-progress stage is not interaction-driven', () => {
      const codebook = makeBinCodebook();
      const stages = [makeNameGeneratorStage(), makeOrdinalBinStage()];

      const { network } = generateNetwork(codebook, stages, {
        seed: 42,
        inProgressStageIndex: 0,
      });

      for (const node of network.nodes) {
        expect(node[entityAttributesProperty]['var-ordinal']).not.toBeNull();
      }
    });

    it('ignores an out-of-range stage index', () => {
      const codebook = makeBinCodebook();
      const stages = [makeNameGeneratorStage(), makeOrdinalBinStage()];

      expect(() =>
        generateNetwork(codebook, stages, {
          seed: 42,
          inProgressStageIndex: 99,
        }),
      ).not.toThrow();
    });
  });

  describe('roster-backed generation', () => {
    it('draws every node on a roster stage from the roster, keeping ids and values', () => {
      const stage = makeRosterStage({
        behaviours: { minNodes: 3, maxNodes: 3 },
      });

      const { network } = generateNetwork(makeCodebook(), [stage], {
        seed: 42,
        externalData: { 'stage-ngr': makeRosterPool(5) },
      });

      expect(network.nodes).toHaveLength(3);
      for (const node of network.nodes) {
        expect(isRosterUid(node[entityPrimaryKeyProperty])).toBe(true);
        expect(node[entityAttributesProperty]['var-name']).toBe(
          rosterNameFor(node[entityPrimaryKeyProperty]),
        );
      }
    });

    it('never draws the same roster row twice across prompts', () => {
      const stage = makeRosterStage({
        prompts: [
          { id: 'prompt-1', text: 'Prompt one' },
          { id: 'prompt-2', text: 'Prompt two' },
        ],
        behaviours: { minNodes: 4, maxNodes: 8 },
      });

      const { network } = generateNetwork(makeCodebook(), [stage], {
        seed: 7,
        externalData: { 'stage-ngr': makeRosterPool(10) },
      });

      expect(network.nodes.length).toBeGreaterThan(1);
      expect(uniquePrimaryKeys(network)).toBe(network.nodes.length);
      expect(network.nodes.length).toBeLessThanOrEqual(8);
    });

    it('never draws the same roster row twice across stages sharing a roster', () => {
      const pool = makeRosterPool(4);
      const stages = [
        makeRosterStage({
          id: 'stage-a',
          behaviours: { minNodes: 2, maxNodes: 2 },
        }),
        makeRosterStage({
          id: 'stage-b',
          behaviours: { minNodes: 2, maxNodes: 2 },
        }),
      ];

      const { network } = generateNetwork(makeCodebook(), stages, {
        seed: 42,
        externalData: { 'stage-a': pool, 'stage-b': pool },
      });

      expect(network.nodes).toHaveLength(4);
      expect(uniquePrimaryKeys(network)).toBe(4);
    });

    it('stops at the roster size on a roster stage, even below minNodes', () => {
      const stage = makeRosterStage({
        behaviours: { minNodes: 5, maxNodes: 8 },
      });

      const { network } = generateNetwork(makeCodebook(), [stage], {
        seed: 42,
        externalData: { 'stage-ngr': makeRosterPool(2) },
      });

      expect(network.nodes).toHaveLength(2);
    });

    it.each([
      ['no entry for the stage', undefined],
      ['an empty entry for the stage', { 'stage-ngr': [] }],
    ])('fabricates people given %s', (_label, externalData) => {
      const stage = makeRosterStage({
        behaviours: { minNodes: 3, maxNodes: 3 },
      });

      const { network } = generateNetwork(makeCodebook(), [stage], {
        seed: 42,
        externalData,
      });

      expect(network.nodes).toHaveLength(3);
      expect(
        network.nodes.every((n) => !isRosterUid(n[entityPrimaryKeyProperty])),
      ).toBe(true);
    });

    it('tops up from the codebook when a stage also offers a manual add path', () => {
      const stage = makeNameGeneratorStage({
        behaviours: { minNodes: 8, maxNodes: 8 },
      });

      const { network } = generateNetwork(makeCodebook(), [stage], {
        seed: 42,
        externalData: { 'stage-ng': makeRosterPool(2) },
      });

      expect(network.nodes).toHaveLength(8);
      const fromRoster = network.nodes.filter((n) =>
        isRosterUid(n[entityPrimaryKeyProperty]),
      );
      expect(fromRoster).toHaveLength(2);
    });

    it('mixes roster and fabricated people when the roster is ample', () => {
      const stage = makeNameGeneratorStage({
        behaviours: { minNodes: 20, maxNodes: 20 },
      });

      const { network } = generateNetwork(makeCodebook(), [stage], {
        seed: 42,
        externalData: { 'stage-ng': makeRosterPool(50) },
      });

      const fromRoster = network.nodes.filter((n) =>
        isRosterUid(n[entityPrimaryKeyProperty]),
      );
      expect(fromRoster.length).toBeGreaterThan(0);
      expect(fromRoster.length).toBeLessThan(network.nodes.length);
    });

    it('adds nobody once an earlier stage exhausts a shared roster', () => {
      const pool = makeRosterPool(3);
      const stages = [
        makeRosterStage({
          id: 'stage-a',
          behaviours: { minNodes: 3, maxNodes: 3 },
        }),
        makeRosterStage({
          id: 'stage-b',
          behaviours: { minNodes: 2, maxNodes: 2 },
        }),
      ];

      const { network } = generateNetwork(makeCodebook(), stages, {
        seed: 42,
        externalData: { 'stage-a': pool, 'stage-b': pool },
      });

      expect(network.nodes.filter((n) => n.stageId === 'stage-a')).toHaveLength(
        3,
      );
      expect(network.nodes.filter((n) => n.stageId === 'stage-b')).toHaveLength(
        0,
      );
    });

    it('keeps roster values through the form field pass', () => {
      const stage = makeNameGeneratorStage({
        behaviours: { minNodes: 3, maxNodes: 3 },
        form: { fields: [{ variable: 'var-name', prompt: 'Their name' }] },
      });

      const { network } = generateNetwork(makeCodebook(), [stage], {
        seed: 42,
        externalData: { 'stage-ng': makeRosterPool(5) },
      });

      const fromRoster = network.nodes.filter((n) =>
        isRosterUid(n[entityPrimaryKeyProperty]),
      );
      expect(fromRoster.length).toBeGreaterThan(0);
      for (const node of fromRoster) {
        expect(node[entityAttributesProperty]['var-name']).toBe(
          rosterNameFor(node[entityPrimaryKeyProperty]),
        );
      }
    });

    it('lets prompt attributes win over a colliding roster column', () => {
      const stage = makeRosterStage({
        prompts: [
          {
            id: 'prompt-1',
            text: 'Prompt one',
            additionalAttributes: [{ variable: 'var-name', value: true }],
          },
        ],
        behaviours: { minNodes: 2, maxNodes: 2 },
      });

      const { network } = generateNetwork(makeCodebook(), [stage], {
        seed: 42,
        externalData: { 'stage-ngr': makeRosterPool(5) },
      });

      expect(network.nodes).toHaveLength(2);
      for (const node of network.nodes) {
        expect(isRosterUid(node[entityPrimaryKeyProperty])).toBe(true);
        expect(node[entityAttributesProperty]['var-name']).toBe(true);
      }
    });

    it('stays reproducible for a given seed', () => {
      const stages = [
        makeRosterStage({ behaviours: { minNodes: 2, maxNodes: 6 } }),
      ];
      const externalData = { 'stage-ngr': makeRosterPool(8) };

      const first = generateNetwork(makeCodebook(), stages, {
        seed: 99,
        externalData,
      });
      const second = generateNetwork(makeCodebook(), stages, {
        seed: 99,
        externalData,
      });

      expect(stripUnstableIds(first.network)).toEqual(
        stripUnstableIds(second.network),
      );
    });
  });

  describe('stage type coverage', () => {
    it('should handle every stage type defined in the protocol validation schema', () => {
      const allStageTypes = getAllStageTypes();
      expect(allStageTypes.length).toBeGreaterThan(0);

      const codebook = makeCodebook();

      for (const stageType of allStageTypes) {
        const stage = {
          id: `stage-${stageType}`,
          label: stageType,
          type: stageType,
          // Properties used by various stage types — include all so that
          // whichever branch runs has something to work with.
          subject: { entity: 'node', type: 'node-type-1' },
          prompts: [{ id: 'prompt-1', text: 'Test prompt' }],
          // FamilyPedigree-specific
          nodeConfig: {
            type: 'node-type-1',
            nodeLabelVariable: 'var-name',
            egoVariable: 'var-ego',
            biologicalSexVariable: 'var-sex',
            relationshipVariable: 'var-rel',
          },
          edgeConfig: {
            type: 'edge-type-1',
            relationshipTypeVariable: 'var-rel-type',
            isActiveVariable: 'var-active',
            isGestationalCarrierVariable: 'var-gestational',
          },
          censusPrompt: 'Test',
        } as unknown as Stage;

        expect(
          () => generateNetwork(codebook, [stage], { seed: 42 }),
          `Stage type "${stageType}" is not handled by generateNetwork`,
        ).not.toThrow();
      }
    });

    it('should throw for an unknown stage type', () => {
      const codebook = makeCodebook();
      const stage = {
        id: 'stage-unknown',
        label: 'Unknown',
        type: 'SomeNewStageType',
      } as unknown as Stage;

      expect(() => generateNetwork(codebook, [stage], { seed: 42 })).toThrow(
        /Unsupported stage type "SomeNewStageType"/,
      );
    });
  });
});
