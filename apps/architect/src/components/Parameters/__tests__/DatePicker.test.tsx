import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import DatePicker from '../DatePicker';

const renderParameters = (min: string) => {
  render(
    <Form onSubmit={() => ({ success: true })}>
      <DatePicker name="parameters" initialParameters={{ type: 'full', min }} />
    </Form>,
  );

  return screen.getByLabelText(/End range/);
};

const RANGE_ERROR = 'End date must not be before start date';
// Absence assertions match ANY range complaint, so they still fail against the
// stricter message this replaced rather than silently passing on its wording.
const ANY_RANGE_ERROR = /start date/;

// Audit sweep: the protocol schema only rejects `min > max`, so a collapsed
// single-day window (`min === max`) is legal — and it is exactly the shape the
// contradiction analyser reasons about when it pins such a variable to one
// value. Gating the editor with a strict `greaterThan` refused to author the
// very configuration the analyser understands.
describe('DatePicker range parameters', () => {
  it('accepts an end range equal to the start range', async () => {
    const max = renderParameters('2024-06-15');

    fireEvent.change(max, { target: { value: '2024-06-15' } });
    fireEvent.blur(max);

    await waitFor(() => {
      expect(screen.queryByText(ANY_RANGE_ERROR)).not.toBeInTheDocument();
    });
  });

  it('still rejects an end range before the start range', async () => {
    const max = renderParameters('2024-06-15');

    fireEvent.change(max, { target: { value: '2024-06-14' } });
    fireEvent.blur(max);

    await waitFor(() => {
      expect(screen.getByText(RANGE_ERROR)).toBeInTheDocument();
    });
  });

  it('clears the error once the end range reaches the start range', async () => {
    const max = renderParameters('2024-06-15');

    fireEvent.change(max, { target: { value: '2024-06-14' } });
    fireEvent.blur(max);
    await waitFor(() => {
      expect(screen.getByText(RANGE_ERROR)).toBeInTheDocument();
    });

    fireEvent.change(max, { target: { value: '2024-06-15' } });
    await waitFor(() => {
      expect(screen.queryByText(ANY_RANGE_ERROR)).not.toBeInTheDocument();
    });
  });
});

// The resolution field used to clear the range through the field's `onChange`,
// which the form store now owns. The replacement observer must not fire on the
// first render, or opening the editor would wipe a committed range.
describe('DatePicker resolution changes', () => {
  it('keeps the committed range on mount', () => {
    const max = renderParameters('2024-06-15');

    expect(screen.getByLabelText(/Start range/)).toHaveValue('2024-06-15');
    expect(max).toBeInTheDocument();
  });

  it('clears both range dates when the resolution changes', async () => {
    renderParameters('2024-06-15');

    fireEvent.change(screen.getByLabelText(/Date resolution/), {
      target: { value: 'year' },
    });

    // The control is re-rendered for the new resolution, so the input has to be
    // looked up again rather than held across the change.
    await waitFor(() => {
      expect(screen.getByLabelText(/Start range/)).toHaveValue('');
    });
  });
});
