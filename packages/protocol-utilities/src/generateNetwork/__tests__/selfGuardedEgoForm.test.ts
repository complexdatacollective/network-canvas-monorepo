import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

/**
 * An EgoForm whose own skip logic reads a field that same form collects.
 *
 * The reading is self-referential, which is what settles it: the only thing
 * that could answer the field is the very stage the guard decides about. The
 * interview evaluates availability against the session as it stands
 * (`buildStageAvailabilityMap`), so on arrival the field is unanswered —
 * `SKIP` on `NOT_EXISTS` hides the form and the field stays unanswered for
 * good, while `SKIP` on `EXISTS` lets the form run and the answer it collects
 * arrives too late to have hidden it.
 *
 * Both passes have to read it that way. `reachableStagesForFeasibility`
 * always did (it adds a form's fields to the possible set only after judging
 * that form's own guard); `planNetwork` projected ego AS OF the guarded stage,
 * and `attributesAsOf` keeps a write whose first index equals the one being
 * judged — so the plan saw the drawn value and decided both cases the other
 * way. Feasibility then dropped stages the plan went on to build, leaving the
 * entities it built unanalysed until they failed mid-plan.
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
  edge: {},
  ego: {
    variables: {
      consent: {
        name: 'Consent',
        type: 'boolean',
        synthetic: { probabilityTrue: 1 },
      },
    },
  },
} as unknown as Codebook;

/** An EgoForm collecting `consent`, guarded on `consent` itself. */
const selfGuardedForm = (operator: 'EXISTS' | 'NOT_EXISTS'): Stage =>
  ({
    id: 'stage-consent',
    type: 'EgoForm',
    label: 'Consent',
    introductionPanel: { title: 'Consent', text: 'Consent' },
    form: { fields: [{ variable: 'consent', prompt: 'Do you consent?' }] },
    skipLogic: {
      action: 'SKIP',
      filter: {
        rules: [
          {
            id: 'self',
            type: 'ego',
            options: { attribute: 'consent', operator },
          },
        ],
      },
      // The jump is what makes the disagreement observable: settled as
      // skipped, this pass drops the creator from feasibility altogether.
      destination: { type: 'stage', stageId: 'stage-after' },
    },
  }) as unknown as Stage;

const creator = {
  id: 'stage-people',
  type: 'NameGenerator',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 2 } },
  behaviours: { minNodes: 2, maxNodes: 2 },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'p1', text: 'Name people' }],
} as unknown as Stage;

const after = {
  id: 'stage-after',
  type: 'Information',
  label: 'Thanks',
  items: [],
} as unknown as Stage;

describe('an EgoForm guarded on a field it collects itself', () => {
  it('skips the form, and the jump it makes, when the guard reads NOT_EXISTS', () => {
    // On arrival `consent` is unanswered, so the guard fires and the form is
    // never shown — which is why it stays unanswered. The jump carries the
    // creator with it, so no people are introduced.
    for (let seed = 1; seed <= 5; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [selfGuardedForm('NOT_EXISTS'), creator, after],
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes, `seed ${seed}`).toHaveLength(0);
      expect(network.ego.attributes, `seed ${seed}`).not.toHaveProperty(
        'consent',
      );
    }
  });

  it('runs the form, and everything after it, when the guard reads EXISTS', () => {
    // The mirror case, and the one the plan used to decide the other way: on
    // arrival `consent` is unanswered, so `EXISTS` is false and the form runs.
    // The value it then collects cannot retroactively have hidden it, so the
    // creator the jump would have bypassed is reached.
    for (let seed = 1; seed <= 5; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [selfGuardedForm('EXISTS'), creator, after],
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes, `seed ${seed}`).toHaveLength(2);
      expect(network.ego.attributes.consent, `seed ${seed}`).toBe(true);
    }
  });
});
