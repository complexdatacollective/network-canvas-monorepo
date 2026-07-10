import type { WrappedFieldMetaProps } from 'redux-form';
import { describe, expect, it } from 'vitest';

import { getReduxFieldErrorState } from '../reduxFieldMeta';

const createMeta = (error: unknown, overrides: Record<string, unknown> = {}) =>
  ({
    error,
    touched: true,
    ...overrides,
  }) as unknown as WrappedFieldMetaProps;

describe('getReduxFieldErrorState', () => {
  it('returns direct field-level validation messages', () => {
    expect(getReduxFieldErrorState(createMeta('Required'))).toEqual({
      errors: ['Required'],
      showErrors: true,
    });
  });

  it('returns Redux Form array-level errors', () => {
    const error = Object.assign([], { _error: 'Add at least two items' });

    expect(getReduxFieldErrorState(createMeta(error))).toEqual({
      errors: ['Add at least two items'],
      showErrors: true,
    });
  });

  it('leaves indexed array errors with their child fields', () => {
    const error = [undefined, { label: 'Required' }];

    expect(getReduxFieldErrorState(createMeta(error))).toEqual({
      errors: [],
      showErrors: false,
    });
  });
});
