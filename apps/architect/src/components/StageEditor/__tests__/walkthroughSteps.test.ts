import { describe, expect, it } from 'vitest';

import type { StageWalkthroughStep } from '@codaco/protocol-builder/interfaces/walkthroughs/walkthroughTypes';

import {
  resolveStepIndex,
  type VisibleStep,
} from '../walkthrough/walkthroughSteps';

const step = (id: string): StageWalkthroughStep => ({
  id,
  title: { id: `t.${id}`, defaultMessage: id },
  body: { id: `b.${id}`, defaultMessage: id },
});

// A Finish Screen's steps, in walkthrough order.
const STEPS = ['intro', 'mode', 'closing', 'finished', 'wording'].map(step);

const shown = (...ids: string[]): VisibleStep[] =>
  STEPS.filter((candidate) => ids.includes(candidate.id)).map((candidate) => ({
    step: candidate,
    sectionId: undefined,
  }));

const idAt = (visible: readonly VisibleStep[], index: number) =>
  visible[index]?.step.id;

describe('resolveStepIndex', () => {
  it('starts on the first step', () => {
    const visible = shown('intro', 'mode', 'closing');
    expect(idAt(visible, resolveStepIndex(visible, STEPS, undefined))).toBe(
      'intro',
    );
  });

  /**
   * The failure a position-based walkthrough had: on "finished", switching
   * the screen to automatic hides "closing", and the old position then named
   * "wording" — past a step the stage still needed.
   */
  it('stays on the same step when an earlier one disappears', () => {
    const before = shown('intro', 'mode', 'closing', 'finished', 'wording');
    const after = shown('intro', 'mode', 'finished', 'wording');
    expect(idAt(before, resolveStepIndex(before, STEPS, 'finished'))).toBe(
      'finished',
    );
    expect(idAt(after, resolveStepIndex(after, STEPS, 'finished'))).toBe(
      'finished',
    );
  });

  it('moves on to the next shown step when its own step disappears', () => {
    const visible = shown('intro', 'mode', 'finished', 'wording');
    expect(idAt(visible, resolveStepIndex(visible, STEPS, 'closing'))).toBe(
      'finished',
    );
  });

  it('falls back to the last step when nothing after it is shown', () => {
    const visible = shown('intro', 'mode');
    expect(idAt(visible, resolveStepIndex(visible, STEPS, 'wording'))).toBe(
      'mode',
    );
  });
});
