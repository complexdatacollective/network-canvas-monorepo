// The values a field shows follow the content language its host names, while
// the interface language keeps the sentences. The interface here is Arabic
// (Eastern Arabic digits, right-to-left), which no content language below
// shares, so a value that ignores the content language cannot pass.
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';

import { ARABIC } from '../../__tests__/catalogFixtures';
import { ContentLocaleProvider } from '../ContentLocale';
import DatePickerField from '../fields/DatePicker';
import VisualAnalogScaleField from '../fields/VisualAnalogScale';

function InArabicInterface({
  contentLocale,
  children,
}: {
  contentLocale?: string;
  children: ReactNode;
}) {
  const content =
    contentLocale === undefined ? (
      children
    ) : (
      <ContentLocaleProvider locale={contentLocale}>
        {children}
      </ContentLocaleProvider>
    );
  return (
    <AppI18nProvider
      locale={ARABIC.locale}
      locales={[ARABIC]}
      manageDocument={false}
    >
      {content}
    </AppI18nProvider>
  );
}

const valueText = (container: HTMLElement) =>
  container.querySelector('[aria-valuetext]')?.getAttribute('aria-valuetext');

const monthNames = (locale: string) =>
  Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, {
      month: 'long',
      timeZone: 'UTC',
      calendar: 'gregory',
    }).format(new Date(Date.UTC(2000, month, 1))),
  );

const shownMonths = () =>
  Array.from(screen.getAllByRole('combobox')[1]!.querySelectorAll('option'))
    .filter((option) => option.value !== '')
    .map((option) => option.textContent);

describe('the visual analog scale’s value', () => {
  it('is written in the content language, not the interface language', () => {
    const german = new Intl.NumberFormat('de', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(1234);
    expect(german).toBe('1.234');

    const { container } = render(
      <InArabicInterface contentLocale="de">
        <VisualAnalogScaleField name="score" min={0} max={2000} value={1234} />
      </InArabicInterface>,
    );

    expect(valueText(container)).toBe(german);
  });

  it('writes a percentage in the content language', () => {
    const { container } = render(
      <InArabicInterface contentLocale="de">
        <VisualAnalogScaleField name="feeling" value={0.5} />
      </InArabicInterface>,
    );

    expect(valueText(container)).toBe(
      new Intl.NumberFormat('de', {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format(0.5),
    );
  });

  it('uses the interface language when the host names no content language', () => {
    const { container } = render(
      <InArabicInterface>
        <VisualAnalogScaleField name="score" min={0} max={2000} value={1234} />
      </InArabicInterface>,
    );

    expect(valueText(container)).toBe(
      new Intl.NumberFormat(ARABIC.locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(1234),
    );
  });
});

describe('the date picker’s months and years', () => {
  it('names months in the content language, not the interface language', () => {
    expect(monthNames('de')[0]).toBe('Januar');
    render(
      <InArabicInterface contentLocale="de">
        <DatePickerField type="month" name="date" value="2020-05" />
      </InArabicInterface>,
    );

    expect(shownMonths()).toEqual(monthNames('de'));
  });

  it('names months in the interface language when the host names no content language', () => {
    render(
      <InArabicInterface>
        <DatePickerField type="month" name="date" value="2020-05" />
      </InArabicInterface>,
    );

    expect(shownMonths()).toEqual(monthNames(ARABIC.locale));
  });

  it('writes years in the content language’s digits', () => {
    const arabicYear = new Intl.NumberFormat(ARABIC.locale, {
      useGrouping: false,
    }).format(2020);
    expect(arabicYear).not.toBe('2020');

    render(
      <InArabicInterface contentLocale="en">
        <DatePickerField type="month" name="date" value="2020-05" />
      </InArabicInterface>,
    );

    const years = Array.from(
      screen.getAllByRole('combobox')[0]!.querySelectorAll('option'),
    ).map((option) => option.textContent);
    expect(years).toContain('2020');
    expect(years).not.toContain(arabicYear);
  });
});
