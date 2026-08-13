import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';
import { SyntheticDataConstraintError } from '../constraints/error';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * Repro for: feasibility's population budget counts a creator the planner
 * settles as skipped, starving the later creator's feasibility cap while the
 * plan assigns that creator its full declared count.
 *
 * Stage 0 collects ego `consent` (probabilityTrue 1). Stage 1 is a
 * NameGenerator declaring 10,000 people, guarded by an all-ego SKIP on
 * consent === true — feasibility cannot settle the guard and counts its
 * 10,000 against MAX_SYNTHETIC_POPULATION, apportioning stage 2 a ceiling of
 * 0. Stage 2 declares 3 people whose form writes a unique boolean `flag` at
 * creation: 3 holders over a 2-value space is impossible, but preflight sees
 * 0 holders and passes. The planner settles the guard, skips stage 1, and
 * assigns stage 2 all 3 nodes — exhausting the unique registry mid-plan.
 *
 * CORRECT behaviour: the impossibility is a clean preflight refusal naming
 * the unique value space ("only 2 distinct values are possible, but up to 3
 * nodes ... can be generated"), identical on every seed. (Control: with
 * `guardedBigCreator` removed from `stages`, exactly that refusal fires.)
 */
const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        flag: { name: 'Flag', type: 'boolean', validation: { unique: true } },
      },
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

const consentForm = {
  id: 'stage-consent',
  type: 'EgoForm',
  label: 'Consent',
  introductionPanel: { title: 'Consent', text: 'Consent' },
  form: { fields: [{ variable: 'consent', prompt: 'Consent?' }] },
} as unknown as Stage;

/** Guarded creator: 10,000 people, skipped whenever ego consented. */
const guardedBigCreator = {
  id: 'stage-many',
  type: 'NameGenerator',
  label: 'Many people',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 10000 } },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'p1', text: 'Name people' }],
  skipLogic: {
    action: 'SKIP',
    filter: {
      rules: [
        {
          id: 'consented',
          type: 'ego',
          options: { attribute: 'consent', operator: 'EXACTLY', value: true },
        },
      ],
    },
  },
} as unknown as Stage;

/** Unguarded creator: 3 people, each writing the unique boolean `flag`. */
const flagCreator = {
  id: 'stage-flag',
  type: 'NameGenerator',
  label: 'Flagged people',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 3 } },
  form: {
    title: 'About',
    fields: [
      { variable: 'name', prompt: 'Name' },
      { variable: 'flag', prompt: 'Flag' },
    ],
  },
  prompts: [{ id: 'p2', text: 'Name flagged people' }],
} as unknown as Stage;

describe('feasibility budget vs planner budget over a settled-skip creator', () => {
  it('refuses the impossible unique space at preflight, on every seed', () => {
    for (const seed of [1, 2, 3]) {
      const build = () =>
        generateNetwork({
          seed,
          codebook,
          stages: [consentForm, guardedBigCreator, flagCreator],
          respectSkipLogicAndFiltering: true,
        });

      // The protocol is genuinely impossible for the live session (3 unique
      // booleans over a 2-value space), so refusal is correct — but it must
      // be the preflight refusal that names the unique value space, not a
      // mid-plan value-exhaustion crash after preflight passed.
      expect(build, `seed ${seed}`).toThrow(SyntheticDataConstraintError);
      expect(build, `seed ${seed}`).toThrow(/distinct values are possible/);
    }
  });
});
