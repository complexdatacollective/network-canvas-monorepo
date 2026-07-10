import type { WrappedFieldMetaProps } from 'redux-form';

export const getReduxFieldErrors = (error: unknown): string[] => {
  if (!error) return [];
  return Array.isArray(error) ? error.map(String) : [String(error)];
};

export const getReduxFieldErrorState = (meta: WrappedFieldMetaProps) => {
  const metaRecord = meta as unknown as Record<string, unknown>;
  const error = meta.error ?? metaRecord.submitError;

  return {
    errors: getReduxFieldErrors(error),
    showErrors: Boolean((meta.touched || metaRecord.submitFailed) && error),
  };
};
