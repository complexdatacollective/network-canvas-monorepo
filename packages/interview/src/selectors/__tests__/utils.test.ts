import { describe, expect, it } from 'vitest';

import { getInterviewProgress } from '../utils';

describe('getInterviewProgress', () => {
  it('counts the appended finish stage in totalSteps (P + 1)', () => {
    const stages = [
      { type: 'Information' },
      { type: 'Information' },
      { type: 'Information' },
    ]; // 3 protocol stages

    expect(getInterviewProgress(stages, 0).totalSteps).toBe(4);
  });

  it('reports 100% progress on the appended finish step (currentStep === P)', () => {
    const stages = [{ type: 'Information' }, { type: 'Information' }]; // P = 2; finish stage sits at index 2

    expect(getInterviewProgress(stages, 2).progress).toBe(100);
  });

  it('weights a single-prompt stage as a full step on entry', () => {
    const stages = [{ type: 'Information' }, { type: 'Information' }]; // totalSteps = 3

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
