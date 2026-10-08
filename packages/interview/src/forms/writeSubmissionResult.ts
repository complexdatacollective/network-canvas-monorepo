import {
  createMessageError,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';

import { runtimeMessages } from '../i18n/runtimeMessages';
import { isPassphraseRequiredError } from '../interfaces/Anonymisation/utils';

/** The settled action a dispatched network-write thunk resolves to. */
type WriteResult = {
  meta: { requestStatus: 'fulfilled' | 'rejected' };
  error?: { name?: string };
};

/** Why a write was refused, in words the participant can act on. */
export function writeFailureMessage(
  result: WriteResult,
): MessageDescriptor | undefined {
  if (result.meta.requestStatus === 'fulfilled') return undefined;
  return isPassphraseRequiredError(result.error)
    ? runtimeMessages.protectedAnswersNotSaved
    : runtimeMessages.submissionFailed;
}

/**
 * Why a write was refused, from the serialised error that `unwrap()` on the
 * dispatched write rejects with.
 */
export function rejectedWriteMessage(error: unknown): MessageDescriptor {
  const name =
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string'
      ? error.name
      : undefined;
  return isPassphraseRequiredError({ name })
    ? runtimeMessages.protectedAnswersNotSaved
    : runtimeMessages.submissionFailed;
}

/**
 * A form submission outcome for a write, so a refused write keeps the form
 * open with its values and an error rather than reporting success.
 */
export function writeSubmissionResult(
  result: WriteResult,
): FormSubmissionResult {
  const failure = writeFailureMessage(result);
  return failure
    ? { success: false, formErrors: [createMessageError(failure)] }
    : { success: true };
}
