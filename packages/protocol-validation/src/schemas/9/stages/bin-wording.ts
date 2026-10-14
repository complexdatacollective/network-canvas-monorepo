import type { z } from 'zod';

import { localizedString, nonBlankText } from '../localized-string.ts';
import { requiresCompletePlacement } from '../stage-wording/bins.ts';
import {
  requireWhenShown,
  type StageRecord,
} from '../stage-wording/conditions.ts';

/**
 * The words a bin stage shows about its completion gate, which Network Canvas
 * supplies (`stage-wording/bins.ts`). Shown only while the gate is on, so
 * required only then (`requireBinWording`).
 */
export const binWording = {
  unplacedNodesNotice: localizedString(nonBlankText(), 'plain').optional(),
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
