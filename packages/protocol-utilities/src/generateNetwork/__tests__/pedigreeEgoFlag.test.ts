import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork.ts';
import { SyntheticDataConstraintError } from '../../generateNetwork/constraints/error.ts';

const pedigree = {
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
} as unknown as Stage;

function codebook(egoVariable: Record<string, unknown>): StructuralCodebook {
  return {
    node: {
      person: {
        color: 'node-color-seq-1',
        variables: {
          name: { name: 'Name', type: 'text' },
          isEgo: egoVariable,
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
  } as unknown as StructuralCodebook;
}

describe('FamilyPedigree fixed-value constraints', () => {
  it('writes one ego and explicit false on every other person', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook({ name: 'Is ego', type: 'boolean' }),
      stages: [pedigree],
      familyPedigree: { scenario: 'none' },
    });
    expect(network.nodes.filter((node) => node.attributes.isEgo)).toHaveLength(
      1,
    );
    expect(network.nodes[0]?.attributes.isEgo).toBe(true);
    expect(
      network.nodes.slice(1).every((node) => node.attributes.isEgo === false),
    ).toBe(true);
  });

  it('refuses a unique ego flag instead of emitting an invalid pedigree', () => {
    expect(() =>
      generateNetwork({
        seed: 3,
        codebook: codebook({
          name: 'Is ego',
          type: 'boolean',
          validation: { unique: true },
        }),
        stages: [pedigree],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('refuses a semantic value excluded by the configured option domain', () => {
    const invalid = codebook({ name: 'Is ego', type: 'boolean' });
    const sex = invalid.node?.person?.variables?.sex;
    if (sex && sex.type === 'categorical') {
      sex.options = [
        { value: 'unknown', label: 'Unknown' },
        { value: 'preferNotToSay', label: 'Prefer not to say' },
      ];
    }
    expect(() =>
      generateNetwork({ seed: 3, codebook: invalid, stages: [pedigree] }),
    ).toThrow(/value required by its data model/);
  });

  it('refuses uniqueness on a repeated relationship semantic', () => {
    const invalid = codebook({ name: 'Is ego', type: 'boolean' });
    const relationship = invalid.node?.person?.variables?.relationship;
    if (relationship && relationship.type === 'text') {
      relationship.validation = { unique: true };
    }

    expect(() =>
      generateNetwork({ seed: 3, codebook: invalid, stages: [pedigree] }),
    ).toThrow(SyntheticDataConstraintError);
  });
});
