import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppLocale } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

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

  // The floor is stated here rather than read from DATE_PICKER_DEFAULT_MIN:
  // @codaco/protocol-utilities generates dates against that constant without
  // being able to see this component, so moving it has to be a deliberate edit
  // in both places rather than a silent shift on one side.
  it('offers no year before 1920 when no min is given', () => {
    render(<DatePickerField type="month" name="date" max="2020-12-31" />);
    const [yearSelect] = screen.getAllByRole('combobox');
    if (!yearSelect) throw new Error('year select not rendered');

    const years = optionValues(yearSelect);
    expect(years[years.length - 1]).toBe('1920');
    expect(years).not.toContain('1919');
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

describe('DatePickerField — clamping the synthesized coarse year to the four-digit range (Twenty-sixth-wave)', () => {
  // The reviewer's report: an authored max right at the four-digit floor
  // synthesizes a lower bound (1000 - span) that undershoots it, and the
  // unpadded `y.toString()` the year Select stores would offer a three-digit
  // "894" — a value the schema's exactly-YYYY coarse resolution can never
  // hold. Clamped, the synthesized side can go no lower than the authored
  // max itself, so this collapses to the single selectable year 1000 rather
  // than inverting past it.
  it('clamps the synthesized lower year to 1000 when only an authored max sits at the four-digit floor', () => {
    render(<DatePickerField type="year" name="date" max="1000" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    expect(years).toEqual(['1000']);
    for (const year of years) {
      expect(year).toHaveLength(4);
    }
  });

  // The mirror direction: an authored min at the four-digit ceiling
  // synthesizes an upper bound (min + span) that overshoots it into a
  // five-digit year. Clamped, the synthesized side can go no higher than the
  // authored min itself.
  it('clamps the synthesized upper year to 9999 when only an authored min sits at the four-digit ceiling', () => {
    render(<DatePickerField type="year" name="date" min="9999" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    expect(years).toEqual(['9999']);
    for (const year of years) {
      expect(year).toHaveLength(4);
    }
  });

  // Regression guard: a synthesized span that never crosses the four-digit
  // range (1800 - span stays comfortably above 1000) must resolve exactly as
  // it did before this clamp existed.
  it('leaves a mid-range synthesized span untouched when it never crosses the four-digit range', () => {
    render(<DatePickerField type="year" name="date" max="1800" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    const span = defaultWindowSpanYears();
    expect(years[0]).toBe('1800');
    expect(years[years.length - 1]).toBe((1800 - span).toString());
    expect(years).toHaveLength(span + 1);
  });

  // Month resolution synthesizes the same way and must clamp identically: the
  // year Select collapses to the single boundary year, and that year's month
  // list is still bounded by the AUTHORED max's own month (June), not by the
  // synthesized lower edge's January.
  it('clamps a month-resolution picker the same way for an out-of-window max at the four-digit floor', () => {
    render(<DatePickerField type="month" name="date" max="1000-06" />);
    const [yearSelect, monthSelect] = screen.getAllByRole('combobox');
    if (!yearSelect || !monthSelect) throw new Error('selects not rendered');

    expect(optionValues(yearSelect)).toEqual(['1000']);

    fireEvent.change(yearSelect, { target: { value: '1000' } });
    expect(optionValues(monthSelect)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
    ]);
  });

  // The full-resolution native input is NOT clamped by the coarse dropdowns'
  // 1000-9999 grammar concern: it stores (and its min/max attrs express)
  // zero-padded four-digit years via `formatYmd`, so a synthesized year like
  // 894 is still schema-valid there ("0894-01-01") even though it falls
  // outside the coarse dropdown's own representable range. It is separately
  // clamped to the wider 0001-9999 native/validator-legal range — see the
  // "clamping the synthesized native year" describe block below — but 894
  // never approaches that boundary, so this case is unaffected by either
  // clamp.
  it('leaves the full-resolution native input min/max unclamped by the coarse four-digit grammar', () => {
    const { container } = render(
      <DatePickerField type="full" name="date" max="1000-01-01" />,
    );
    const input = container.querySelector('input[type="date"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }
    const span = defaultWindowSpanYears();
    const extendedYear = (1000 - span).toString().padStart(4, '0');
    expect(input).toHaveAttribute('min', `${extendedYear}-01-01`);
    expect(input).toHaveAttribute('max', '1000-01-01');
  });
});

describe('DatePickerField — clamping the synthesized native year to the four-digit range (Twenty-eighth-wave)', () => {
  // The reviewer's demonstration: a full-resolution picker with only
  // `min: "9999-12-31"` authored synthesizes a native maximum around year
  // 10105 (min.year + the default window's span). The native input happily
  // accepts five-digit years, but `useProtocolForm`'s min/max validation
  // compares against the authored bound using four-digit LEXICAL comparison
  // (`compareDateStrings`), under which "10000" through "10105" all sort
  // *before* "9999-12-31" — so every value in that synthesized window is
  // reachable in the picker but fails validation, and "9999-12-31" itself is
  // the only value that can ever be submitted. Clamped, the synthesized
  // max can go no higher than the authored min itself, so the resolved
  // window collapses to that single genuinely-submittable day rather than
  // extending into the trap.
  it('clamps the synthesized max to 9999-12-31 when only an authored min sits at the four-digit ceiling', () => {
    const { container } = render(
      <DatePickerField type="full" name="date" min="9999-12-31" />,
    );
    const input = container.querySelector('input[type="date"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }
    expect(input).toHaveAttribute('min', '9999-12-31');
    expect(input).toHaveAttribute('max', '9999-12-31');
  });

  // Regression guard: an authored min in the future still synthesizes a max
  // (min.year + the default window's span), and a mid-range synthesized
  // span that never crosses the four-digit range (2200 + span stays
  // comfortably below 9999) must resolve exactly as it did before this
  // clamp existed.
  it('leaves a mid-range synthesized max untouched when it never crosses the four-digit range', () => {
    const { container } = render(
      <DatePickerField type="full" name="date" min="2200-01-01" />,
    );
    const input = container.querySelector('input[type="date"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }
    const span = defaultWindowSpanYears();
    expect(input).toHaveAttribute('min', '2200-01-01');
    expect(input).toHaveAttribute('max', `${2200 + span}-12-31`);
  });

  // The mirror direction: an authored max near the native floor (year 0001)
  // would synthesize a lower bound below year 1 (e.g. `max: "0002-01-01"`
  // synthesizes a min at 2 minus the default window's span — negative for
  // any plausible test-run date, since the span alone is already well over
  // a century), which `formatYmd` renders with a leading '-' — not a valid
  // HTML date string, so an unclamped native input would silently drop the
  // `min` attribute rather than constrain the picker. Clamped, the
  // synthesized min can go no lower than year 1, distinct from the
  // authored max (year 2) so this also demonstrates the clamp does not
  // simply mirror the opposite bound.
  it('clamps the synthesized min to 0001-01-01 when only an authored max sits near the native floor', () => {
    const { container } = render(
      <DatePickerField type="full" name="date" max="0002-01-01" />,
    );
    const input = container.querySelector('input[type="date"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }
    expect(input).toHaveAttribute('min', '0001-01-01');
    expect(input).toHaveAttribute('max', '0002-01-01');
  });

  // The coarse year/month dropdowns clamp independently to their own
  // 1000-9999 storage grammar and must be unaffected by the wider
  // 0001-9999 native clamp above: an authored `min: "9999"` still collapses
  // the coarse dropdown to the single year "9999", exactly as before this
  // change.
  it('leaves the coarse year dropdown clamped to its own 1000-9999 range, unaffected by the native clamp', () => {
    render(<DatePickerField type="year" name="date" min="9999" />);
    const yearSelect = screen.getByRole('combobox');
    const years = optionValues(yearSelect);
    expect(years).toEqual(['9999']);
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

// With no `max`, the year and month dropdowns are ceilinged at today. "Today"
// is read in UTC, matching every other date helper in the ecosystem — the
// relative picker's anchor, and the generator that produces the values this
// field displays. A local reading would sit a day either side of those for
// most of the world.
//
// Each case pins an instant where the UTC date and the local date fall in
// different months or years, so a local reading is visibly wrong. Which case
// catches it depends on the runner's offset: a runner ahead of UTC fails the
// UTC-July and UTC-2026 cases, one behind fails the UTC-August case. On a
// runner at UTC exactly the two readings coincide and nothing here can tell
// them apart.
describe('DatePickerField ceiling with no max', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function monthOptionsFor2026(): string[] {
    render(<DatePickerField type="month" name="date" value="2026-01" />);
    const [, monthSelect] = screen.getAllByRole('combobox');
    if (!monthSelect) throw new Error('month select not rendered');
    return optionValues(monthSelect);
  }

  it('stops at the UTC month when the local date has already rolled over', () => {
    vi.useFakeTimers();
    // UTC 31 July; 1 August anywhere from UTC+1 east.
    vi.setSystemTime('2026-07-31T23:00:00.000Z');

    expect(monthOptionsFor2026()).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
    ]);
  });

  it('reaches the UTC month when the local date has not yet rolled over', () => {
    vi.useFakeTimers();
    // UTC 1 August; still 31 July anywhere from UTC-1 west.
    vi.setSystemTime('2026-08-01T00:30:00.000Z');

    expect(monthOptionsFor2026()).toContain('08');
  });

  it('stops at the UTC year on the last night of December', () => {
    vi.useFakeTimers();
    // UTC 31 December 2026; already 2027 anywhere from UTC+1 east.
    vi.setSystemTime('2026-12-31T23:30:00.000Z');

    render(<DatePickerField type="month" name="date" value="2026-01" />);
    const [yearSelect] = screen.getAllByRole('combobox');
    if (!yearSelect) throw new Error('year select not rendered');

    expect(optionValues(yearSelect)[0]).toBe('2026');
  });

  // That ceiling belongs to the two dropdowns, which have to list the dates
  // they offer and so need an end to count from. Full resolution is a native
  // date input, which offers whatever its `max` attribute allows: with none
  // declared its range is open, and a date after today is one a participant can
  // select and submit. Synthetic data generation depends on the difference —
  // protocol-utilities' `resolveDateWindow` refuses a month or year field whose
  // floor sits above today as an empty range, and raises the ceiling of a
  // full-date one to meet that floor instead.
  it('leaves the native full-date input unbounded above', () => {
    const { container } = render(
      <DatePickerField type="full" name="date" value="2030-01-01" />,
    );
    const input = container.querySelector('input[name="date"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('date input not rendered');
    }

    expect(input).not.toHaveAttribute('max');
    expect(input).toHaveValue('2030-01-01');
  });
});

describe('DatePickerField month mode under a non-Gregorian locale', () => {
  // A locale whose default calendar is not the one the field stores. Its
  // registry is local to this test: the shipped ecosystem list is
  // English-only, and what is under test is the component, not the set of
  // languages the apps currently offer.
  const PERSIAN: AppLocale = {
    locale: 'fa-IR',
    label: 'فارسی',
    direction: 'rtl',
  };

  const JUNE_ANCHOR = new Date(Date.UTC(2000, 5, 1));

  const persianMonthName = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fa-IR', {
      month: 'long',
      timeZone: 'UTC',
      ...options,
    }).format(JUNE_ANCHOR);

  it('names each month by the calendar the option values belong to', () => {
    const gregorian = persianMonthName({ calendar: 'gregory' });
    // Fixture guard: fa-IR really does name this anchor differently under its
    // own default calendar, so the assertion below can tell the two apart.
    expect(persianMonthName({})).not.toBe(gregorian);

    render(
      <AppI18nProvider
        locale="fa-IR"
        locales={[PERSIAN]}
        manageDocument={false}
      >
        <DatePickerField type="month" name="date" value="2000-06" />
      </AppI18nProvider>,
    );

    const [, monthSelect] = screen.getAllByRole('combobox');
    const selected = Array.from(monthSelect!.querySelectorAll('option')).find(
      (option) => option.value === '06',
    );

    // The value is `06` of a Gregorian ISO date, and the year beside it is
    // the same Gregorian year. A label from another calendar would have the
    // person choose one month and store a different one.
    expect(selected?.textContent).toBe(gregorian);
  });

  it('writes the years in the reader’s digits while storing ASCII', () => {
    const persianDigits = new Intl.NumberFormat('fa-IR', {
      useGrouping: false,
    }).format(2000);
    // Fixture guard: fa-IR really does write this year differently, so the
    // label assertion can tell a localized one from a `toString()`.
    expect(persianDigits).not.toBe('2000');

    render(
      <AppI18nProvider
        locale="fa-IR"
        locales={[PERSIAN]}
        manageDocument={false}
      >
        <DatePickerField type="month" name="date" value="2000-06" />
      </AppI18nProvider>,
    );

    const [yearSelect] = screen.getAllByRole('combobox');
    const selected = Array.from(yearSelect!.querySelectorAll('option')).find(
      (option) => option.value === '2000',
    );

    // The stored value stays the ASCII year the ISO date is built from…
    expect(selected).toBeDefined();
    // …while the label reads in the language everything around it is in.
    expect(selected?.textContent).toBe(persianDigits);
  });
});
