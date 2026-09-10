import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';

/**
 * What an edit that reached nothing because editing had been taken away is
 * called on screen.
 *
 * One sentence for the whole editor, in a module of its own because more than
 * one thing decides this: the shell, which reports it for a save and for a
 * structural write it declines, and the controls that decide for themselves
 * whether a write may still happen. `extractMessages` throws on a duplicated
 * id, so a shared sentence has exactly one declaration; it keeps the `shell.`
 * area it was written for, because that is where the researcher reads it.
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
      'This stage is read-only, so your change was not made. Somebody else is editing it.',
    description:
      'Shown above a stage editor’s fields when the researcher cannot edit this stage — somebody else has it — and something they did would have written to it. A stage is one step of an interview.',
  },
});

export const READ_ONLY_MESSAGE = createMessageError(messages.readOnly);
