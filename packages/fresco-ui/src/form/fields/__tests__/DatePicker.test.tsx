import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Field from '../../Field/Field';
import UnconnectedField from '../../Field/UnconnectedField';
import Form from '../../Form';
import FormStoreProvider from '../../store/formStoreProvider';
import SubmitButton from '../../SubmitButton';
import DatePickerField from '../DatePicker';

function optionValues(select: HTMLElement): string[] {
  return Array.from(select.querySelectorAll('option'))
    .map((option) => option.value)
    .filter((value) => value !== '');
}

// Mirrors the component's default-window span (today's year minus 1920) so
// out-of-window extension assertions track the real default instead of a
// hardcoded year count that drifts every January.
function defaultWindowSpanYears(): number {
  return new Date().getFullYear() - 1920;
}

describe('DatePickerField month mode', () => {
  it('clears its controlled month and year selections when the value clears', async () => {
    const { rerender } = render(
      <DatePickerField type="month" name="date" value="2020-05" />,
    );
    let [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    expect(yearSelect).toHaveValue('2020');
    expect(monthSelect).toHaveValue('05');

    rerender(<DatePickerField type="month" name="date" value="" />);

    await waitFor(() => {
      [yearSelect, monthSelect] = screen.getAllByRole('combobox');
      expect(yearSelect).toHaveValue('');
      expect(monthSelect).toHaveValue('');
    });
  });

  it('clears a selected month that is invalid in a newly selected boundary year', () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        type="month"
        name="date"
        value="2010-10"
        min="2010-01"
        max="2020-05"
        onChange={onChange}
      />,
    );
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) throw new Error('selects not rendered');

    fireEvent.change(yearSelect, { target: { value: '2020' } });

    expect(monthSelect).toHaveValue('');
    expect(optionValues(monthSelect)).toEqual(['01', '02', '03', '04', '05']);
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    fireEvent.change(monthSelect, { target: { value: '05' } });
    expect(onChange).toHaveBeenLastCalledWith('2020-05');
  });

  it('preserves a partial boundary year while a controlled parent clears the stale value', async () => {
    const ControlledMonthPicker = () => {
      const [controlledValue, setControlledValue] = useState<
        string | undefined
      >('2010-10');

      return (
        <>
          <output data-testid="controlled-value">
            {controlledValue ?? 'empty'}
          </output>
          <DatePickerField
            type="month"
            name="date"
            value={controlledValue}
            min="2010-01"
            max="2020-05"
            onChange={(nextValue) =>
              setControlledValue(
                typeof nextValue === 'string' ? nextValue : undefined,
              )
            }
          />
        </>
      );
    };

    render(<ControlledMonthPicker />);
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) throw new Error('selects not rendered');

    fireEvent.change(yearSelect, { target: { value: '2020' } });

    expect(screen.getByTestId('controlled-value')).toHaveTextContent('empty');
    await waitFor(() => {
      expect(yearSelect).toHaveValue('2020');
      expect(monthSelect).toHaveValue('');
    });

    fireEvent.change(monthSelect, { target: { value: '05' } });

    expect(screen.getByTestId('controlled-value')).toHaveTextContent('2020-05');
    expect(yearSelect).toHaveValue('2020');
    expect(monthSelect).toHaveValue('05');
  });

  it('emits undefined whenever either month control becomes incomplete', () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        type="month"
        name="date"
        value="2020-05"
        onChange={onChange}
      />,
    );
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) throw new Error('selects not rendered');

    fireEvent.change(monthSelect, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    fireEvent.change(yearSelect, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('emits a complete value without requiring a name prop', () => {
    const onChange = vi.fn();
    render(<DatePickerField type="month" onChange={onChange} />);
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) throw new Error('selects not rendered');

    fireEvent.change(yearSelect, { target: { value: '2020' } });
    fireEvent.change(monthSelect, { target: { value: '05' } });

    expect(onChange).toHaveBeenLastCalledWith('2020-05');
  });

  it('derives year range from YYYY-MM-DD min/max without timezone drift', () => {
    render(
      <DatePickerField
        type="month"
        name="date"
        min="2000-01-01"
        max="2020-12-31"
      />,
    );
    const [yearSelect] = screen.getAllByRole('combobox');
    if (!yearSelect) throw new Error('year select not rendered');

    const years = optionValues(yearSelect);
    expect(years[0]).toBe('2020');
    expect(years[years.length - 1]).toBe('2000');
    expect(years).not.toContain('1999');
    expect(years).not.toContain('2021');
  });

  it('omits months before min.month when min year is selected', () => {
    render(
      <DatePickerField
        type="month"
        name="date"
        min="2000-03-15"
        max="2020-12-31"
      />,
    );
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) {
      throw new Error('selects not rendered');
    }

    fireEvent.change(yearSelect, { target: { value: '2000' } });

    expect(optionValues(monthSelect)).toEqual([
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ]);
  });

  it('omits months after max.month when max year is selected', () => {
    render(
      <DatePickerField
        type="month"
        name="date"
        min="2000-01-01"
        max="2020-05-15"
      />,
    );
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) {
      throw new Error('selects not rendered');
    }

    fireEvent.change(yearSelect, { target: { value: '2020' } });

    expect(optionValues(monthSelect)).toEqual(['01', '02', '03', '04', '05']);
  });

  it('shows all twelve months for a year strictly between min and max', () => {
    render(
      <DatePickerField
        type="month"
        name="date"
        min="2000-03-01"
        max="2020-05-31"
      />,
    );
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) {
      throw new Error('selects not rendered');
    }

    fireEvent.change(yearSelect, { target: { value: '2010' } });

    expect(optionValues(monthSelect)).toHaveLength(12);
  });
});

