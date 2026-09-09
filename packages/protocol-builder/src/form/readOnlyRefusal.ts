import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';

/**
 * What an edit that reached nothing because editing had been taken away is
 * called on screen.
 *
 * One sentence for the whole editor, in a module of its own because more than
 * one thing decides this: the shell, which reports it for a save and for a
 * structural write the session refuses, and the controls that decide for
 * themselves whether a write may still happen — a type change the researcher
 * is asked about is applied when they ANSWER, and the lease can be gone by
 * then. `extractMessages` throws on a duplicated id, so a shared sentence has
 * exactly one declaration; it keeps the `shell.` area it was written for
 * because that is where the researcher reads it, in the form's own error
 * region.
 *
 * Encoded rather than formatted, because it is not rendered where it is
 * decided: it is handed to the form as a `formError`, held there until
 * something replaces it, and rendered by `FormErrors`, which decodes it — so a
 * refusal already on screen follows a change of language.
 */
const messages = defineMessages({
  readOnly: {
    id: 'protocolBuilder.shell.readOnlyRefusal',
    defaultMessage:
      'This stage is read-only, so your changes were not saved. Take over editing and try again.',
    description:
      'Shown above a stage editor’s fields when the researcher no longer holds the right to edit this stage (a stage is one step of an interview) and something they did would have written to it. Taking over editing is an action offered elsewhere in the host application.',
  },
});

export const READ_ONLY_MESSAGE = createMessageError(messages.readOnly);
