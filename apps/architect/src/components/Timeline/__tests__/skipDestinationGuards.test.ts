import { describe, expect, it } from 'vitest';

import { messageFields } from '~/test/messageText';

import {
  getSkipDestinationDeleteWarning,
  getSkipDestinationReorderGuard,
} from '../skipDestinationGuards';

// The Timeline passes each stage with its label already resolved to text.
type GuardStage = Parameters<typeof getSkipDestinationDeleteWarning>[0][number];

const source: GuardStage = {
  id: 'source',
  type: 'Information',
  label: 'Repeated label',
  skipLogic: { destination: { type: 'stage', stageId: 'destination' } },
};
const middle: GuardStage = {
  id: 'middle',
  type: 'Information',
  label: 'Middle',
};
const destination: GuardStage = {
  id: 'destination',
  type: 'Information',
  label: 'Repeated label',
};
const committedStages = [source, middle, destination];

describe('Timeline skip destination guards', () => {
  it('builds a dependent-delete dialog with absolute stage numbers', () => {
    expect(
      messageFields(
        getSkipDestinationDeleteWarning(committedStages, 'destination'),
      ),
    ).toEqual({
      title: 'Cannot delete stage',
      description:
        'Stage 3 — Repeated label is the skip destination for Stage 1 — Repeated label. Choose a different destination on those stages before deleting it.',
    });
  });

  it('builds an invalid-reorder dialog with unambiguous stage references', () => {
    const proposedStages = [destination, source, middle];
    const guard = getSkipDestinationReorderGuard(
      committedStages,
      proposedStages,
    );

    expect({
      ...guard,
      warning: !guard.allowed ? messageFields(guard.warning) : undefined,
    }).toMatchObject({
      allowed: false,
      warning: {
        title: 'Cannot move stage',
        description:
          'Stage 3 — Repeated label must remain later than Stage 1 — Repeated label, which routes to it when skipped. Choose a different destination before changing this order.',
      },
    });
  });

  it('returns the committed order for local Timeline restoration', () => {
    const proposedStages = [destination, source, middle];
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
