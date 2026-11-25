import type { Stage as TStage } from '@codaco/protocol-validation';

export type Direction = 'forwards' | 'backwards';

export type NavigationIntent = 'step' | 'jump';

/**
 * A stage's answer when the participant asks to move:
 * - `true`: the interview moves to the next (or previous) prompt or stage.
 * - `'FORCE'`: it moves to the next (or previous) stage, past any further
 *   prompts.
 * - `'MOVED_WITHIN_STAGE'`: the stage has moved within itself, to another
 *   pair, person or slide, and the interview stays on this prompt.
 * - `false`: the interview stays where it is, because the stage refused the
 *   move (an answer is missing, or a write was refused) or had nothing to
 *   move to.
 */
export type BeforeNextResult = boolean | 'FORCE' | 'MOVED_WITHIN_STAGE';

export type BeforeNextFunction = (
  direction: Direction,
  intent: NavigationIntent,
) => Promise<BeforeNextResult> | BeforeNextResult;

export type RegisterBeforeNext = {
  (fn: BeforeNextFunction | null): void;
  (key: string, fn: BeforeNextFunction | null): void;
};

export type StageProps<T extends TStage['type'] = TStage['type']> = {
  stage: Extract<TStage, { type: T }>;
  getNavigationHelpers: () => {
    moveForward: () => void;
    moveBackward: () => void;
  };
};
