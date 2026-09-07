import {
  createAppIntl,
  createMessageError,
  defineMessages,
  formatMessageError,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { ensureError } from '@codaco/shared-consts';

export const submissionMessages = defineMessages({
  missingAttribute: {
    id: 'architect.submission.missingAttribute',
    defaultMessage: 'Attribute not found',
    description:
      'Submission failure when the selected attribute disappeared while the editor was open.',
  },
  failed: {
    id: 'architect.submission.failed',
    defaultMessage:
      'These changes could not be saved. Check the current settings and try again.',
    description:
      'Actionable fallback for an unexpected editor submission failure. Technical exception text is not shown as repair guidance.',
  },
  rowRemoved: {
    id: 'architect.submission.rowRemoved',
    defaultMessage:
      'This item was removed while your changes were being saved, so there is nothing left to save them to. Copy anything you want to keep, then cancel and add a new item.',
    description:
      'A row disappeared during its asynchronous save. Whole neutral wording avoids capturing a previously translated item label.',
  },
});
const defaultIntl = createAppIntl({ locale: 'en' });

/** Keep explicit translated errors; unexpected exception prose is diagnostic. */
export function toSubmissionError(
  error: unknown,
  fallback: MessageDescriptor = submissionMessages.failed,
): string {
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
      ? error.message
      : ensureError(error).message;
  return formatMessageError(message, defaultIntl) === undefined
    ? createMessageError(fallback)
    : message;
}
