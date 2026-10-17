import { z } from 'zod';

import { SkipLogicSchema } from '../common/index.ts';
import { DynamicValuesSchema } from '../dynamic-values.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';

/**
 * Longest stage id a protocol may carry. Hosts store stage ids in bounded
 * columns (Studio records the current and finish stage of each interview), so
 * the schema guarantees an id fits rather than letting a host reject an
 * interview mid-session.
 */
export const MAX_STAGE_ID_LENGTH = 128;

/**
 * Base schema for all stages.
 */
export const baseStageSchema = z.strictObject({
  id: z
    .string()
    .min(1, { message: 'A stage id must not be empty.' })
    .max(MAX_STAGE_ID_LENGTH, {
      message: `A stage id must be at most ${MAX_STAGE_ID_LENGTH} characters long.`,
    }),
  // `interviewScript` is authoring guidance and is never shown to a
  // participant. `label` is: the interview's stages menu lists it. It is
  // required, and every translation must say something, so it cannot be
  // silently dropped or left blank (#663): the interview has no name of its own
  // to show in its place.
  interviewScript: z.string().optional(),
  label: localizedString(nonBlankText(), 'plain'),
  skipLogic: SkipLogicSchema.optional(),
  // Values from the interview the stage's text may show, by the argument name
  // its messages use (see `dynamic-values.ts`).
  dynamicValues: DynamicValuesSchema.optional(),
});
