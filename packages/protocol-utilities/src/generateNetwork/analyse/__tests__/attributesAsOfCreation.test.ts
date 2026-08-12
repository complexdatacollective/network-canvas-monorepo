import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import {
  analyseStageEffects,
  attributesAsOf,
  scopeKeyFor,
} from '../stageEffects';

/**
 * A value the creating interaction settled stands until something overwrites
 * it. The plan holds the FINAL value, so a stage filtering in between has to
 * be shown the creation-time one instead — otherwise the planner selects a
 * different subject domain from the stage it is standing in for, and emits
 * edges the interview never presents (or misses ones it does).
 */

const generator = {
  id: 'ng',
  type: 'NameGeneratorQuickAdd',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [
    {
      id: 'ng-p',
      text: 'Who?',
      additionalAttributes: [{ variable: 'local', value: true }],
    },
  ],
} as unknown as Stage;

const sociogram = {
  id: 'soc',
  type: 'Sociogram',
  label: 'Link',
  subject: { entity: 'node', type: 'person' },
  background: { concentricCircles: 3, skewedTowardCenter: true },
  behaviours: { freeDraw: true },
  prompts: [{ id: 'soc-p', text: 'Link', edges: { create: 'knows' } }],
} as unknown as Stage;

/** Overwrites `local` after the sociogram has run. */
const laterForm = {
  id: 'form',
  type: 'AlterForm',
  label: 'About',
  subject: { entity: 'node', type: 'person' },
  form: { title: 'About', fields: [{ variable: 'local', prompt: 'Local?' }] },
} as unknown as Stage;

const stages = [generator, sociogram, laterForm];
const scope = scopeKeyFor('node', 'person');

describe('projecting a value that a later stage overwrites', () => {
  const effects = analyseStageEffects(stages);

  it('shows the creation-time value while the overwrite is still ahead', () => {
    const projected = attributesAsOf(effects, scope, { local: false }, 1, {
      local: true,
    });

    expect(projected.local).toBe(true);
  });

  it('shows the final value once nothing rewrites it', () => {
    const projected = attributesAsOf(effects, scope, { local: false }, 2, {
      local: true,
    });

    expect(projected.local).toBe(false);
  });

  it('is unchanged where the creation settled nothing', () => {
    expect(attributesAsOf(effects, scope, { local: false }, 1).local).toBe(
      false,
    );
  });
});
