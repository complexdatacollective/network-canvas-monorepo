import { z } from 'zod';

import { SkipLogicSchema } from '../common/index.ts';

/**
 * Base schema for all stages.
 */
export const baseStageSchema = z.strictObject({
  id: z.string(),
  // `interviewScript` and `label` are author-facing only: `label` is the
  // human-readable stage title shown in Architect and `interviewScript` is
  // authoring guidance. Both are intentionally NOT rendered during the
  // interview itself (see Navigation.tsx). `label` is kept required AND
  // non-empty so it cannot be silently dropped or left blank; the divergence
  // from Architect is deliberate, not a regression (#663).
  interviewScript: z.string().optional(),
  label: z.string().min(1, { message: 'Stage label cannot be empty' }),
  skipLogic: SkipLogicSchema.optional(),
});
