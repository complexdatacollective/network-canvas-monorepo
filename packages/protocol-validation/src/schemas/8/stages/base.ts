import { z } from 'zod';

import { SkipLogicSchema } from '../common';

/**
 * Base schema for all stages.
 */
export const baseStageSchema = z.strictObject({
  id: z.string(),
  // `interviewScript` and `label` are author-facing only: `label` is the
  // human-readable stage title shown in Architect and `interviewScript` is
  // authoring guidance. Both are intentionally NOT rendered during the
  // interview itself (see Navigation.tsx). `label` is kept required so it
  // cannot be silently dropped from a protocol; the divergence from Architect
  // is deliberate, not a regression (#663).
  interviewScript: z.string().optional(),
  label: z.string(),
  skipLogic: SkipLogicSchema.optional(),
});
