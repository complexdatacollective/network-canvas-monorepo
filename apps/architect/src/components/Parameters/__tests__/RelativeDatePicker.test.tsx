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

const renderPicker = (initialValues?: Record<string, unknown>) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <Harness initialValues={initialValues} />
    </Provider>,
  );
};

// The anchor control only mounts once "Use interview date" is off, which the
// component derives from whether an anchor is already set.
const renderWithAnchor = (anchor: string) =>
  renderPicker({ parameters: { anchor } });

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

// Audit sweep: `parameters.min` on the anchor control configures the picker's
// selectable range; it does not validate the committed value. Without a
// matching editor rule the dialog saved a below-1000 anchor and the protocol
// validation listener then threw a blocking invalid-protocol dialog offering
// to revert the edit.
describe('RelativeDatePicker anchor year floor', () => {
  it('rejects an anchor whose year is below 1000', async () => {
    renderWithAnchor('2020-01-01');
    const anchor = screen.getByLabelText(/Specific Anchor Date/);

    fireEvent.change(anchor, { target: { value: '0500-01-01' } });
    fireEvent.blur(anchor);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Anchor date must use a four-digit year of 1000 or later',
        ),
      ).toBeInTheDocument();
    });
  });

  it('clears the error once the anchor is corrected to the floor', async () => {
    renderWithAnchor('2020-01-01');
    const anchor = screen.getByLabelText(/Specific Anchor Date/);

    fireEvent.change(anchor, { target: { value: '0500-01-01' } });
    fireEvent.blur(anchor);
    await waitFor(() => {
      expect(
        screen.getByText(
          'Anchor date must use a four-digit year of 1000 or later',
        ),
      ).toBeInTheDocument();
    });

    fireEvent.change(anchor, { target: { value: '1000-01-01' } });
    await waitFor(() => {
      expect(
        screen.queryByText(
          'Anchor date must use a four-digit year of 1000 or later',
        ),
      ).not.toBeInTheDocument();
    });
  });
});
