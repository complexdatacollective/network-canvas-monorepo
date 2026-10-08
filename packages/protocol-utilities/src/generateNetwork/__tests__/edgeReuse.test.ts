import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import type { NcEdge } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork.ts';

/**
 * The generator draws at most one edge of a type between one pair, because the
 * interview does: every interface that creates an edge for a pair asks
 * `edgeExists({ from, to, type })` first, and that lookup runs over the whole
 * session edge list. Edges carry no stage or prompt provenance, so reuse spans
 * stages rather than prompts within one.
 */

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: { name: { name: 'Name', type: 'text' } },
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

function threePeople(): Stage {
  return {
    id: 'stage-people',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
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
    prompts: [{ id: 'p1', text: 'Who knows who?', edges: { create: 'knows' } }],
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
      codebook,
      stages: [threePeople(), dyadCensus('census-a'), dyadCensus('census-b')],
      config: { censusEdgeProbability: { min: 1, max: 1 } },
    });

    const keys = pairKeys(network.edges);
    // C(3, 2) = 3 pairs, asked about by two separate stages.
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });

  it('reuses a census edge from a Sociogram, and the other way round', () => {
    const both = { min: 1, max: 1 };

    const censusFirst = generateNetwork({
      seed: 3,
      codebook,
      stages: [threePeople(), dyadCensus('census'), sociogram('sociogram')],
      config: {
        censusEdgeProbability: both,
        sociogramEdgeProbability: both,
      },
    });

    const sociogramFirst = generateNetwork({
      seed: 3,
      codebook,
      stages: [threePeople(), sociogram('sociogram'), dyadCensus('census')],
      config: {
        censusEdgeProbability: both,
        sociogramEdgeProbability: both,
      },
    });

    expect(new Set(pairKeys(censusFirst.network.edges)).size).toBe(3);
    expect(censusFirst.network.edges).toHaveLength(3);
    expect(new Set(pairKeys(sociogramFirst.network.edges)).size).toBe(3);
    expect(sociogramFirst.network.edges).toHaveLength(3);
  });

  it('records a reused pair as answered rather than as a negative', () => {
    // The Sociogram connects every pair, then the census meets those edges with
    // a zero probability of drawing any of its own. The runtime pre-selects
    // 'Yes' for a pair that already has an edge of the type, so every pair is a
    // positive answer — and the edge stays put, which is where the generator
    // deliberately parts company with the interface's delete-on-'No'.
    const { network, stageMetadata } = generateNetwork({
      seed: 3,
      codebook,
      stages: [threePeople(), sociogram('sociogram'), dyadCensus('census')],
      config: {
        sociogramEdgeProbability: { min: 1, max: 1 },
        censusEdgeProbability: { min: 0, max: 0 },
      },
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
      codebook,
      stages: [composer],
      config: {
        nodeCount: { min: 3, max: 3 },
        networkComposerEdgeProbability: { min: 1, max: 1 },
      },
    });

    expect(new Set(pairKeys(network.edges)).size).toBe(3);
    expect(network.edges).toHaveLength(3);
  });
});
