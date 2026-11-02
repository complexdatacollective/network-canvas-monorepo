import type { z } from 'zod';

import { localizedMessage, nonBlankText } from '../localized-string.ts';
import { requiresCompletePlacement } from '../stage-wording/bins.ts';
import {
  requireWhenShown,
  type StageRecord,
} from '../stage-wording/conditions.ts';
import { SUBJECT_ARGUMENTS } from '../stage-wording/subject.ts';

/**
 * The words a bin stage shows about its completion gate, which Network Canvas
 * supplies (`stage-wording/bins.ts`). Shown only while the gate is on, so
 * required only then (`requireBinWording`). It may name the stage's node
 * type.
 */
export const binWording = {
  unplacedNodesNotice: localizedMessage(nonBlankText(), {
    arguments: SUBJECT_ARGUMENTS,
  }).optional(),
};

/** Refuses a bin stage whose completion gate is on without its notice. */
export const requireBinWording = (
  stage: StageRecord,
  ctx: z.RefinementCtx,
): void =>
  requireWhenShown(stage, ctx, [
    {
      name: 'unplacedNodesNotice',
      when: requiresCompletePlacement,
      message:
        'A stage that requires every node to be placed needs an unplaced nodes notice.',
    },
  ]);
