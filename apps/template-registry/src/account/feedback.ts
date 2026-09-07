import type { IntlShape } from '@codaco/app-i18n/messages';

import { AccountRequestError } from './api.ts';
import { messages } from './messages.ts';

export function accountErrorMessage(intl: IntlShape, error: unknown): string {
  const message =
    error instanceof AccountRequestError
      ? {
          signed_out: messages.signedOut,
          forbidden: messages.forbidden,
          rate_limited: messages.rateLimited,
          invalid: messages.invalid,
          unavailable: messages.unavailable,
          curation_metadata: messages.curationMetadata,
        }[error.failure]
      : messages.unavailable;
  return intl.formatMessage(message);
}
