import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * Repro for: walk-time fallback edge creation draws (and claims unique values
 * for) certainly-missing edge-form variables before deleting them, exhausting
 * a small unique value space even though every final value is missing.
 *
 * Construction:
 * - `var-u` on edge `knows`: ordinal over a 2-value space, `unique: true`,
 *   not required, `synthetic.missingProbability: 1` (certainly missing).
 * - Stage 1: FamilyPedigree over `node-type-1` (edge type `kin`, not `knows`)
 *   builds its people during the walk, invisible to the planner.
 * - Stage 2: NetworkComposer over `node-type-1` creating `knows` with an edge
 *   form containing `var-u`, declared topology density 1 — so the walk-time
 *   fallback creates `knows` edges among the pedigree pairs.
 *
 * Correct behaviour: generation succeeds and no emitted `knows` edge carries
 * `var-u` (the group is certainly missing; feasibility exempts it and a live
 * interview would simply hold no answers). The bug makes the third fallback
 * edge's draw throw SyntheticDataConstraintError because the first two draws
 * claimed the whole {1,2} space before being deleted.
 */

function makeCodebook(): Codebook {
  return {
    node: {
      'node-type-1': {
        color: 'node-color-seq-1',
        variables: {
          'var-name': { name: 'Name', type: 'text' },
          'var-layout': { name: 'Layout', type: 'layout' },
        },
      },
    },
    edge: {
      kin: {
        color: 'edge-color-seq-1',
        variables: {},
      },
      knows: {
        color: 'edge-color-seq-2',
        variables: {
          'var-u': {
            name: 'U',
            type: 'ordinal',
            options: [
              { label: 'One', value: 1 },
              { label: 'Two', value: 2 },
            ],
            validation: { unique: true },
            synthetic: { missingProbability: 1 },
          },
        },
      },
    },
  } as unknown as Codebook;
}

function makeFamilyPedigreeStage(): Stage {
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
      type: 'kin',
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
  } as unknown as Stage;
}

function makeComposerStage(): Stage {
  return {
    id: 'stage-composer',
    label: 'Compose',
    type: 'NetworkComposer',
    subject: { entity: 'node', type: 'node-type-1' },
    quickAdd: asEntityAttributeReference('var-name'),
    layoutVariable: asEntityAttributeReference('var-layout'),
    background: { concentricCircles: 1 },
    edges: [
      {
        id: 'edge-def-1',
        subject: { entity: 'edge', type: 'knows' },
        form: {
          fields: [
            {
              variable: asEntityAttributeReference('var-u'),
              component: 'RadioGroup',
            },
          ],
        },
      },
    ],
    synthetic: {
      count: { distribution: 'constant', value: 3 },
      topology: {
        metric: 'density',
        distribution: { distribution: 'constant', value: 1 },
      },
    },
  } as unknown as Stage;
}

describe('walk-time fallback edges with certainly-missing unique variables', () => {
  it('generates without exhausting the unique space of a certainly-missing edge variable', () => {
    const codebook = makeCodebook();
    const stages = [makeFamilyPedigreeStage(), makeComposerStage()];

    const { network } = generateNetwork({ codebook, stages, seed: 42 });

    const knows = network.edges.filter((edge) => edge.type === 'knows');
    // Density 1 over pedigree pairs: many more than two fallback edges.
    expect(knows.length).toBeGreaterThan(2);
    // Certainly missing means ABSENT on every emitted edge.
    for (const edge of knows) {
      expect(edge[entityAttributesProperty]).not.toHaveProperty('var-u');
    }
  });
});
