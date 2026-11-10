import { z } from 'zod';

import {
  findMessageSyntaxProblem,
  messageText,
} from '../../../localization/messageSyntax.ts';
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
 * The most characters a stage's name may have in any language. A name is
 * shown in narrow places, such as Architect's timeline and the interview's
 * stage menu. What is counted is the text a reader sees, not how it is
 * stored: the name's message with its quoting removed (`messageText`, so
 * `'{'` counts as one character), measured as JavaScript measures a string's
 * length (UTF-16 code units, so most emoji count as two).
 */
export const STAGE_LABEL_MAX_LENGTH = 100;

/** The rule `STAGE_LABEL_MAX_LENGTH` names, as a refused name's issue carries it. */
export const STAGE_LABEL_TOO_LONG = 'stageLabelTooLong';

/** One translation of a stage's name: some text, and not too long to show. */
export const stageLabelText = () =>
  nonBlankText().superRefine((message, ctx) => {
    // A name that is not plain text is refused for that, and has no length a
    // reader would see.
    if (findMessageSyntaxProblem(message) !== undefined) return;
    const text = messageText(message);
    if (text.length > STAGE_LABEL_MAX_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: `Stage name "${text}" is ${text.length} characters long, but a stage name may be at most ${STAGE_LABEL_MAX_LENGTH}.`,
        params: {
          rule: STAGE_LABEL_TOO_LONG,
          max: STAGE_LABEL_MAX_LENGTH,
          text,
        },
      });
    }
  });

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
  // to show in its place. Every translation is held to the length a name can
  // be shown at (`STAGE_LABEL_MAX_LENGTH`).
  interviewScript: z.string().optional(),
  label: localizedString(stageLabelText(), 'plain'),
  skipLogic: SkipLogicSchema.optional(),
  // Values from the interview the stage's text may show, by the argument name
  // its messages use (see `dynamic-values.ts`).
  dynamicValues: DynamicValuesSchema.optional(),
});
