import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import {
  getSkipDestinationDeleteWarning,
  getSkipDestinationReorderGuard,
} from '../skipDestinationGuards';

const committedStages = [
  {
    id: 'source',
    type: 'Information',
    label: 'Repeated label',
    skipLogic: {
      action: 'SKIP',
      filter: { join: 'AND', rules: [] },
      destination: { type: 'stage', stageId: 'destination' },
    },
  },
  { id: 'middle', type: 'Information', label: 'Middle' },
  { id: 'destination', type: 'Information', label: 'Repeated label' },
] as Stage[];

describe('Timeline skip destination guards', () => {
  it('builds a dependent-delete dialog with absolute stage numbers', () => {
    expect(
      getSkipDestinationDeleteWarning(committedStages, 'destination'),
    ).toEqual({
      title: 'Cannot delete stage',
      description:
        'Stage 3 — Repeated label is the skip destination for Stage 1 — Repeated label. Choose a different destination on those stages before deleting it.',
    });
  });

  it('builds an invalid-reorder dialog with unambiguous stage references', () => {
    const proposedStages = [
      committedStages[2],
      committedStages[0],
      committedStages[1],
    ] as Stage[];
    const guard = getSkipDestinationReorderGuard(
      committedStages,
      proposedStages,
    );

    expect(guard).toMatchObject({
      allowed: false,
      warning: {
        title: 'Cannot move stage',
        description:
          'Stage 3 — Repeated label must remain later than Stage 1 — Repeated label, which routes to it when skipped. Choose a different destination before changing this order.',
      },
    });
  });

  it('returns the committed order for local Timeline restoration', () => {
    const proposedStages = [
      committedStages[2],
      committedStages[0],
      committedStages[1],
    ] as Stage[];
    const guard = getSkipDestinationReorderGuard(
      committedStages,
      proposedStages,
    );

    expect(guard.allowed).toBe(false);
    if (guard.allowed) {
      throw new Error('Expected the reorder to be rejected');
    }

    expect(guard.restoredStages).toBe(committedStages);
    expect(guard.restoredStages.map((stage) => stage.id)).toEqual([
      'source',
      'middle',
      'destination',
    ]);
  });
});
