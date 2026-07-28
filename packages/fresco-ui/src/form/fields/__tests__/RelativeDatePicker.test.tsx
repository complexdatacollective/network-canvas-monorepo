import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import UnconnectedField from '../../Field/UnconnectedField';
import RelativeDatePickerField from '../RelativeDatePicker';

function dateInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="date"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('date input not rendered');
  }
  return input;
}

describe('RelativeDatePickerField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-27T00:00:00.000Z');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The default window is stated here rather than read from the shared
  // constants: @codaco/interview derives this field's validators and
  // @codaco/protocol-utilities generates dates to fit them, neither able to see
  // this component. Widening or narrowing the default has to be a deliberate
  // edit here as well as there, not a silent shift on one side.
  it('reaches 180 days before today and no day after it by default', () => {
    const { container } = render(<RelativeDatePickerField name="seen" />);
    const input = dateInput(container);

    expect(input.min).toBe('2026-01-28');
    expect(input.max).toBe('2026-07-27');
  });

  it('resolves an explicit anchor and span instead of the defaults', () => {
    const { container } = render(
      <RelativeDatePickerField
        name="seen"
        anchor="2024-02-29"
        before={30}
        after={5}
      />,
    );
    const input = dateInput(container);

    expect(input.min).toBe('2024-01-30');
    expect(input.max).toBe('2024-03-05');
  });

  // A window this input cannot represent is worse than one it clips: a
  // five-digit year is not read as a date at all, so the form's max validator
  // compares the two strings lexically instead — where a leading `1` sorts below
  // every four-digit year and the field rejects every date a participant can
  // reach in it. Both ends of the window are derived, and both overflow from an
  // anchor and span a protocol may legitimately declare.
  it.each([
    {
      end: 'last date it can offer',
      anchor: '9999-12-31',
      before: 0,
      after: 1,
      min: '9999-12-31',
      max: '9999-12-31',
    },
    {
      end: 'last date it can offer, from further back',
      anchor: '9998-12-31',
      before: 0,
      after: 400,
      min: '9998-12-31',
      max: '9999-12-31',
    },
    {
      end: 'first date it can offer',
      anchor: '0001-01-01',
      before: 180,
      after: 0,
      min: '0001-01-01',
      max: '0001-01-01',
    },
    {
      end: 'first date it can offer, from a span past year zero',
      anchor: '0001-01-01',
      before: 400,
      after: 30,
      min: '0001-01-01',
      max: '0001-01-31',
    },
  ])('stops a window at the $end', ({ anchor, before, after, min, max }) => {
    const { container } = render(
      <RelativeDatePickerField
        name="seen"
        anchor={anchor}
        before={before}
        after={after}
      />,
    );
    const input = dateInput(container);

    expect(input.min).toBe(min);
    expect(input.max).toBe(max);
  });
});

describe('RelativeDatePickerField accessibility', () => {
  it('renders the native date input with the given id', () => {
    const { container } = render(
      <RelativeDatePickerField
        name="date"
        id="relative-date-id"
        value=""
        onChange={() => undefined}
      />,
    );

    expect(dateInput(container)).toHaveAttribute('id', 'relative-date-id');
  });

  it('associates the visible label and error description', () => {
    render(
      <UnconnectedField
        name="date"
        label="Interview date"
        hint="Choose carefully"
        component={RelativeDatePickerField}
        value=""
        onChange={() => undefined}
      />,
    );

    const control = screen.getByLabelText('Interview date');
    expect(control).toHaveAccessibleDescription('Choose carefully');
  });
});
