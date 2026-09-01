import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import DatePicker from '../DatePicker';

const renderParameters = (min: string, max?: string) => {
  render(
    <Form onSubmit={() => ({ success: true })}>
      <DatePicker
        name="parameters"
        initialParameters={{ type: 'full', min, ...(max ? { max } : {}) }}
      />
    </Form>,
  );

  return screen.getByLabelText(/End range/);
};

const RANGE_ERROR = 'End date must not be before start date';
const CLEARED_NOTICE =
  /start and end range were cleared because they were set at the previous date resolution/i;
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

  // Issue #1383: clearing the range is right — a full-resolution date is not a
  // year — but it used to happen with nothing said about it, which reads as
  // the range having been lost. It is now stated up front and announced when
  // it happens.
  it('warns up front that changing the resolution clears the range', () => {
    renderParameters('2024-06-15');

    expect(
      screen.getByText(
        /Changing the resolution clears the start and end range/,
      ),
    ).toBeInTheDocument();
  });

  it('announces the cleared range in a live region', async () => {
    renderParameters('2024-06-15', '2024-08-15');

    fireEvent.change(screen.getByLabelText(/Date resolution/), {
      target: { value: 'year' },
    });

    const notice = await screen.findByText(CLEARED_NOTICE);
    // The region is mounted before the notice appears, which is what makes the
    // addition announceable at all.
    expect(notice.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('says nothing when there was no range to clear', async () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <DatePicker name="parameters" initialParameters={{ type: 'full' }} />
      </Form>,
    );

    fireEvent.change(screen.getByLabelText(/Date resolution/), {
      target: { value: 'year' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Date resolution/)).toHaveValue('year');
    });
    expect(screen.queryByText(CLEARED_NOTICE)).not.toBeInTheDocument();
  });

  it('withdraws the notice once a range is set again', async () => {
    renderParameters('2024-06-15', '2024-08-15');

    fireEvent.change(screen.getByLabelText(/Date resolution/), {
      target: { value: 'year' },
    });
    await screen.findByText(CLEARED_NOTICE);

    fireEvent.change(screen.getByLabelText(/Start range/), {
      target: { value: '1999' },
    });

    await waitFor(() => {
      expect(screen.queryByText(CLEARED_NOTICE)).not.toBeInTheDocument();
    });
  });
});

// Issue #1383 reported these as broken. They are not: a valid range
// round-trips exactly, and a reversed one is refused. Pinned here so the
// reported behaviour cannot appear later.
describe('DatePicker range round-trip', () => {
  it('renders a committed range verbatim', () => {
    renderParameters('1920-01-01', '2020-01-01');

    expect(screen.getByLabelText(/Start range/)).toHaveValue('1920-01-01');
    expect(screen.getByLabelText(/End range/)).toHaveValue('2020-01-01');
  });

  it('reports a reversed range rather than dropping it', async () => {
    const max = renderParameters('2020-01-01');

    fireEvent.change(max, { target: { value: '1920-01-01' } });
    fireEvent.blur(max);

    await waitFor(() => {
      expect(screen.getByText(RANGE_ERROR)).toBeInTheDocument();
    });
    // The value the researcher entered is still there to correct.
    expect(max).toHaveValue('1920-01-01');
  });
});
