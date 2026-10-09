import { z } from 'zod';

import { localizedString, nonBlankText } from '../localized-string.ts';
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
 * notice that the interview is finished, whenever it is opened.
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
  // A new protocol in a language Network Canvas supplies no closing text for
  // starts with none of these, rather than with text in another language
  // recorded under its own. The label may stay empty: the interview's stages
  // menu leaves the finish stage out, so no participant reads it. The title
  // and content may be empty only while the protocol is being written: it
  // cannot leave its editor until both are written in its default language
  // (`findFinishStageTextProblems`, checked by `validateProtocol`).
  //
  // A translation that is there is never blank: the interview would choose
  // it over falling back, and show a participant nothing.
  label: localizedString(nonBlankText(), 'plain', { mayBeEmpty: true }),
  title: localizedString(nonBlankText(), 'markdown', { mayBeEmpty: true }),
  content: localizedString(nonBlankText(), 'markdown', { mayBeEmpty: true }),
  // The interview's own words on this screen, which Network Canvas supplies
  // (`stage-wording/finish-session.ts`): the Finish button, the question it
  // asks, the notice once the interview has ended, and what the question says
  // when the interview could not be ended.
  finishLabel: localizedString(nonBlankText(), 'plain'),
  finishConfirmation: localizedString(nonBlankText(), 'plain'),
  finishedNotice: localizedString(nonBlankText(), 'plain'),
  finishFailed: localizedString(nonBlankText(), 'plain'),
  outcome: FinishOutcomeSchema,
});

export type FinishSessionStage = z.infer<typeof finishSessionStage>;
