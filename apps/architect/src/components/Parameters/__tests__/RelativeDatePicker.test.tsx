import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import { reducer as formReducer, reduxForm } from 'redux-form';
import { describe, expect, it } from 'vitest';

import RelativeDatePicker from '../RelativeDatePicker';

const RelativeDatePickerField = RelativeDatePicker as unknown as ComponentType<{
  name: string;
  form: string;
}>;

const FORM = 'relative-date-test';

const Harness = reduxForm({ form: FORM })(() => (
  <RelativeDatePickerField name="parameters" form={FORM} />
));

const renderPicker = () => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <Harness />
    </Provider>,
  );
};

describe('RelativeDatePicker parameters', () => {
  it('gives the day-offset inputs accessible names', () => {
    renderPicker();

    expect(
      screen.getByRole('spinbutton', { name: 'Days before' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Days after' }),
    ).toBeInTheDocument();
  });
});
