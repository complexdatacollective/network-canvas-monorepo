import { z } from 'zod';

import { localizedString } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

/**
 * How an interview that ends at a finish stage ended. Every outcome ends the
 * interview the same way; hosts record the outcome with the finish time and
 * exports carry it, so analysts can tell the endings apart.
 *
 * - `completed`: the normal end of the interview.
 * - `ineligible`: the participant did not qualify.
 * - `terminated`: any other early end the protocol decides on, such as a
 *   distress or safety stop.
 */
export const FINISH_OUTCOMES = [
  'completed',
  'ineligible',
  'terminated',
] as const;

export const FinishOutcomeSchema = z.enum(FINISH_OUTCOMES);

export type FinishOutcome = z.infer<typeof FinishOutcomeSchema>;

/**
 * The end of the interview. The participant reads its title and content, and
 * the Finish button ends the interview; the same text is shown again, with a
 * built-in notice, whenever a finished interview is opened.
 *
 * A finish stage has no skip logic: it is where every route through the
 * interview ends, so it can never be left out of one. The key is declared as
 * never present, rather than left out, so code reading `skipLogic` from any
 * stage reads it from this one as absent.
 */
export const finishSessionStage = baseStageSchema.extend({
  type: z.literal('FinishSession'),
  skipLogic: z
    .never({
      error:
        'A finish stage cannot have skip logic: every route through the interview ends at one.',
    })
    .optional(),
  title: localizedString(z.string().min(1), 'markdown'),
  content: localizedString(z.string().min(1), 'markdown'),
  outcome: FinishOutcomeSchema,
});

export type FinishSessionStage = z.infer<typeof finishSessionStage>;
