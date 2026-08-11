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

function codebook(): Codebook {
  return {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
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

/** Density 1 links every eligible pair it can see; 0 links none. */
const densityOf = (density: number) => ({
  topology: {
    metric: 'density',
    distribution: { distribution: 'constant', value: density },
  },
});

function dyadCensus(id: string, density: number): Stage {
  return {
    id,
    type: 'DyadCensus',
    synthetic: densityOf(density),
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
    ],
  } as unknown as Stage;
}

function sociogram(id: string, density: number): Stage {
  return {
    id,
    type: 'Sociogram',
    synthetic: densityOf(density),
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
      codebook: codebook(),
      stages: [
        threePeople(),
        dyadCensus('census-a', 1),
        dyadCensus('census-b', 1),
      ],
    });

    const keys = pairKeys(network.edges);
    // C(3, 2) = 3 pairs, asked about by two separate stages.
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });

  it('reuses a census edge from a Sociogram, and the other way round', () => {
    const censusFirst = generateNetwork({
      seed: 3,
      codebook: codebook(),
      stages: [
        threePeople(),
        dyadCensus('census', 1),
        sociogram('sociogram', 1),
      ],
    });

    const sociogramFirst = generateNetwork({
      seed: 3,
      codebook: codebook(),
      stages: [
        threePeople(),
        sociogram('sociogram', 1),
        dyadCensus('census', 1),
      ],
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
      codebook: codebook(),
      stages: [
        threePeople(),
        sociogram('sociogram', 1),
        dyadCensus('census', 1),
      ],
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
      synthetic: {
        count: { distribution: 'constant', value: 3 },
        ...densityOf(1),
      },
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
      codebook: codebook(),
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

  const tieStrength = (density: number) =>
    ({
      id: 'stage-tie',
      type: 'TieStrengthCensus',
      synthetic: densityOf(density),
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
    }) as unknown as Stage;

  it('writes its edge variable onto the reused edge instead of drawing another', () => {
    // The topology target is zero, so every edge here is a structural pedigree
    // edge the census answered — the generator's stand-in for `updateEdge`,
    // which merges the ordinal value into whatever the edge held.
    //
    // Measured against the same pedigree run alone rather than against a
    // literal, because a family is sized by the generator's own structure: the
    // declared count caps its optional branches and cannot shrink its core.
    // Two runs of one seed build the same family, so an equal edge count is
    // exactly the claim that the census added none of its own.
    const options = { seed: 3, codebook: codebook() };
    const { network: pedigreeOnly } = generateNetwork({
      ...options,
      stages: [pedigree],
    });
    const { network } = generateNetwork({
      ...options,
      stages: [pedigree, tieStrength(0)],
    });

    expect(network.edges).toHaveLength(pedigreeOnly.edges.length);
    expect(pairKeys(network.edges)).toEqual(pairKeys(pedigreeOnly.edges));
    // Which the census then wrote its ordinal onto — and had drawn none of
    // before it ran.
    for (const edge of network.edges) {
      expect(edge[entityAttributesProperty].strength).toBeDefined();
    }
    for (const edge of pedigreeOnly.edges) {
      expect(edge[entityAttributesProperty].strength).toBeUndefined();
    }
  });

  it('leaves the pedigree own edges in place when a census pairs the same people', () => {
    // Reuse never removes anything: the pedigree's parent-child edges are
    // still there, and the plan links only the pairs the pedigree left
    // unjoined to reach its density.
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook(),
      stages: [pedigree, tieStrength(1)],
    });

    const keys = pairKeys(network.edges);
    const pairCount = (network.nodes.length * (network.nodes.length - 1)) / 2;
    expect(keys).toHaveLength(pairCount);
    expect(new Set(keys).size).toBe(pairCount);
  });
});
