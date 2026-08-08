import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A pedigree's links are structural: it draws them whatever a later census
 * over the same edge type asks for. So a topology target of zero bounds what
 * that census adds, not what the network holds — clamped to the target, the
 * count said no edge carried the type at all, and a `unique` variable written
 * onto them afterwards was sized against nothing.
 */

const codebook = {
  node: {
    'family-member': {
      name: 'Family member',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        isEgo: { name: 'Is ego', type: 'boolean' },
        relationship: { name: 'Relationship', type: 'text' },
        biologicalSex: {
          name: 'Biological sex',
          type: 'categorical',
          options: BIOLOGICAL_SEX_OPTIONS,
        },
      },
    },
  },
  ego: { variables: {} },
  edge: {
    'family-edge': {
      name: 'Family edge',
      color: 'edge-color-seq-1',
      // Nothing added by a census; the pedigree's own links are all there is.
      synthetic: {
        topology: {
          metric: 'density',
          distribution: { distribution: 'constant', value: 0 },
        },
      },
      variables: {
        relationshipType: {
          name: 'Relationship type',
          type: 'categorical',
          options: RELATIONSHIP_TYPE_OPTIONS,
        },
        isActive: { name: 'Is active', type: 'boolean' },
        // Two values, against however many links the family really holds.
        tag: {
          name: 'Tag',
          type: 'boolean',
          validation: { unique: true },
        },
      },
    },
  },
} as unknown as StructuralCodebook;

const familyStage = {
  id: 'family',
  type: 'FamilyPedigree',
  label: 'Family',
  nodeConfig: {
    type: 'family-member',
    nodeLabelVariable: 'name',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationship',
    biologicalSexVariable: 'biologicalSex',
  },
  edgeConfig: {
    type: 'family-edge',
    relationshipTypeVariable: 'relationshipType',
    isActiveVariable: 'isActive',
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'required',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Build your family.',
} as unknown as Stage;

const census = {
  id: 'census',
  type: 'DyadCensus',
  label: 'Related?',
  subject: { entity: 'node', type: 'family-member' },
  prompts: [{ id: 'c-p', text: 'Related?', createEdge: 'family-edge' }],
} as unknown as Stage;

const tagForm = {
  id: 'tag-form',
  type: 'AlterEdgeForm',
  label: 'Tag',
  subject: { entity: 'edge', type: 'family-edge' },
  form: { title: 'Tag', fields: [{ variable: 'tag', prompt: 'Tag?' }] },
} as unknown as Stage;

describe('a topology target of zero over a pedigree’s own edge type', () => {
  it('still counts the links the pedigree structurally creates', () => {
    // The family holds far more than two links, so a two-value `unique`
    // variable over them cannot work and preflight has to say so.
    // Refused UP FRONT, naming the count. Clamped to a target of zero it
    // cleared preflight and then ran out of values mid-walk instead, which
    // matches a bare /unique/ assertion just as well — hence the specific
    // message here.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [familyStage, census, tagForm],
      }),
    ).toThrow(/only 2 distinct values are possible/);
  });
});
