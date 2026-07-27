import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
});
