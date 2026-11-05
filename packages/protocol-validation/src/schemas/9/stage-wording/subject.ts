import type { MessageArguments } from '../../../localization/messageArguments.ts';

/**
 * The name of the node type a stage is about, as the codebook names it (such
 * as "Person"), which the words a stage shows about its nodes may use:
 * `{subject}`. Network Canvas's own wording does not, since a type's name is
 * the researcher's and is not translated, so no translation must show it.
 */
export const SUBJECT_ARGUMENTS = {
  subject: { kind: 'text' },
} as const satisfies MessageArguments;