describe('DatePickerField accessibility and native events', () => {
  it.each(['full', 'year'] as const)(
    'emits undefined instead of a stringified empty value when %s mode clears',
    (type) => {
      const onChange = vi.fn();
      const { container } = render(
        <DatePickerField
          type={type}
          name="date"
          value={type === 'full' ? '2020-05-01' : '2020'}
          onChange={onChange}
        />,
      );

      const control =
        type === 'full'
          ? container.querySelector('input[type="date"]')
          : screen.getByRole('combobox');
      if (!control) throw new Error('date control not rendered');
      fireEvent.change(control, { target: { value: '' } });

      expect(onChange).toHaveBeenLastCalledWith(undefined);
      expect(onChange).not.toHaveBeenCalledWith('undefined');
    },
  );

  it.each(['full', 'year'] as const)(
    'associates the visible label and error description in %s mode',
    (type) => {
      render(
        <UnconnectedField
          name="date"
          label="Date of birth"
          hint="Choose carefully"
          component={DatePickerField}
          type={type}
          value=""
          onChange={() => undefined}
        />,
      );

      const control =
        type === 'full'
          ? screen.getByLabelText('Date of birth')
          : screen.getByRole('combobox', { name: 'Date of birth' });
      expect(control).toHaveAccessibleDescription('Choose carefully');
    },
  );

  it('names both operative controls in month mode and forwards focus/blur', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(
      <UnconnectedField
        name="date"
        label="Date of birth"
        component={DatePickerField}
        type="month"
        value="2020-05"
        onChange={() => undefined}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );

    const year = screen.getByRole('combobox', {
      name: 'Date of birth Year',
    });
    const month = screen.getByRole('combobox', {
      name: 'Date of birth Month',
    });

    fireEvent.focus(year);
    fireEvent.blur(year);
    fireEvent.focus(month);
    fireEvent.blur(month);

    expect(onFocus).toHaveBeenCalledTimes(2);
    expect(onBlur).toHaveBeenCalledTimes(2);
  });
});

describe('DatePickerField month mode — partial YYYY-MM bounds', () => {
  it('derives the year range from YYYY-MM min/max', () => {
    render(
      <DatePickerField type="month" name="date" min="2010-01" max="2020-12" />,
    );
    const [yearSelect] = screen.getAllByRole('combobox');
    if (!yearSelect) throw new Error('year select not rendered');

    const years = optionValues(yearSelect);
    expect(years[0]).toBe('2020');
    expect(years[years.length - 1]).toBe('2010');
    expect(years).not.toContain('2009');
    expect(years).not.toContain('2021');
  });

  it('bounds the available months by the partial min/max month', () => {
    render(
      <DatePickerField type="month" name="date" min="2010-03" max="2020-05" />,
    );
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) throw new Error('selects not rendered');

    fireEvent.change(yearSelect, { target: { value: '2010' } });
    expect(optionValues(monthSelect)).toEqual([
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ]);

    fireEvent.change(yearSelect, { target: { value: '2020' } });
    expect(optionValues(monthSelect)).toEqual(['01', '02', '03', '04', '05']);
  });
});

