import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  Field,
  reducer as formReducer,
  type WrappedFieldProps,
} from 'redux-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BasicForm from '../BasicForm';

const required = (value: unknown) => (value ? undefined : 'Required');

const TestField = ({
  input,
  meta,
  label,
}: WrappedFieldProps & { label: string }) => (
  <div aria-invalid={(meta.touched && meta.invalid) || undefined}>
    <label>
      {label}
      <input {...input} />
    </label>
  </div>
);

describe('BasicForm', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        window.setTimeout(() => callback(performance.now()), 0);
        return 1;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('focuses the first invalid control in the submitted form', async () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });
    const onSubmit = vi.fn();

    render(
      <Provider store={store}>
        <input aria-label="Outside invalid field" aria-invalid="true" />
        <BasicForm form="basic-form-test" onSubmit={onSubmit}>
          <Field
            name="first"
            label="First field"
            component={TestField}
            validate={required}
          />
          <Field
            name="second"
            label="Second field"
            component={TestField}
            validate={required}
          />
          <button type="submit">Save</button>
        </BasicForm>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: 'First field' }),
      ).toHaveFocus();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
