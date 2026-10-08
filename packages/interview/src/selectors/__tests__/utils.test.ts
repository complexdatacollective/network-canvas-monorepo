import { describe, expect, it } from 'vitest';

import { getInterviewProgress } from '../utils';

describe('getInterviewProgress', () => {
  it('counts every stage, the finish stage included, in totalSteps', () => {
    const stages = [
      { type: 'Information' },
      { type: 'Information' },
      { type: 'Information' },
      { type: 'FinishSession' },
    ];

    expect(getInterviewProgress(stages, 0).totalSteps).toBe(4);
  });

  it('reports 100% progress on the finish stage at the end', () => {
    const stages = [
      { type: 'Information' },
      { type: 'Information' },
      { type: 'FinishSession' },
    ];

    expect(getInterviewProgress(stages, 2).progress).toBe(100);
  });

  it('weights a single-prompt stage as a full step on entry', () => {
    const stages = [
      { type: 'Information' },
      { type: 'Information' },
      { type: 'FinishSession' },
    ]; // totalSteps = 3

    // Entering stage 0 (no prompts ⇒ treated as one prompt): (0/3 + 1·1/3)·100
    expect(getInterviewProgress(stages, 0).progress).toBeCloseTo(100 / 3);
  });

  it('contributes no prompt worth when entering a multi-prompt stage at its first prompt', () => {
    const stages = [
      { type: 'NameGenerator', prompts: [{}, {}] },
      { type: 'Information' },
    ];

    expect(getInterviewProgress(stages, 0).progress).toBe(0);
  });
});
