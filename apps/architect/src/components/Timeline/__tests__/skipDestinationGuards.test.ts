import { describe, expect, it } from 'vitest';

import { ProtocolObjectIdSchema } from '@codaco/protocol-validation';
import { messageFields } from '~/test/messageText';

import {
  getSkipDestinationDeleteWarning,
  getSkipDestinationReorderGuard,
} from '../skipDestinationGuards';

const SOURCE_STAGE_ID = ProtocolObjectIdSchema.parse(
  'df65ca51-a398-43b7-8c23-aaed0b93a32a',
);
const MIDDLE_STAGE_ID = ProtocolObjectIdSchema.parse(
  'f7f4a418-bbc8-45f6-8e81-0ffd41258cc8',
);
const DESTINATION_STAGE_ID = ProtocolObjectIdSchema.parse(
  'c9e4f8cb-0764-4dcb-8136-f36d895a2a3f',
);

// The Timeline passes each stage with its label already resolved to text.
type GuardStage = Parameters<typeof getSkipDestinationDeleteWarning>[0][number];

const source: GuardStage = {
  id: SOURCE_STAGE_ID,
  type: 'Information',
  label: 'Repeated label',
  skipLogic: { destination: { type: 'stage', stageId: DESTINATION_STAGE_ID } },
};
const middle: GuardStage = {
  id: MIDDLE_STAGE_ID,
  type: 'Information',
  label: 'Middle',
};
const destination: GuardStage = {
  id: DESTINATION_STAGE_ID,
  type: 'Information',
  label: 'Repeated label',
};
const committedStages = [source, middle, destination];

describe('Timeline skip destination guards', () => {
  it('builds a dependent-delete dialog with absolute stage numbers', () => {
    expect(
      messageFields(
        getSkipDestinationDeleteWarning(committedStages, DESTINATION_STAGE_ID),
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
      SOURCE_STAGE_ID,
      MIDDLE_STAGE_ID,
      DESTINATION_STAGE_ID,
    ]);
  });
});
