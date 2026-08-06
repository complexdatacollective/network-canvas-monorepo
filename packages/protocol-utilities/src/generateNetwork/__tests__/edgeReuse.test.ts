import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcEdge } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * The generator leaves at most one edge of a type between one pair, because the
 * interview does: every interface that creates an edge for a pair asks
 * `edgeExists({ from, to, type })` first, and that lookup runs over the whole
 * session edge list. The planner expresses that as one topology target per edge
 * TYPE over the union of every creating stage's eligible pairs, so two stages
 * sharing a type share one set of planned edges rather than drawing twice.
 *
 * FamilyPedigree is the deliberate exception and is covered at the bottom: its
 * parent-child edges are structural and exist below the topology target, and
 * are told apart by the `relationshipType` attribute the stage writes.
 */

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/** Density 1 links every eligible pair; 0 links none. */
function codebook(density: number, personCount?: number): Codebook {
  return {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        ...(personCount !== undefined
          ? {
              synthetic: {
                count: { distribution: 'constant', value: personCount },
              },
            }
          : {}),
        variables: {
          name: { name: 'Name', type: 'text' },
          isEgo: { name: 'Is ego', type: 'boolean' },
          relationship: { name: 'Relationship', type: 'text' },
          sex: { name: 'Sex', type: 'text' },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: density },
          },
        },
        variables: {
          strength: {
            name: 'Strength',
            type: 'ordinal',
            options: [1, 2, 3, 4, 5].map((value) => ({
              label: `Strength ${value}`,
              value,
            })),
          },
        },
      },
    },
  } as unknown as Codebook;
}

function threePeople(): Stage {
  return {
    id: 'stage-people',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    form: { title: 'About this person', fields: [] },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { minNodes: 3, maxNodes: 3 },
  } as unknown as Stage;
}

function dyadCensus(id: string): Stage {
  return {
    id,
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
    ],
  } as unknown as Stage;
}

function sociogram(id: string): Stage {
  return {
    id,
    type: 'Sociogram',
    label: 'Link them',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: 'p1',
        text: 'Who knows who?',
        layout: { layoutVariable: 'layout' },
        edges: { create: 'knows' },
      },
    ],
  } as unknown as Stage;
}

/** Unordered `{ from, to, type }` keys, as `edgeExists` matches them. */
function pairKeys(edges: NcEdge[]): string[] {
  return edges.map((edge) =>
    [edge.type, ...[edge.from, edge.to].toSorted()].join('|'),
  );
}

describe('edge reuse across stages', () => {
  it('leaves one edge per pair when two census stages share an edge type', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook(1),
      stages: [threePeople(), dyadCensus('census-a'), dyadCensus('census-b')],
    });

    const keys = pairKeys(network.edges);
    // C(3, 2) = 3 pairs, asked about by two separate stages.
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });

  it('reuses a census edge from a Sociogram, and the other way round', () => {
    const censusFirst = generateNetwork({
      seed: 3,
      codebook: codebook(1),
      stages: [threePeople(), dyadCensus('census'), sociogram('sociogram')],
    });

    const sociogramFirst = generateNetwork({
      seed: 3,
      codebook: codebook(1),
      stages: [threePeople(), sociogram('sociogram'), dyadCensus('census')],
    });

    expect(new Set(pairKeys(censusFirst.network.edges)).size).toBe(3);
    expect(censusFirst.network.edges).toHaveLength(3);
    expect(new Set(pairKeys(sociogramFirst.network.edges)).size).toBe(3);
    expect(sociogramFirst.network.edges).toHaveLength(3);
  });

  it('records a reused pair as answered rather than as a negative', () => {
    // Every planned edge materialises at the earliest stage that could create
    // it — the Sociogram here — and the census's answers derive from final
    // membership. The runtime pre-selects 'Yes' for a pair that already has an
    // edge of the type, so every pair is a positive answer, and the edge stays
    // where the Sociogram left it.
    const { network, stageMetadata } = generateNetwork({
      seed: 3,
      codebook: codebook(1),
      stages: [threePeople(), sociogram('sociogram'), dyadCensus('census')],
    });

    expect(network.edges).toHaveLength(3);

    const meta = stageMetadata?.[2] as [number, string, string, boolean][];
    expect(meta).toHaveLength(3);
    expect(meta.every(([, , , answer]) => answer)).toBe(true);
  });

  it('draws one edge per pair across a composer own edge definitions', () => {
    const composer = {
      id: 'stage-composer',
      type: 'NetworkComposer',
      label: 'Compose',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      layoutVariable: 'layout',
      background: { circles: true },
      edges: [
        { id: 'e1', subject: { entity: 'edge', type: 'knows' } },
        { id: 'e2', subject: { entity: 'edge', type: 'knows' } },
      ],
    } as unknown as Stage;

    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook(1, 3),
      stages: [composer],
    });

    expect(new Set(pairKeys(network.edges)).size).toBe(3);
    expect(network.edges).toHaveLength(3);
  });
});

describe('TieStrengthCensus over an edge it did not create', () => {
  const pedigree = {
    id: 'stage-pedigree',
    type: 'FamilyPedigree',
    label: 'Family',
    nodeConfig: {
      type: 'person',
      nodeLabelVariable: 'name',
      egoVariable: 'isEgo',
      relationshipVariable: 'relationship',
      biologicalSexVariable: 'sex',
    },
    edgeConfig: {
      type: 'knows',
      relationshipTypeVariable: 'relType',
      isActiveVariable: 'isActive',
      isGestationalCarrierVariable: 'carrier',
      gameteRoleVariable: 'gamete',
    },
    framing: { mode: 'fixed', value: 'gendered' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    censusPrompt: 'Add your family.',
  } as unknown as Stage;

  const tieStrength = {
    id: 'stage-tie',
    type: 'TieStrengthCensus',
    label: 'How close?',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: 'p1',
        text: 'How close are they?',
        createEdge: 'knows',
        edgeVariable: 'strength',
        negativeLabel: 'Not at all',
      },
    ],
  } as unknown as Stage;

  it('writes its edge variable onto the reused edge instead of drawing another', () => {
    // The topology target is zero, so every edge here is a structural pedigree
    // edge the census answered — the generator's stand-in for `updateEdge`,
    // which merges the ordinal value into whatever the edge held.
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook(0, 4),
      stages: [pedigree, tieStrength],
    });

    // The pedigree plans exactly one edge per family member after the first.
    expect(network.edges).toHaveLength(3);
    for (const edge of network.edges) {
      expect(edge[entityAttributesProperty].strength).toBeDefined();
    }
  });

  it('leaves the pedigree own edges in place when a census pairs the same people', () => {
    // Reuse never removes anything: the pedigree's parent-child edges are
    // still there, and the plan links only the pairs the pedigree left
    // unjoined to reach its density.
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook(1, 4),
      stages: [pedigree, tieStrength],
    });

    const keys = pairKeys(network.edges);
    const pairCount = (network.nodes.length * (network.nodes.length - 1)) / 2;
    expect(keys).toHaveLength(pairCount);
    expect(new Set(keys).size).toBe(pairCount);
  });
});
