import { z } from 'zod';

import { SkipLogicSchema } from '../common/index.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';

/**
 * Base schema for all stages.
 */
export const baseStageSchema = z.strictObject({
  id: z.string(),
  // `interviewScript` is authoring guidance and is never shown to a
  // participant. `label` is: the interview's stages menu lists it. It is
  // required, and every translation must say something, so it cannot be
  // silently dropped or left blank (#663): the interview has no name of its own
  // to show in its place.
  interviewScript: z.string().optional(),
  label: localizedString(nonBlankText(), 'plain'),
  skipLogic: SkipLogicSchema.optional(),
});
