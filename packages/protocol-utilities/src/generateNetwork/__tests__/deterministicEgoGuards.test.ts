import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import { SyntheticDataConstraintError } from '../constraints/error';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * A creator the generated session ALWAYS skips must not be refused for
 * constraints on entities it never builds.
 *
 * Ego's `consent` is declared `probabilityTrue: 1`, so every seed collects
 * `true` and the guarded NameGenerator is skipped in every session this
 * protocol can produce. Its three people would each need a distinct value of
 * a `unique` Boolean, which two values cannot supply — an impossibility the
 * live session never reaches, because nobody is ever named there.
 * `analyseFeasibility` runs before `planNetwork` settles the guard, so unless
 * the reachability pass settles the deterministic guard itself, generation is
 * refused for a stage that provably never runs.
 */
const egoCodebook = (consent: Record<string, unknown>): Codebook =>
  ({
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
    ego: { variables: { consent: { name: 'Consent', ...consent } } },
  }) as unknown as Codebook;

const consentForm = {
  id: 'stage-consent',
  type: 'EgoForm',
  label: 'Consent',
  introductionPanel: { title: 'Consent', text: 'Consent' },
  form: { fields: [{ variable: 'consent', prompt: 'Do you consent?' }] },
} as unknown as Stage;

/**
 * Three people, each writing the `unique` Boolean — impossible on paper —
 * behind an all-ego guard.
 */
const guardedCreator = (options: Record<string, unknown>): Stage =>
  ({
    id: 'stage-people',
    type: 'NameGenerator',
    label: 'People',
    subject: { entity: 'node', type: 'person' },
    synthetic: { count: { distribution: 'constant', value: 3 } },
    form: {
      title: 'About',
      fields: [
        { variable: 'name', prompt: 'Name' },
        { variable: 'flag', prompt: 'Flag' },
      ],
    },
    prompts: [{ id: 'p1', text: 'Name people' }],
    skipLogic: {
      action: 'SKIP',
      filter: {
        rules: [{ id: 'consented', type: 'ego', options }],
      },
    },
  }) as unknown as Stage;

const skipWhenConsented = guardedCreator({
  attribute: 'consent',
  operator: 'EXACTLY',
  value: true,
});

const build = (codebook: Codebook, creator: Stage, seed: number) => () =>
  generateNetwork({
    seed,
    codebook,
    stages: [consentForm, creator],
    respectSkipLogicAndFiltering: true,
  });

const SEEDS = [1, 2, 3, 4, 5];

describe('a guard on a deterministic ego value', () => {
  it('settles the skip before feasibility, on every seed', () => {
    for (const seed of SEEDS) {
      const { network } = build(
        egoCodebook({ type: 'boolean', synthetic: { probabilityTrue: 1 } }),
        skipWhenConsented,
        seed,
      )();

      // The session consents, skips the creator, and names nobody — so the
      // unique Boolean it could never have satisfied is never asked for.
      expect(
        network.ego?.[entityAttributesProperty].consent,
        `seed ${seed}`,
      ).toBe(true);
      expect(network.nodes, `seed ${seed}`).toHaveLength(0);
    }
  });

  it('settles a guard reading a certainly-unanswered value', () => {
    // `missingProbability: 1` on an optional variable leaves ego holding
    // nothing for it, exactly as the empty-ego reading models — so a guard
    // that fires on the absence fires on every seed.
    for (const seed of SEEDS) {
      const { network } = build(
        egoCodebook({
          type: 'boolean',
          synthetic: { probabilityTrue: 1, missingProbability: 1 },
        }),
        guardedCreator({ attribute: 'consent', operator: 'NOT_EXISTS' }),
        seed,
      )();

      expect(
        network.ego?.[entityAttributesProperty],
        `seed ${seed}`,
      ).not.toHaveProperty('consent');
      expect(network.nodes, `seed ${seed}`).toHaveLength(0);
    }
  });
});

describe('a guard the seed still decides', () => {
  it('keeps the creator where the value is drawn', () => {
    // The ordinary conservative reading: half the sessions reach the creator,
    // so its impossible unique space is a refusal the live session can meet.
    for (const seed of SEEDS) {
      const attempt = build(
        egoCodebook({ type: 'boolean', synthetic: { probabilityTrue: 0.5 } }),
        skipWhenConsented,
        seed,
      );

      expect(attempt, `seed ${seed}`).toThrow(SyntheticDataConstraintError);
      expect(attempt, `seed ${seed}`).toThrow(/distinct values are possible/);
    }
  });

  it('keeps the creator where the deterministic value leaves it reachable', () => {
    // Settling the guard is not the same as removing the stage: at
    // `probabilityTrue: 0` the SKIP never fires, the session really does name
    // three people, and the refusal is correct.
    for (const seed of SEEDS) {
      const attempt = build(
        egoCodebook({ type: 'boolean', synthetic: { probabilityTrue: 0 } }),
        skipWhenConsented,
        seed,
      );

      expect(attempt, `seed ${seed}`).toThrow(SyntheticDataConstraintError);
      expect(attempt, `seed ${seed}`).toThrow(/distinct values are possible/);
    }
  });

  it('keeps the creator where a unique draw walks past the declaration', () => {
    // A `unique` variable is drawn from its slot's distinct-value sequence
    // rather than from `probabilityTrue`, so the declaration settles nothing:
    // ego arrives at the guard holding `false`, the SKIP does not fire, and
    // the creator is reached.
    for (const seed of SEEDS) {
      const attempt = build(
        egoCodebook({
          type: 'boolean',
          validation: { unique: true },
          synthetic: { probabilityTrue: 1 },
        }),
        skipWhenConsented,
        seed,
      );

      expect(attempt, `seed ${seed}`).toThrow(SyntheticDataConstraintError);
      expect(attempt, `seed ${seed}`).toThrow(/distinct values are possible/);
    }
  });
});
