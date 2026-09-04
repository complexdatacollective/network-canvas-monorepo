import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';

const messages = defineMessages({
  invalid: {
    id: 'studio.emailValidation.invalid',
    defaultMessage: 'Enter a valid email address.',
    description:
      'Validation error under an email field whose value is not an email address.',
  },
});

/**
 * The email pattern every Studio email field shares. Takes the caller's intl
 * (and an already-formatted hint) so the error follows the active locale.
 */
export function studioEmailPattern(intl: IntlShape, hint: string) {
  return {
    regex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    hint,
    errorMessage: intl.formatMessage(messages.invalid),
  } as const;
}
