import { describe, expect, it } from 'vitest';

import { getSkipLogicDestinationLabel } from '../skipLogicDestination';

const stages = [
  { id: 'intro', label: 'Introduction' },
  { id: 'debrief', label: 'Debrief' },
  { id: 'untitled', label: '' },
];

describe('getSkipLogicDestinationLabel', () => {
  it('describes the legacy next-available behavior', () => {
    expect(getSkipLogicDestinationLabel(stages)).toBe('Next available stage');
  });

  it('describes the interview finish destination', () => {
    expect(getSkipLogicDestinationLabel(stages, { type: 'finish' })).toBe(
      'End interview',
    );
  });

  it('resolves a target label and absolute stage number', () => {
    expect(
      getSkipLogicDestinationLabel(stages, {
        type: 'stage',
        stageId: 'debrief',
      }),
    ).toBe('Stage 2 — Debrief');
  });

  it('uses an explicit label for untitled and missing targets', () => {
    expect(
      getSkipLogicDestinationLabel(stages, {
        type: 'stage',
        stageId: 'untitled',
      }),
    ).toBe('Stage 3 — Untitled stage');
    expect(
      getSkipLogicDestinationLabel(stages, {
        type: 'stage',
        stageId: 'missing',
      }),
    ).toBe('Unknown stage');
  });
});
