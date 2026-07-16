import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it.each(['Days before', 'Days after'])(
    'rejects a negative %s offset',
    async (label) => {
      renderPicker();
      const input = screen.getByRole('spinbutton', { name: label });

      fireEvent.change(input, { target: { value: '-5' } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText('Must be at least 0')).toBeInTheDocument();
      });
    },
  );

  it.each(['Days before', 'Days after'])(
    'clears the error once %s is corrected to zero',
    async (label) => {
      renderPicker();
      const input = screen.getByRole('spinbutton', { name: label });

      fireEvent.change(input, { target: { value: '-5' } });
      fireEvent.blur(input);
      await waitFor(() => {
        expect(screen.getByText('Must be at least 0')).toBeInTheDocument();
      });

      fireEvent.change(input, { target: { value: '0' } });
      await waitFor(() => {
        expect(
          screen.queryByText('Must be at least 0'),
        ).not.toBeInTheDocument();
      });
    },
  );
});
