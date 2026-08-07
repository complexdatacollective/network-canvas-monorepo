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

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

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
        // A declared population, so counts are decided by the codebook rather
        // than a seed's draw from the default window. Stage behaviours still
        // floor and cap each creating stage's share of it.
        synthetic: { count: { distribution: 'constant', value: 6 } },
        variables: {
          'var-name': { name: 'Name', type: 'text' },
        },
      },
    },
    edge: {
      'edge-type-1': {
        color: 'edge-color-seq-1',
        variables: {
          'var-strength': {
            name: 'Strength',
            type: 'ordinal',
            options: [
              { label: 'Weak', value: 1 },
              { label: 'Strong', value: 2 },
            ],
          },
        },
      },
    },
    ...overrides,
  } as Codebook;
}

function makeNameGeneratorStage(overrides?: Record<string, unknown>): Stage {
  return {
    id: 'stage-ng',
    label: 'Name Generator',
    type: 'NameGenerator',
    subject: { entity: 'node', type: 'node-type-1' },
    form: {
      title: 'Add a person',
      fields: [{ variable: 'var-name', prompt: 'Name' }],
    },
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
      {
        id: 'prompt-tsc',
        text: 'Strength',
        createEdge: 'edge-type-1',
        edgeVariable: 'var-strength',
        negativeLabel: 'No Relationship',
      },
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
      gameteRoleVariable: 'var-gamete',
    },
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
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
  const nodeDefinition: NonNullable<Codebook['node']>[string] = {
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
      bypassed: {
        ...nodeDefinition,
        variables: {
          ...nodeDefinition.variables,
          blocked: {
            name: 'Blocked',
            type: 'text',
            validation: { minLength: 10, maxLength: 5 },
          },
        },
      },
      destination: nodeDefinition,
      final: nodeDefinition,
    },
  });
}

