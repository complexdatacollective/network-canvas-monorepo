import { z } from 'zod';

import { SkipLogicSchema } from '../common';

/**
 * Base schema for all stages.
 */
export const baseStageSchema = z.strictObject({
  id: z.string(),
  interviewScript: z.string().optional(),
  label: z.string(),
  skipLogic: SkipLogicSchema.optional(),
});
