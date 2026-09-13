import { createMessageError, defineMessage } from '@codaco/app-i18n/messages';

/**
 * Fresco's built-in required copy addresses a participant mid-interview. A
 * protocol is authored by a researcher, so the rule is stated instead.
 *
 * Encoded rather than formatted: it is handed to Fresco as the field's
 * `required` rule, which stores it as a plain string and hands it back as a
 * validation message. `FieldErrors` decodes it where it renders, so the
 * sentence follows a change of language while it sits under the control.
 */
const requiredMessage = defineMessage({
  id: 'protocolBuilder.field.required',
  defaultMessage: 'This field is required.',
  description:
    'Shown under any unanswered required control in a stage editor when the researcher tries to save the stage. Addresses the researcher authoring the protocol, not a participant answering it.',
});

/** What a stage editor's fields say when one that must be answered is not. */
export const REQUIRED = createMessageError(requiredMessage);
