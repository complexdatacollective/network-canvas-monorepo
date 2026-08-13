import { describe, expect, it } from 'vitest';

import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: { name: { name: 'Name', type: 'text' } },
    },
  },
  edge: {},
} as unknown as Codebook;

const rosterStage = {
  id: 'stage-roster',
  type: 'NameGeneratorRoster',
  label: 'Roster',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 1 } },
  dataSource: 'stage-roster',
  cardOptions: { displayLabel: 'name' },
  prompts: [{ id: 'r-p', text: 'Pick people' }],
};

const fabricator = {
  id: 'stage-people',
  type: 'NameGenerator',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 1 } },
  behaviours: { minNodes: 1, maxNodes: 1 },
  form: { fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'f-p', text: 'Name people' }],
};

const rowWithUid = (uid: string): NcNode[] =>
  [
    {
      [entityPrimaryKeyProperty]: uid,
      type: 'person',
      attributes: { name: 'Rowan' },
    },
  ] as unknown as NcNode[];

const run = (rowUid: string) =>
  generateNetwork({
    seed: 7,
    codebook,
    stages: [rosterStage, fabricator] as never,
    externalData: { 'stage-roster': rowWithUid(rowUid) },
  });

describe('a roster row whose uid matches a minted id', () => {
  it('redraws the fabricated id rather than planning two entities under one key', () => {
    // A roster uid is an arbitrary caller-chosen string, so first learn the
    // exact id the fabricating stage would mint, then hand the roster a row
    // carrying that id. A plan that accepts the collision holds two nodes
    // under one key, and materialisation silently keeps whichever lands
    // first — the finished network comes back one person short.
    const probe = run('external-row');
    expect(probe.network.nodes).toHaveLength(2);
    const minted = probe.network.nodes
      .map((node) => node[entityPrimaryKeyProperty])
      .find((uid) => uid !== 'external-row');
    expect(minted).toBeDefined();

    const collided = run(minted!);
    const uids = collided.network.nodes.map(
      (node) => node[entityPrimaryKeyProperty],
    );
    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
    // The row keeps the caller's key; the fabricated node is what moves.
    expect(uids).toContain(minted!);
  });
});
