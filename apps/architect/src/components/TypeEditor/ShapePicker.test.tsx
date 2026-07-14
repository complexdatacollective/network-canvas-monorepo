import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Field, reducer as formReducer, reduxForm } from 'redux-form';
import { describe, expect, it } from 'vitest';

import ShapePicker from './ShapePicker';

const Harness = reduxForm<{ shape?: string }>({ form: 'shape-picker-test' })(
  () => (
    <Field name="shape" component={ShapePicker} label="Node shape" required />
  ),
);

describe('ShapePicker', () => {
  it('uses radio semantics and persists the selected shape', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={store}>
        <Harness initialValues={{ shape: 'circle' }} />
      </Provider>,
    );

    expect(
      screen.getByRole('radiogroup', { name: 'Node shape' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Node shape' }),
    ).toHaveAttribute('aria-required', 'true');
    expect(
      screen.getByRole('radio', { name: 'Select shape Circle' }),
    ).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(
      screen.getByRole('radio', { name: 'Select shape Diamond' }),
    );

    expect(store.getState().form['shape-picker-test']?.values?.shape).toBe(
      'diamond',
    );
  });
});
