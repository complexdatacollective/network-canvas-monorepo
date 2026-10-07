import { z } from 'zod';

import { SkipLogicSchema } from '../common/index.ts';
import { localizedString } from '../localized-string.ts';

/**
 * Base schema for all stages.
 */
export const baseStageSchema = z.strictObject({
  id: z.string(),
  // `interviewScript` is authoring guidance and is never shown to a
  // participant. `label` is: the interview's stages menu lists it. It is
  // required AND non-empty so it cannot be silently dropped or left blank
  // (#663).
  interviewScript: z.string().optional(),
  label: localizedString(
    z.string().min(1, { message: 'Stage label cannot be empty' }),
    'plain',
  ),
  skipLogic: SkipLogicSchema.optional(),
});
