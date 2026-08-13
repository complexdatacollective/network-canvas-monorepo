import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  entityAttributesProperty,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A FamilyPedigree plants the diseases of every NarrativePedigree that reads
 * it — the flags themselves, and the relatives a disease needs in order to be
 * carried. Which narratives those are is a question about the stages this RUN
 * arrives at, and the answer changes once ego has been drawn.
 *
 * Feasibility's list cannot make that distinction: it is drawn up before ego
 * exists, so a narrative behind a guard the seed still decides stays in it.
 * The planner settles the same guard against the ego it drew. Handed the
 * pre-draw list, the pedigree planted a disease belonging to a screen this
 * session never reaches — an answer to a question the participant was never
 * asked.
 *
 * `probabilityTrue: 0.5` is what makes the two lists differ: a deterministic
 * value is settled by both passes and they agree.
 */

const familyStage = {
  id: 'family-stage',
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
    isGestationalCarrierVariable: 'isGestationalCarrier',
    gameteRoleVariable: 'gameteRole',
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Build your family.',
} as unknown as Stage;

const consentForm = {
  id: 'stage-consent',
  type: 'EgoForm',
  label: 'Consent',
  introductionPanel: { title: 'Consent', text: 'Consent' },
  form: { fields: [{ variable: 'skipNarrative', prompt: 'Skip it?' }] },
} as unknown as Stage;

/** Guarded on a value only the draw decides, so only the planner can settle it. */
const guardedNarrative = {
  id: 'narrative-stage',
  type: 'NarrativePedigree',
  label: 'Disease',
  sourceStageId: familyStage.id,
  showAtRiskStatuses: true,
  diseases: [
    {
      id: 'condition',
      label: 'Condition',
      color: '#cc0000',
      variable: 'condition',
      inheritancePattern: 'autosomalDominant',
    },
  ],
  skipLogic: {
    action: 'SKIP',
    filter: {
      rules: [
        {
          id: 'skip-it',
          type: 'ego',
          options: {
            attribute: 'skipNarrative',
            operator: 'EXACTLY',
            value: true,
          },
        },
      ],
    },
  },
} as unknown as Stage;

const codebook = {
  ego: {
    variables: {
      skipNarrative: {
        name: 'Skip narrative',
        type: 'boolean',
        synthetic: { probabilityTrue: 0.5 },
      },
    },
  },
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
        condition: { name: 'Condition', type: 'boolean' },
      },
    },
  },
  edge: {
    'family-edge': {
      name: 'Family edge',
      color: 'edge-color-seq-1',
      variables: {
        relationshipType: {
          name: 'Relationship type',
          type: 'categorical',
          options: RELATIONSHIP_TYPE_OPTIONS,
        },
        isActive: { name: 'Is active', type: 'boolean' },
        isGestationalCarrier: {
          name: 'Is gestational carrier',
          type: 'boolean',
        },
        gameteRole: {
          name: 'Gamete role',
          type: 'categorical',
          options: GAMETE_ROLE_OPTIONS,
        },
      },
    },
  },
} as unknown as StructuralCodebook;

describe('diseases of a narrative the seed settles as skipped', () => {
  it('plants none where the run never reaches that screen', () => {
    let skippedSeeds = 0;
    let reachedSeeds = 0;

    for (let seed = 1; seed <= 25; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [consentForm, familyStage, guardedNarrative],
        respectSkipLogicAndFiltering: true,
      });

      const skipped =
        network.ego[entityAttributesProperty].skipNarrative === true;
      const carries = network.nodes.some((node) =>
        Object.hasOwn(node[entityAttributesProperty], 'condition'),
      );

      if (skipped) {
        skippedSeeds += 1;
        expect(carries, `seed ${seed} skipped the narrative`).toBe(false);
      } else {
        reachedSeeds += 1;
      }
    }

    // Both branches must actually occur, or the assertion above is vacuous.
    expect(skippedSeeds).toBeGreaterThan(0);
    expect(reachedSeeds).toBeGreaterThan(0);
  });
});
