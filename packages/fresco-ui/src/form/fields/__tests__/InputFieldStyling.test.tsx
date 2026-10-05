import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DatePickerField from '../DatePicker';
import InputField from '../InputField';
import RelativeDatePickerField from '../RelativeDatePicker';

const safariEmptyDateFillClass =
  '[&::-webkit-datetime-edit]:[-webkit-text-fill-color:color-mix(in_oklab,var(--input-contrast)_50%,transparent)]';

describe('InputField styling ownership', () => {
  it('keeps container and native-input classes on their respective elements', () => {
    render(
      <InputField
        aria-label="Styled input"
        className="w-screen"
        inputClassName="uppercase"
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Styled input' });
    const wrapper = input.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass('w-screen');
    expect(wrapper).not.toHaveClass('uppercase');
    expect(input).toHaveClass('uppercase');
    expect(input).not.toHaveClass('w-screen');
  });
});

describe('native date empty-state styling', () => {
  it.each([
    {
      field: 'InputField',
      renderField: () =>
        render(<InputField type="date" aria-label="Plain date" value="" />),
    },
    {
      field: 'DatePickerField',
      renderField: () =>
        render(
          <DatePickerField
            type="full"
            aria-label="Absolute date"
            name="absolute-date"
            value=""
          />,
        ),
    },
    {
      field: 'RelativeDatePickerField',
      renderField: () =>
        render(
          <RelativeDatePickerField
            aria-label="Relative date"
            name="relative-date"
            value=""
          />,
        ),
    },
  ])(
    'puts Safari empty-date paint control on $field input',
    ({ renderField }) => {
      const { container } = renderField();
      const input = container.querySelector('input[type="date"]');
      expect(input).toBeInstanceOf(HTMLInputElement);
      expect(input).toHaveClass(safariEmptyDateFillClass);
      expect(input?.parentElement).not.toHaveClass(safariEmptyDateFillClass);
    },
  );

  it('does not mute a filled date value', () => {
    render(
      <InputField type="date" aria-label="Filled date" value="2026-09-01" />,
    );

    expect(screen.getByLabelText('Filled date')).not.toHaveClass(
      safariEmptyDateFillClass,
    );
  });
});
