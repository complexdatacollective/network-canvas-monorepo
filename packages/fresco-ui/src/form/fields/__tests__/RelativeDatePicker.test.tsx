import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import UnconnectedField from '../../Field/UnconnectedField';
import RelativeDatePickerField from '../RelativeDatePicker';

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

    const input = container.querySelector('input[type="date"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }
    expect(input).toHaveAttribute('id', 'relative-date-id');
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
