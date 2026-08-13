import { describe, expect, it } from 'vitest';

import {
  MAX_SYNTHETIC_POPULATION,
  type Stage,
  type StructuralCodebook,
} from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

/**
 * Two readings of "the seed cannot move this ego value", now taken from one
 * derivation.
 *
 * A guard reading only such values is settled before any seed is chosen — and
 * settled as NOT skipped, because one that fired was removed from the
 * reachable list before feasibility ran. Counted as merely writable, an
 * always-reached creator's population floor was set to zero, and preflight
 * then offered a later creator slots the plan had already spent.
 */

const codebook = {
  ego: {
    variables: {
      // Deterministic: every seed collects `false`, so the guard below never
      // fires and the creator after it is always reached.
      optOut: {
        name: 'Opt out',
        type: 'boolean',
        synthetic: { probabilityTrue: 0 },
      },
    },
  },
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        // Two values between three people is impossible — but only for people
        // the run actually builds.
        flag: { name: 'Flag', type: 'boolean', validation: { unique: true } },
      },
    },
  },
  edge: {},
} as unknown as StructuralCodebook;

const consentForm = {
  id: 'stage-consent',
  type: 'EgoForm',
  label: 'Consent',
  introductionPanel: { title: 'Consent', text: 'Consent' },
  form: { fields: [{ variable: 'optOut', prompt: 'Opt out?' }] },
} as unknown as Stage;

/**
 * Guarded on the deterministic value, which never fires — and large enough to
 * take almost the whole run budget, so what the stage after it receives
 * depends on this one's floor being counted.
 */
const guardedBulk = {
  id: 'stage-bulk',
  type: 'NameGenerator',
  label: 'Most people',
  subject: { entity: 'node', type: 'person' },
  synthetic: {
    count: { distribution: 'constant', value: MAX_SYNTHETIC_POPULATION - 2 },
  },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'bulk-p', text: 'Name people' }],
  skipLogic: {
    action: 'SKIP',
    filter: {
      rules: [
        {
          id: 'opted-out',
          type: 'ego',
          options: { attribute: 'optOut', operator: 'EXACTLY', value: true },
        },
      ],
    },
  },
} as unknown as Stage;

/** Asks for three, but only two slots remain once the bulk stage has spent. */
const flagged = {
  id: 'stage-flagged',
  type: 'NameGenerator',
  label: 'A few more',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 3 } },
  form: { title: 'About', fields: [{ variable: 'flag', prompt: 'Flag?' }] },
  prompts: [{ id: 'flag-p', text: 'Name a few' }],
} as unknown as Stage;

describe('a guard settled as not skipped', () => {
  it('keeps its creator counted, so the budget is apportioned as planned', () => {
    // The bulk stage is always reached, so the run has two slots left and the
    // second stage builds two people — which two distinct boolean values
    // satisfy exactly. Treated as one the planner MIGHT skip, its floor went
    // to zero, preflight offered the second stage all three slots it asked
    // for, and a `unique` boolean was refused for a third person the run
    // never builds.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [consentForm, guardedBulk, flagged],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes.length).toBeLessThanOrEqual(MAX_SYNTHETIC_POPULATION);
    const flags = network.nodes
      .map((node) => node.attributes.flag)
      .filter((value) => value !== undefined);
    expect(flags.length).toBeGreaterThan(0);
    expect(new Set(flags).size).toBe(flags.length);
  });
});
