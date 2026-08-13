import { describe, expect, it } from 'vitest';

import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];
type Stages = Parameters<typeof generateNetwork>[0]['stages'];

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        isEgo: { name: 'Is ego', type: 'boolean' },
        relationship: { name: 'Relationship', type: 'text' },
        sex: {
          name: 'Sex',
          type: 'categorical',
          options: [
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
          ],
        },
      },
    },
  },
  edge: {
    family: {
      name: 'Family',
      color: 'edge-color-seq-1',
      variables: {
        type: {
          name: 'Type',
          type: 'categorical',
          options: [
            { value: 'biological', label: 'Biological' },
            { value: 'partner', label: 'Partner' },
          ],
        },
        active: { name: 'Active', type: 'boolean' },
        carrier: { name: 'Carrier', type: 'boolean' },
        gamete: {
          name: 'Gamete',
          type: 'categorical',
          options: [
            { value: 'egg', label: 'Egg' },
            { value: 'sperm', label: 'Sperm' },
          ],
        },
      },
    },
  },
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

const pedigreeStage = {
  id: 'pedigree',
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
    type: 'family',
    relationshipTypeVariable: 'type',
    isActiveVariable: 'active',
    isGestationalCarrierVariable: 'carrier',
    gameteRoleVariable: 'gamete',
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'required',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Family',
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
    stages: [rosterStage, pedigreeStage] as unknown as Stages,
    externalData: { 'stage-roster': rowWithUid(rowUid) },
    familyPedigree: { scenario: 'none' },
  });

describe('a roster row whose uid matches a pedigree-minted id', () => {
  it('keeps every node uid unique in the finished network', () => {
    // Learn the exact uid the pedigree materializer mints for its first
    // generated family member, then hand the roster a row carrying that id.
    const probe = run('external-row');
    const pedigreeMinted = probe.network.nodes
      .map((node) => node[entityPrimaryKeyProperty])
      .filter((uid) => uid !== 'external-row');
    expect(pedigreeMinted.length).toBeGreaterThan(0);
    const target = pedigreeMinted[0]!;

    const collided = run(target);
    const uids = collided.network.nodes.map(
      (node) => node[entityPrimaryKeyProperty],
    );
    // The crafted roster row is present under the caller's key...
    expect(uids).toContain(target);
    // ...and no two nodes may share a primary key.
    expect(new Set(uids).size).toBe(uids.length);
  });
});
