import {
  defineMessages,
  createAppIntl,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { MAX_PROTOCOL_UPLOAD_BYTES } from '~/fresco.config';

// Round up so a file that is only slightly over the limit is never displayed
// as exactly the limit (which would read as contradicting the message).
function formatMegabytes(bytes: number): number {
  return Math.ceil(bytes / (1024 * 1024));
}

/**
 * Returns a human-readable error if the protocol file exceeds the upload
 * limit, or null if it is acceptable. The limit is inclusive (a file exactly
 * at the limit is allowed), which the message wording reflects.
 */
export function getProtocolSizeError(
  file: { size: number },
  formatMessage: (
    message: MessageDescriptor,
    values?: Record<string, string | number>,
  ) => string = createAppIntl({ locale: 'en' }).formatMessage,
): string | null {
  if (file.size <= MAX_PROTOCOL_UPLOAD_BYTES) {
    return null;
  }

  return formatMessage(messages.tooLarge, {
    size: formatMegabytes(file.size),
    limit: formatMegabytes(MAX_PROTOCOL_UPLOAD_BYTES),
  });
}

const messages = defineMessages({
  tooLarge: {
    id: 'fresco.protocolSize.tooLarge',
    defaultMessage:
      'This protocol is {size, number} MB. Protocols must be {limit, number} MB or smaller to import.',
    description:
      'Researcher-facing protocolSize: This protocol is size, number MB. Protocols must be limit, number MB or smaller to import.',
  },
});
