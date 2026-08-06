import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import RelativeDatePicker from '../RelativeDatePicker';

const renderPicker = (initialParameters?: Record<string, unknown>) => {
  render(
    <Form onSubmit={() => ({ success: true })}>
      <RelativeDatePicker
        name="parameters"
        initialParameters={initialParameters}
      />
    </Form>,
  );
};

// The anchor control only mounts once "Use interview date" is off, which the
// component derives from whether an anchor is already set.
const renderWithAnchor = (anchor: string) => renderPicker({ anchor });

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
        expect(screen.getByText('Too small. Value must be at least 0.')).toBeInTheDocument();
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
        expect(screen.getByText('Too small. Value must be at least 0.')).toBeInTheDocument();
      });

      fireEvent.change(input, { target: { value: '0' } });
      await waitFor(() => {
        expect(
          screen.queryByText('Too small. Value must be at least 0.'),
        ).not.toBeInTheDocument();
      });
    },
  );
});

// Audit sweep: `parameters.min` on the anchor control configures the picker's
// selectable range; it does not validate the committed value. Without a
// matching editor rule the dialog saved a below-floor anchor and the protocol
// validation listener then threw a blocking invalid-protocol dialog offering
// to revert the edit.
describe('RelativeDatePicker anchor year floor', () => {
  it('accepts a schema-valid anchor whose year is below 100', async () => {
    renderWithAnchor('2020-01-01');
    const anchor = screen.getByLabelText(/Specific Anchor Date/);

    fireEvent.change(anchor, { target: { value: '0050-01-01' } });
    fireEvent.blur(anchor);

    await waitFor(() => {
      expect(
        screen.queryByText(/Anchor date must use a year/),
      ).not.toBeInTheDocument();
    });
  });

  it('offers and accepts the schema floor', async () => {
    renderWithAnchor('2020-01-01');
    const anchor = screen.getByLabelText(/Specific Anchor Date/);

    expect(anchor).toHaveAttribute('min', '0001-01-01');

    fireEvent.change(anchor, { target: { value: '0001-01-01' } });
    fireEvent.blur(anchor);

    await waitFor(() => {
      expect(
        screen.queryByText('Anchor date must use a year of 0001 or later'),
      ).not.toBeInTheDocument();
    });
  });

  it('accepts an anchor year in the previously-rejected 0100-0999 range', async () => {
    renderWithAnchor('2020-01-01');
    const anchor = screen.getByLabelText(/Specific Anchor Date/);

    fireEvent.change(anchor, { target: { value: '0999-12-31' } });
    fireEvent.blur(anchor);

    await waitFor(() => {
      expect(
        screen.queryByText(/Anchor date must use a year/),
      ).not.toBeInTheDocument();
    });
  });
});