describe('generateNetwork', () => {
  it('writes Sociogram highlights only when the prompt collects them', () => {
    const codebook = makeCodebook({
      node: {
        'node-type-1': {
          color: 'node-color-seq-1',
          variables: {
            'var-name': { name: 'Name', type: 'text' },
            // Certain rather than tuned: how often a node is highlighted is
            // now a property of the variable, like any other boolean.
            'highlighted': {
              name: 'Highlighted',
              type: 'boolean',
              synthetic: { probabilityTrue: 1 },
            },
          },
        },
      },
    });
    const generator = makeNameGeneratorStage({
      form: {
        fields: [{ variable: 'var-name', prompt: 'What is their name?' }],
      },
      behaviours: { minNodes: 3, maxNodes: 3 },
    });
    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Support network',
      subject: { entity: 'node', type: 'node-type-1' },
      prompts: [
        {
          id: 'prompt-highlight',
          text: 'Who supports you?',
          highlight: { allowHighlighting: true, variable: 'highlighted' },
        },
      ],
    } as unknown as Stage;

    const { network } = generateNetwork({
      codebook,
      stages: [generator, sociogram],
      seed: 42,
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(node[entityAttributesProperty]['var-name']).toBeDefined();
      expect(node[entityAttributesProperty].highlighted).toBe(true);
    }
  });

  describe('targeted skip destinations', () => {
    it('still analyses a hidden stage when skip logic is disabled', () => {
      const stages = [
        {
          ...makeTypedNameGeneratorStage('visible', 'bypassed'),
          // `blocked` is collected here deliberately, and not left to the
          // shared fixture's form. A stage now writes only what it asks for,
          // so a variable no reachable stage collects is exempt from
          // feasibility — and this case would pass for that reason rather
          // than for the one it is about, the moment the helper's form
          // changed under it. The contradiction has to sit on a field this
          // run really writes.
          form: {
            title: 'About them',
            fields: [
              { variable: 'var-name', prompt: 'Name' },
              { variable: 'blocked', prompt: 'Blocked' },
            ],
          },
          skipLogic: makeHiddenSkipLogic(),
        } as Stage,
      ];

      expect(() =>
        generateNetwork({
          codebook: makeSkipRoutingCodebook(),
          stages,
          seed: 42,
        }),
      ).toThrow(/minLength 10 exceeds maxLength 5/);
    });

    it('preserves the legacy one-stage skip when destination is absent', () => {
      const stages = [
        makeTypedNameGeneratorStage('skipped', 'bypassed'),
        makeTypedNameGeneratorStage('next', 'destination'),
      ];
      stages[0] = {
        ...stages[0]!,
        skipLogic: makeHiddenSkipLogic(),
      } as Stage;

      const { network } = generateNetwork({
        codebook: makeSkipRoutingCodebook(),
        stages,
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

      const { network } = generateNetwork({
        codebook: makeSkipRoutingCodebook(),
        stages,
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

      const { network } = generateNetwork({
        codebook: makeSkipRoutingCodebook(),
        stages,
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

      const { network } = generateNetwork({
        codebook: makeSkipRoutingCodebook(),
        stages,
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

      const { network } = generateNetwork({
        codebook: makeSkipRoutingCodebook(),
        stages,
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

      const { network } = generateNetwork({ codebook, stages, seed: 42 });

      expect(network.nodes.length).toBeGreaterThan(0);

      for (const node of network.nodes) {
        expect(node.type).toBe('node-type-1');
      }
    });

    it('should use edgeConfig.type for edge types', () => {
      const codebook = makeCodebook();
      const stages = [makeFamilyPedigreeStage()];

      const { network } = generateNetwork({ codebook, stages, seed: 42 });

      expect(network.edges.length).toBeGreaterThan(0);

      for (const edge of network.edges) {
        expect(edge.type).toBe('edge-type-1');
      }
    });

    it('should only produce node types that exist in the codebook', () => {
      const codebook = makeCodebook();
      const stages = [makeFamilyPedigreeStage()];

      const { network } = generateNetwork({ codebook, stages, seed: 42 });

      const codebookNodeTypes = new Set(Object.keys(codebook.node ?? {}));

      for (const node of network.nodes) {
        expect(codebookNodeTypes.has(node.type)).toBe(true);
      }
    });

    it('should write the node label variable the interface collects', () => {
      const codebook = makeCodebook();
      const stages = [makeFamilyPedigreeStage()];

      const { network } = generateNetwork({ codebook, stages, seed: 42 });

      for (const node of network.nodes) {
        const attrs = node[entityAttributesProperty];
        if (attrs['var-ego'] === true) {
          expect(attrs).not.toHaveProperty('var-name');
        } else {
          expect(attrs).toHaveProperty('var-name');
        }
      }
    });

    it('marks exactly one node as ego, and false on every other node', () => {
      const codebook = makeCodebook({
        node: {
          'node-type-1': {
            color: 'node-color-seq-1',
            synthetic: { count: { distribution: 'constant', value: 6 } },
            variables: {
              'var-name': { name: 'Name', type: 'text' },
              'var-ego': { name: 'Is ego', type: 'boolean' },
            },
          },
        },
      });
      const stages = [makeFamilyPedigreeStage()];

      const { network } = generateNetwork({ codebook, stages, seed: 42 });

      expect(network.nodes.length).toBeGreaterThan(1);

      const egoNodes = network.nodes.filter(
        (node) => node[entityAttributesProperty]['var-ego'] === true,
      );
      expect(egoNodes).toHaveLength(1);
      expect(egoNodes[0]).toBe(network.nodes[0]);

      for (const node of network.nodes.slice(1)) {
        expect(node[entityAttributesProperty]['var-ego']).toBe(false);
      }
    });
  });

  describe('all node types match codebook', () => {
    it('should never produce nodes with type "person" or "Unknown"', () => {
      const codebook = makeCodebook();
      const stages: Stage[] = [
        makeNameGeneratorStage({
          behaviours: { minNodes: 2, maxNodes: 5 },
        }),
        makeFamilyPedigreeStage(),
      ];

      const { network } = generateNetwork({ codebook, stages, seed: 42 });

      for (const node of network.nodes) {
        expect(node.type).not.toBe('person');
        expect(node.type).not.toBe('Unknown');
        expect(node.type).toBe('node-type-1');
      }
    });
  });

  describe('name generator node bounds', () => {
    it('floors the population at a minNodes above the declared count', () => {
      const codebook = makeCodebook();
      const stages = [makeNameGeneratorStage({ behaviours: { minNodes: 9 } })];

      const { network } = generateNetwork({ codebook, stages, seed: 42 });

      expect(network.nodes.length).toBeGreaterThanOrEqual(9);
      for (const node of network.nodes) {
        expect(node.type).toBe('node-type-1');
      }
    });

    it('honours minNodes when it exceeds an explicit smaller maxNodes', () => {
      const codebook = makeCodebook();
      const stages = [
        makeNameGeneratorStage({ behaviours: { minNodes: 6, maxNodes: 3 } }),
      ];

      const { network } = generateNetwork({ codebook, stages, seed: 42 });

      expect(network.nodes.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('stageMetadata schema compliance', () => {
    it('FamilyPedigree writes isNetworkCommitted keyed by stage step', () => {
      const codebook = makeCodebook();
      const stages = [makeFamilyPedigreeStage()];

      const { stageMetadata } = generateNetwork({ codebook, stages, seed: 42 });

      expect(stageMetadata?.[0]).toEqual(
        expect.objectContaining({
          isNetworkCommitted: true,
          edgeIdVersion: 1,
        }),
      );
      expect(StageMetadataSchema.safeParse(stageMetadata).success).toBe(true);
    });

    it('DyadCensus writes [promptIndex, fromId, toId, answer] tuples keyed by stage step', () => {
      const codebook = makeCodebook();
      const stages = [makeNameGeneratorStage(), makeDyadCensusStage()];

      const { stageMetadata, network } = generateNetwork({
        codebook,
        stages,
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
        expect(typeof tuple[3]).toBe('boolean');
      }

      // Both answers, as DyadCensus records them: a pair the final graph links
      // writes `true` and an unlinked pair writes an explicit `false`.
      const answers = (meta as unknown[][]).map((tuple) => tuple[3]);
      expect(answers).toContain(true);
      expect(answers).toContain(false);

      expect(StageMetadataSchema.safeParse(stageMetadata).success).toBe(true);
    });

    it('TieStrengthCensus writes negatives only, as its interface does', () => {
      const codebook = makeCodebook();
      const stages = [makeNameGeneratorStage(), makeTieStrengthCensusStage()];

      const { stageMetadata, network } = generateNetwork({
        codebook,
        stages,
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

      const { stageMetadata } = generateNetwork({ codebook, stages, seed: 42 });

      const result = StageMetadataSchema.safeParse(stageMetadata);
      expect(result.success).toBe(true);
      expect(stageMetadata?.[2]).toEqual(
        expect.objectContaining({ isNetworkCommitted: true }),
      );
    });
  });

  describe('inProgressStageIndex option', () => {
    function makeBinCodebook(): Codebook {
      return makeCodebook({
        node: {
          'node-type-1': {
            color: 'node-color-seq-1',
            synthetic: { count: { distribution: 'constant', value: 6 } },
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

      const { network } = generateNetwork({ codebook, stages, seed: 42 });

      expect(network.nodes.length).toBeGreaterThan(0);
      for (const node of network.nodes) {
        expect(node[entityAttributesProperty]['var-ordinal']).not.toBeNull();
      }
    });

    it('clears the prompt variable on roughly half the nodes of an in-progress OrdinalBin', () => {
      const codebook = makeBinCodebook();
      const stages = [makeNameGeneratorStage(), makeOrdinalBinStage()];

      const { network } = generateNetwork({
        codebook,
        stages,
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

      const { network } = generateNetwork({
        codebook,
        stages,
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
            synthetic: { count: { distribution: 'constant', value: 6 } },
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

      const { network } = generateNetwork({
        codebook,
        stages,
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

      const { network } = generateNetwork({
        codebook,
        stages,
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
        generateNetwork({
          codebook,
          stages,
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

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages: [stage],
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

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages: [stage],
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

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages,
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

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages: [stage],
        seed: 42,
        externalData: { 'stage-ngr': makeRosterPool(2) },
      });

      expect(network.nodes).toHaveLength(2);
    });

    it('fabricates people on a roster stage with no external-data entry', () => {
      const stage = makeRosterStage({
        behaviours: { minNodes: 3, maxNodes: 3 },
      });

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages: [stage],
        seed: 42,
        externalData: undefined,
      });

      expect(network.nodes).toHaveLength(3);
      expect(
        network.nodes.every((n) => !isRosterUid(n[entityPrimaryKeyProperty])),
      ).toBe(true);
    });

    // A resolvable but empty roster means "roster known to be empty", not "no
    // roster". A live interview would offer nobody to add, so a roster stage
    // with an empty entry adds nobody rather than inventing people.
    it('adds nobody on a roster stage whose external-data entry is empty', () => {
      const stage = makeRosterStage({
        behaviours: { minNodes: 3, maxNodes: 3 },
      });

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages: [stage],
        seed: 42,
        externalData: { 'stage-ngr': [] },
      });

      expect(network.nodes).toHaveLength(0);
    });

    // The empty-roster rule suppresses fabrication only on pure roster stages.
    // A name generator with a manual-add path still fabricates to its planned
    // counts whatever its externalData entry holds.
    it('still fabricates to minNodes on a mixed name generator with an empty entry', () => {
      const stage = makeNameGeneratorStage({
        behaviours: { minNodes: 5, maxNodes: 5 },
      });

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages: [stage],
        seed: 42,
        externalData: { 'stage-ng': [] },
      });

      expect(network.nodes).toHaveLength(5);
      expect(
        network.nodes.every((n) => !isRosterUid(n[entityPrimaryKeyProperty])),
      ).toBe(true);
    });

    // ENGINE BUG (planNetwork, src/generateNetwork/plan/networkPlan.ts):
    // the "a roster stage cannot fabricate" guard sits inside the
    // `rosterRows.length > 0` branch, so a pool an earlier stage consumed
    // entirely (filtered empty through usedRosterUids) skips the guard and the
    // roster stage FABRICATES its share instead of adding nobody — against the
    // documented externalData contract ("a roster stage only from them") and
    // the plan's own comment. Marked `fails` so this flips when fixed.
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

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages,
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

    it('keeps roster values through a later form pass', () => {
      const stages = [
        makeRosterStage({ behaviours: { minNodes: 3, maxNodes: 3 } }),
        {
          id: 'stage-af',
          label: 'Details',
          type: 'AlterForm',
          subject: { entity: 'node', type: 'node-type-1' },
          form: { fields: [{ variable: 'var-name', prompt: 'Their name' }] },
        } as Stage,
      ];

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages,
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

    // Matches the interview runtime: adding a node to a prompt applies the
    // prompt's additionalAttributes over whatever the node already carries,
    // roster rows included (see addNodeToPrompt in the interview session
    // store). The row keeps its identity and its other values.
    it('lets the roster row win a collision on a roster interface stage', () => {
      // `NameGeneratorRoster` builds the node itself, spreading the row's own
      // attribute data over the prompt's `additionalAttributes`, so the row
      // wins. (A name generator drawing a panel adds the node through
      // `addNodeToPrompt`, which asserts the prompt's values over whatever the
      // node holds — the opposite order, for the opposite interface.)
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

      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages: [stage],
        seed: 42,
        externalData: { 'stage-ngr': makeRosterPool(5) },
      });

      expect(network.nodes).toHaveLength(2);
      for (const node of network.nodes) {
        expect(isRosterUid(node[entityPrimaryKeyProperty])).toBe(true);
        expect(node[entityAttributesProperty]['var-name']).toBe(
          rosterNameFor(node[entityPrimaryKeyProperty]),
        );
      }
    });

    it('stays reproducible for a given seed', () => {
      const stages = [
        makeRosterStage({ behaviours: { minNodes: 2, maxNodes: 6 } }),
      ];
      const externalData = { 'stage-ngr': makeRosterPool(8) };

      const first = generateNetwork({
        codebook: makeCodebook(),
        stages,
        seed: 99,
        externalData,
      });
      const second = generateNetwork({
        codebook: makeCodebook(),
        stages,
        seed: 99,
        externalData,
      });

      expect(stripUnstableIds(first.network)).toEqual(
        stripUnstableIds(second.network),
      );
    });
  });

  describe('stage type coverage', () => {
    function makeCoverageCodebook(): Codebook {
      return {
        node: {
          'node-type-1': {
            color: 'node-color-seq-1',
            synthetic: { count: { distribution: 'constant', value: 4 } },
            variables: {
              'var-name': { name: 'Name', type: 'text' },
              'var-layout': { name: 'Layout', type: 'layout' },
              'var-ordinal': {
                name: 'Closeness',
                type: 'ordinal',
                options: [
                  { label: 'Low', value: 1 },
                  { label: 'High', value: 2 },
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
              'var-ego': { name: 'Is ego', type: 'boolean' },
              'var-sex': { name: 'Sex', type: 'text' },
              'var-rel': { name: 'Rel', type: 'text' },
              'var-location': { name: 'Where', type: 'text' },
            },
          },
        },
        edge: {
          'edge-type-1': {
            color: 'edge-color-seq-1',
            variables: {
              'var-strength': {
                name: 'Strength',
                type: 'ordinal',
                options: [
                  { label: 'Weak', value: 1 },
                  { label: 'Strong', value: 2 },
                ],
              },
            },
          },
        },
        ego: {
          variables: {
            'var-ego-name': { name: 'Your name', type: 'text' },
          },
        },
      } as unknown as Codebook;
    }

    /**
     * A minimal schema-shaped configuration per stage type. The analyser reads
     * each stage's own required fields (forms, quickAdd, prompt variables,
     * pedigree configs), so — unlike the previous engine — a bare `{ id, type,
     * subject, prompts }` skeleton is not enough to exercise a handler.
     */
    const STAGE_CONFIGS: Record<string, Record<string, unknown>> = {
      NameGenerator: {
        subject: { entity: 'node', type: 'node-type-1' },
        form: {
          title: 'Add',
          fields: [{ variable: 'var-name', prompt: 'Name' }],
        },
        prompts: [{ id: 'p1', text: 'Who?' }],
      },
      NameGeneratorQuickAdd: {
        subject: { entity: 'node', type: 'node-type-1' },
        quickAdd: 'var-name',
        prompts: [{ id: 'p1', text: 'Who?' }],
      },
      NameGeneratorRoster: {
        subject: { entity: 'node', type: 'node-type-1' },
        dataSource: 'roster',
        prompts: [{ id: 'p1', text: 'Pick' }],
      },
      Sociogram: {
        subject: { entity: 'node', type: 'node-type-1' },
        prompts: [
          {
            id: 'p1',
            text: 'Place',
            layout: { layoutVariable: 'var-layout' },
            edges: { create: 'edge-type-1' },
          },
        ],
      },
      Narrative: {
        subject: { entity: 'node', type: 'node-type-1' },
        presets: [
          { id: 'preset-1', label: 'Preset', layoutVariable: 'var-layout' },
        ],
        background: { concentricCircles: 4, skewedTowardCenter: true },
      },
      Information: { title: 'Info', items: [] },
      DyadCensus: {
        subject: { entity: 'node', type: 'node-type-1' },
        introductionPanel: { title: 't', text: 'x' },
        prompts: [{ id: 'p1', text: 'Know?', createEdge: 'edge-type-1' }],
      },
      OneToManyDyadCensus: {
        subject: { entity: 'node', type: 'node-type-1' },
        behaviours: { removeAfterConsideration: false },
        prompts: [{ id: 'p1', text: 'Who?', createEdge: 'edge-type-1' }],
      },
      OrdinalBin: {
        subject: { entity: 'node', type: 'node-type-1' },
        prompts: [
          {
            id: 'p1',
            text: 'Rank',
            variable: 'var-ordinal',
            color: 'ord-color-seq-1',
          },
        ],
      },
      CategoricalBin: {
        subject: { entity: 'node', type: 'node-type-1' },
        prompts: [{ id: 'p1', text: 'Group', variable: 'var-cat' }],
      },
      EgoForm: {
        introductionPanel: { title: 't', text: 'x' },
        form: { fields: [{ variable: 'var-ego-name', prompt: 'Name?' }] },
      },
      TieStrengthCensus: {
        subject: { entity: 'node', type: 'node-type-1' },
        introductionPanel: { title: 't', text: 'x' },
        prompts: [
          {
            id: 'p1',
            text: 'How close?',
            createEdge: 'edge-type-1',
            edgeVariable: 'var-strength',
            negativeLabel: 'Not close',
          },
        ],
      },
      AlterForm: {
        subject: { entity: 'node', type: 'node-type-1' },
        introductionPanel: { title: 't', text: 'x' },
        form: { fields: [{ variable: 'var-name', prompt: 'Name?' }] },
      },
      AlterEdgeForm: {
        subject: { entity: 'edge', type: 'edge-type-1' },
        introductionPanel: { title: 't', text: 'x' },
        form: { fields: [{ variable: 'var-strength', prompt: 'Strength?' }] },
      },
      Anonymisation: {
        explanationText: { title: 't', body: 'x' },
      },
      FamilyPedigree: {
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
          gameteRoleVariable: 'var-gamete',
        },
        framing: { mode: 'fixed', value: 'gamete' },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
        censusPrompt: 'Family?',
      },
      Geospatial: {
        subject: { entity: 'node', type: 'node-type-1' },
        mapOptions: {
          tokenAssetId: 'token',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-87.6, 41.8],
          initialZoom: 10,
          dataSourceAssetId: 'geo',
          color: 'node-color-seq-1',
          targetFeatureProperty: 'name',
        },
        prompts: [{ id: 'p1', text: 'Where?', variable: 'var-location' }],
      },
      NarrativePedigree: { sourceStageId: 'stage-FamilyPedigree' },
      NetworkComposer: {
        subject: { entity: 'node', type: 'node-type-1' },
        quickAdd: 'var-name',
        layoutVariable: 'var-layout',
      },
    };

    it('should handle every stage type defined in the protocol validation schema', () => {
      const allStageTypes = getAllStageTypes();
      expect(allStageTypes.length).toBeGreaterThan(0);

      const codebook = makeCoverageCodebook();

      for (const stageType of allStageTypes) {
        const config = STAGE_CONFIGS[stageType];
        expect(
          config,
          `Stage type "${stageType}" has no coverage configuration — add one so generateNetwork's handling of it is exercised`,
        ).toBeDefined();

        const stage = {
          id: `stage-${stageType}`,
          label: stageType,
          type: stageType,
          ...config,
        } as unknown as Stage;

        expect(
          () => generateNetwork({ codebook, stages: [stage], seed: 42 }),
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

      expect(() =>
        generateNetwork({ codebook, stages: [stage], seed: 42 }),
      ).toThrow(/Unsupported stage type "SomeNewStageType"/);
    });
  });

  describe('codebook synthetic counts', () => {
    it('draws the population from the declared count when a stage omits behaviours', () => {
      const stage = makeNameGeneratorStage({ behaviours: undefined });

      const { network } = generateNetwork({
        codebook: makeCodebook({
          node: {
            'node-type-1': {
              color: 'node-color-seq-1',
              synthetic: { count: { distribution: 'constant', value: 3 } },
              variables: {
                'var-name': { name: 'Name', type: 'text' },
              },
            },
          },
        }),
        stages: [stage],
        seed: 42,
      });

      expect(network.nodes).toHaveLength(3);
    });

    it('caps a FamilyPedigree family at the declared count, above its core', () => {
      // A family is not sized like an elicited population. The generator emits
      // a complete pedigree — ego, two genetic parents, four genetic
      // grandparents — and the declared count bounds only what it may add on
      // top of that. So the count is read as a ceiling on optional branches,
      // and asserting it against a family means asserting the branches it
      // permits, not the seven the core costs.
      const familyOf = (declared: number): number => {
        const { network } = generateNetwork({
          codebook: makeCodebook({
            node: {
              'node-type-1': {
                color: 'node-color-seq-1',
                synthetic: {
                  count: { distribution: 'constant', value: declared },
                },
                variables: { 'var-name': { name: 'Name', type: 'text' } },
              },
            },
          }),
          stages: [makeFamilyPedigreeStage()],
          seed: 42,
        });
        return network.nodes.length;
      };

      // Room for branches, and the seed takes some of it: a count that only
      // capped would leave this indistinguishable from the core.
      const roomy = familyOf(24);
      expect(roomy).toBeGreaterThan(7);
      expect(roomy).toBeLessThanOrEqual(24);

      // Tightening the same seed's family to a lower ceiling drops branches
      // the roomier run kept, while still growing past the core — which is
      // what makes the count load-bearing rather than incidental.
      const tight = familyOf(12);
      expect(tight).toBeGreaterThan(7);
      expect(tight).toBeLessThan(roomy);

      // And below the core the ceiling stops applying: seven people are what
      // a pedigree costs whatever the codebook declares, since a family the
      // interface could never draw is worse than one larger than asked for.
      expect(familyOf(6)).toBe(7);
    });
  });

  describe('session config overrides', () => {
    it('dropOutFactor: 0 never triggers drop-out', () => {
      const stages = Array.from({ length: 20 }, (_, i) =>
        makeTypedNameGeneratorStage(`ng-${i}`, 'node-type-1'),
      );

      const { droppedOut, currentStep } = generateNetwork({
        codebook: makeCodebook(),
        stages,
        seed: 42,
        simulateDropOut: true,
        config: { dropOutFactor: 0 },
      });

      expect(droppedOut).toBe(false);
      expect(currentStep).toBe(stages.length);
    });

    it('a large dropOutFactor forces an early drop-out', () => {
      const stages = Array.from({ length: 20 }, (_, i) =>
        makeTypedNameGeneratorStage(`ng-${i}`, 'node-type-1'),
      );

      const { droppedOut, currentStep } = generateNetwork({
        codebook: makeCodebook(),
        stages,
        seed: 42,
        simulateDropOut: true,
        config: { dropOutFactor: 100 },
      });

      expect(droppedOut).toBe(true);
      expect(currentStep).toBe(0);
    });
  });
});
