import { describe, expect, it } from 'vitest';

import { resolveRecoveryStep } from '../skip-logic';

describe('resolveRecoveryStep', () => {
  it('advances to the next valid stage when the entry stage is skipped and there is no earlier valid stage', () => {
    // stages[0] resolves to "skipped" on entry (e.g. a SHOW rule gated on
    // ego.consent against the empty starting network). There is no earlier
    // valid stage, so the recovery must advance forwards rather than be a
    // no-op at the skipped stage.
    expect(
      resolveRecoveryStep({
        currentStep: 0,
        previousValidStageIndex: 0, // selector falls back to currentStep == none
        nextValidStageIndex: 1,
      }),
    ).toBe(1);
  });

  it('returns to the earlier valid stage when one exists', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 3,
        previousValidStageIndex: 1,
        nextValidStageIndex: 4,
      }),
    ).toBe(1);
  });
});
