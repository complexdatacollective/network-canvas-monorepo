import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { messageFields } from '~/test/messageText';

import {
  getPedigreeSourceReorderGuard,
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
    const proposedStages = [
      committedStages[2],
      committedStages[0],
      committedStages[1],
    ] as Stage[];
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

describe('Timeline pedigree source guard', () => {
  // Pruned the way the Timeline's own stage list is: no `sourceStageId`.
  const committed = [
    { id: 'fp', type: 'FamilyPedigree', label: 'Family' },
    { id: 'middle', type: 'Information', label: 'Middle' },
    { id: 'np', type: 'NarrativePedigree', label: 'Conditions' },
  ] as Stage[];
  const getSourceStageId = (id: string) => (id === 'np' ? 'fp' : undefined);

  it('builds an invalid-reorder dialog naming the source and its reader', () => {
    const proposed = [committed[2], committed[0], committed[1]] as Stage[];
    const guard = getPedigreeSourceReorderGuard(
      committed,
      proposed,
      getSourceStageId,
    );

    expect({
      ...guard,
      warning: !guard.allowed ? messageFields(guard.warning) : undefined,
    }).toMatchObject({
      allowed: false,
      warning: {
        title: 'Cannot move stage',
        description:
          'Stage 1 — Family must remain earlier than Stage 3 — Conditions, which shows the family it collects. Choose a different source stage before changing this order.',
      },
    });
    if (guard.allowed) throw new Error('Expected the reorder to be rejected');
    expect(guard.restoredStages).toBe(committed);
  });

  it('allows an order that keeps the source first', () => {
    const proposed = [committed[1], committed[0], committed[2]] as Stage[];

    expect(
      getPedigreeSourceReorderGuard(committed, proposed, getSourceStageId),
    ).toEqual({ allowed: true });
  });
});
