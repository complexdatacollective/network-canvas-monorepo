import type { WrappedFieldMetaProps } from 'redux-form';

const isErrorMessage = (error: unknown): error is string | number =>
  typeof error === 'string' || typeof error === 'number';

const getReduxFieldErrors = (error: unknown): string[] => {
  if (isErrorMessage(error)) return [String(error)];

  if (error && typeof error === 'object' && '_error' in error) {
    const arrayError = error._error;
    return isErrorMessage(arrayError) ? [String(arrayError)] : [];
  }

  return [];
};

export const getReduxFieldErrorState = (meta: WrappedFieldMetaProps) => {
  const metaRecord = meta as unknown as Record<string, unknown>;
  const error = meta.error ?? metaRecord.submitError;
  const errors = getReduxFieldErrors(error);

  return {
    errors,
    showErrors: Boolean(
      (meta.touched || metaRecord.submitFailed) && errors.length > 0,
    ),
  };
};