describe('DatePickerField year mode — partial YYYY bounds', () => {
  it('derives the year range from YYYY min/max', () => {
    render(<DatePickerField type="year" name="date" min="2010" max="2020" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    expect(years[0]).toBe('2020');
    expect(years[years.length - 1]).toBe('2010');
    expect(years).not.toContain('2009');
    expect(years).not.toContain('2021');
  });
});

describe('DatePickerField — authored bound outside the default window (Twenty-third-wave Findings 4, 5, and 8)', () => {
  it('offers a full-width year range ending at an authored max below the default minimum', () => {
    render(<DatePickerField type="year" name="date" max="1800" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    const span = defaultWindowSpanYears();
    expect(years[0]).toBe('1800');
    expect(years[years.length - 1]).toBe((1800 - span).toString());
    expect(years).toHaveLength(span + 1);
    // 1800 must remain selectable as the maximum, not the sole option.
    expect(years).toContain('1800');
  });

  it('offers a full-width year range starting at an authored min above today', () => {
    render(<DatePickerField type="year" name="date" min="3000" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    const span = defaultWindowSpanYears();
    expect(years[0]).toBe((3000 + span).toString());
    expect(years[years.length - 1]).toBe('3000');
    expect(years).toHaveLength(span + 1);
    expect(years).toContain('3000');
  });

  // Guards against an over-eager fix that extends the default toward an
  // authored bound unconditionally, instead of only when the default would
  // otherwise leave the range empty.
  it('does not extend the lower bound when an authored max alone is already above the default minimum', () => {
    render(<DatePickerField type="year" name="date" max="2000" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    expect(years[0]).toBe('2000');
    expect(years[years.length - 1]).toBe('1920');
  });

  it('does not extend the upper bound when an authored min alone is already before today', () => {
    render(<DatePickerField type="year" name="date" min="2000" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    expect(years[0]).toBe(new Date().getFullYear().toString());
    expect(years[years.length - 1]).toBe('2000');
  });

  it('offers a full-width month range ending at an authored max below the default minimum', () => {
    render(<DatePickerField type="month" name="date" max="1800-06" />);
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) throw new Error('selects not rendered');
    const years = optionValues(yearSelect);
    const span = defaultWindowSpanYears();
    const extendedMinYear = (1800 - span).toString();
    expect(years[0]).toBe('1800');
    expect(years[years.length - 1]).toBe(extendedMinYear);

    // The authored boundary year stays constrained to its authored month.
    fireEvent.change(yearSelect, { target: { value: '1800' } });
    expect(optionValues(monthSelect)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
    ]);

    // The extended far boundary year opens the full twelve months, mirroring
    // how the default minimum (1920) always starts at January.
    fireEvent.change(yearSelect, { target: { value: extendedMinYear } });
    expect(optionValues(monthSelect)).toHaveLength(12);
  });

  it('offers a full-width month range starting at an authored min above today', () => {
    render(<DatePickerField type="month" name="date" min="3000-03" />);
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) throw new Error('selects not rendered');
    const years = optionValues(yearSelect);
    const span = defaultWindowSpanYears();
    const extendedMaxYear = (3000 + span).toString();
    expect(years[0]).toBe(extendedMaxYear);
    expect(years[years.length - 1]).toBe('3000');

    // The authored boundary year stays constrained to its authored month.
    fireEvent.change(yearSelect, { target: { value: '3000' } });
    expect(optionValues(monthSelect)).toEqual([
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ]);

    // The extended far boundary year opens the full twelve months.
    fireEvent.change(yearSelect, { target: { value: extendedMaxYear } });
    expect(optionValues(monthSelect)).toHaveLength(12);
  });

  it('spans exactly 1920 to today when no bounds are authored (regression guard)', () => {
    render(<DatePickerField type="year" name="date" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    const currentYear = new Date().getFullYear();
    expect(years[0]).toBe(currentYear.toString());
    expect(years[years.length - 1]).toBe('1920');
    expect(years).toHaveLength(currentYear - 1920 + 1);
  });

  it('extends the full-resolution input min to a full-width range below an out-of-window authored max', () => {
    const { container } = render(
      <DatePickerField type="full" name="date" max="1800-01-01" />,
    );
    const input = container.querySelector('input[type="date"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }
    const span = defaultWindowSpanYears();
    expect(input).toHaveAttribute('min', `${1800 - span}-01-01`);
    expect(input).toHaveAttribute('max', '1800-01-01');
  });

  it('extends the full-resolution input max to a full-width range above an out-of-window authored min', () => {
    const { container } = render(
      <DatePickerField type="full" name="date" min="3000-01-01" />,
    );
    const input = container.querySelector('input[type="date"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }
    const span = defaultWindowSpanYears();
    expect(input).toHaveAttribute('min', '3000-01-01');
    expect(input).toHaveAttribute('max', `${3000 + span}-12-31`);
  });

  it('leaves the full-resolution input min/max unset when no bounds are authored (regression guard)', () => {
    const { container } = render(<DatePickerField type="full" name="date" />);
    const input = container.querySelector('input[type="date"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }
    // A fully unbounded full-resolution picker must stay genuinely
    // unbounded — falling back to the 1920-to-today default window (as the
    // custom year/month picker's dropdown list does, since it needs a
    // finite range to enumerate) would silently block previously-enterable
    // dates like a pre-1920 birthdate or any future date.
    expect(input).not.toHaveAttribute('min');
    expect(input).not.toHaveAttribute('max');
  });

  it('honours both bounds exactly, unchanged, when both are authored outside the default window', () => {
    render(<DatePickerField type="year" name="date" min="1800" max="1805" />);
    const yearSelect = screen.getByRole('combobox');
    expect(optionValues(yearSelect)).toEqual([
      '1805',
      '1804',
      '1803',
      '1802',
      '1801',
      '1800',
    ]);
  });
});

describe('DatePickerField within Field — min/max validation', () => {
  async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
  }

  function renderField() {
    const { container } = render(
      <FormStoreProvider>
        <Field
          name="dob"
          label="Date of birth"
          component={DatePickerField}
          type="full"
          min="2000-01-01"
          max="2020-12-31"
        />
      </FormStoreProvider>,
    );
    const input = container.querySelector('input[name="dob"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }
    return input;
  }

  it('shows an error on blur when the typed full-date value is before min', async () => {
    const input = renderField();
    fireEvent.change(input, { target: { value: '1999-12-31' } });
    fireEvent.blur(input);

    await flushMicrotasks();

    const error = await screen.findByTestId('dob-field-error');
    expect(error).toHaveTextContent('Must be on or after January 1, 2000.');
  });

  it('shows an error on blur when the typed full-date value is after max', async () => {
    const input = renderField();
    fireEvent.change(input, { target: { value: '2021-01-01' } });
    fireEvent.blur(input);

    await flushMicrotasks();

    const error = await screen.findByTestId('dob-field-error');
    expect(error).toHaveTextContent('Must be on or before December 31, 2020.');
  });

  it('does not show an error for an in-range value', async () => {
    const input = renderField();
    fireEvent.change(input, { target: { value: '2010-06-15' } });
    fireEvent.blur(input);

    await flushMicrotasks();

    expect(screen.queryByTestId('dob-field-error')).not.toBeInTheDocument();
  });

  it('still forwards min/max to the native date input so the picker UI is constrained', () => {
    const input = renderField();
    expect(input).toHaveAttribute('min', '2000-01-01');
    expect(input).toHaveAttribute('max', '2020-12-31');
  });
});

describe('DatePickerField year mode', () => {
  it('derives year range from YYYY-MM-DD min/max without timezone drift', () => {
    render(
      <DatePickerField
        type="year"
        name="date"
        min="2000-01-01"
        max="2020-12-31"
      />,
    );
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    expect(years[0]).toBe('2020');
    expect(years[years.length - 1]).toBe('2000');
    expect(years).not.toContain('1999');
    expect(years).not.toContain('2021');
  });
});

describe('DatePickerField within Form — submit path', () => {
  it('shows validation error on submit for an out-of-range typed value (mirrors useProtocolForm story)', async () => {
    const onSubmit = vi.fn(() => Promise.resolve({ success: true as const }));
    const { container } = render(
      <Form onSubmit={onSubmit}>
        <Field
          name="birthDate"
          label="Birth Date"
          component={DatePickerField}
          type="full"
          min="1920-01-01"
          max="2010-12-31"
        />
        <SubmitButton>Submit</SubmitButton>
      </Form>,
    );

    const input = container.querySelector('input[name="birthDate"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }

    fireEvent.change(input, { target: { value: '2020-01-01' } });

    const submit = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByTestId('birthDate-field-error')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
