import {
  createAppIntl,
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { describeProtocolFileErrorMessage } from '@codaco/protocol-validation/messages';
const defaultIntl = createAppIntl({ locale: 'en' });
export type LocalizedText = {
  message: MessageDescriptor;
  values?: Record<string, string | number>;
};
import { ensureError } from '@codaco/shared-consts';

import { NetcanvasTooLargeError } from './netcanvasSizeGuard';
import { isStorageUnavailableError } from './storageErrors';
const importMessages = defineMessages({
  storage: {
    id: 'architect.importFailure.storage',
    defaultMessage:
      'Architect could not save this protocol on this device. Your device may be out of space, or your browser may be blocking storage \u2014 which is common in a private window.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  protocol: {
    id: 'architect.importFailure.protocol',
    defaultMessage: 'Architect could not open this protocol.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  template: {
    id: 'architect.importFailure.template',
    defaultMessage: 'Architect could not open this template.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

/**
 * What a researcher is told when a protocol will not open, and the raw text
 * behind it.
 *
 * The two are separate because they answer different questions. `message` is
 * the whole of what the dialog leads with: a sentence about the file, in
 * Architect's own words. `detail` is the underlying error's own message, shown
 * only if the researcher opens the technical-details disclosure — Architect is
 * offline-capable and a researcher with exception reporting turned off would
 * otherwise have nothing at all to quote when asking for help.
 */
export type ImportFailureDescription = {
  message: string;
  detail: string;
  localizedMessage?: LocalizedText;
};

/**
 * Where the file itself is the subject and nothing more specific is known.
 *
 * Deliberately does NOT claim the file is damaged: this is also where an
 * unrecognised internal failure lands, and telling a researcher their protocol
 * is corrupt when Architect simply fell over sends them looking for a backup
 * they do not need.
 */
export const PROTOCOL_OPEN_FAILURE_MESSAGE =
  'Architect could not open this protocol.';

/** The equivalent for a bundled template, which is never read from a file. */
export const TEMPLATE_OPEN_FAILURE_MESSAGE =
  'Architect could not open this template.';

/**
 * Storage failures are not file failures, and saying so matters: the protocol
 * is fine, the device cannot keep it. Named separately so the researcher is
 * pointed at space and private-window storage rather than at their file.
 */
export const STORAGE_FAILURE_MESSAGE =
  'Architect could not save this protocol on this device. Your device may be out of space, or your browser may be blocking storage — which is common in a private window.';

// How far down an error's `cause` chain the technical details go. Deep enough
// for the real failure (a taxonomy error wrapping a library's own rejection),
// bounded so a self-referential chain cannot spin.
const MAX_CAUSE_DEPTH = 4;

/**
 * The error's own text, plus whatever it was wrapping.
 *
 * The outermost error is usually Architect's or the validation package's
 * classification of the failure — useful, but the sentence support actually
 * needs is normally the one underneath it, from the library that gave up.
 */
const formatTechnicalDetail = (error: unknown): string => {
  const lines: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (current === undefined || current === null || seen.has(current)) break;
    seen.add(current);

    const asError = ensureError(current);
    lines.push(depth === 0 ? asError.message : `Caused by: ${asError.message}`);

    current = current instanceof Error ? current.cause : undefined;
  }

  return lines.join('\n');
};

/**
 * Describe an import or open failure in Architect's own words.
 *
 * Ordering: errors `@codaco/protocol-validation` recognises (a malformed
 * archive, a failed migration, an over-large payload) describe themselves;
 * then storage; then the caller's subject-appropriate default. Nothing from a
 * zip library, a JSON parser or a schema version calculation reaches `message`
 * by any route.
 */
export const describeImportFailure = (
  error: unknown,
  fallbackMessage: string,
  intl: IntlShape = defaultIntl,
): ImportFailureDescription => {
  const detail = formatTechnicalDetail(error);

  if (error instanceof NetcanvasTooLargeError) {
    return {
      message: intl.formatMessage(
        error.localizedMessage.message,
        error.localizedMessage.values,
      ),
      detail,
      localizedMessage: error.localizedMessage,
    };
  }

  const described = describeProtocolFileErrorMessage(error);
  if (described !== null) {
    return {
      message: intl.formatMessage(described.descriptor, described.values),
      detail,
      localizedMessage: {
        message: described.descriptor,
        values: described.values,
      },
    };
  }

  if (isStorageUnavailableError(error)) {
    return {
      message: intl.formatMessage(importMessages.storage),
      detail,
      localizedMessage: { message: importMessages.storage },
    };
  }

  const message =
    fallbackMessage === TEMPLATE_OPEN_FAILURE_MESSAGE
      ? importMessages.template
      : importMessages.protocol;
  return {
    message: intl.formatMessage(message),
    detail,
    localizedMessage: { message },
  };
};
