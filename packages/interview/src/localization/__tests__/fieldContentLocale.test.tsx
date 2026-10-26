import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DatePickerField from '@codaco/fresco-ui/form/fields/DatePicker';
import VisualAnalogScaleField from '@codaco/fresco-ui/form/fields/VisualAnalogScale';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';

// A protocol read in German under an English interface: the interface falls
// back to English for want of a catalog, but the values a form field shows
// belong to the protocol's text.
function German({ children }: { children: React.ReactNode }) {
  return (
    <InterviewI18nProvider requestedLocale="en">
      <TestProtocolLocalization
        localization={{ defaultLocale: 'de', locales: ['de'] }}
      >
        {children}
      </TestProtocolLocalization>
    </InterviewI18nProvider>
  );
}

describe('form fields inside the interview follow the protocol language', () => {
  it('writes a scale’s value with the protocol language’s separators', () => {
    const { container } = render(
      <German>
        <VisualAnalogScaleField name="score" min={0} max={2000} value={1234} />
      </German>,
    );

    expect(
      container
        .querySelector('[aria-valuetext]')
        ?.getAttribute('aria-valuetext'),
    ).toBe('1.234');
  });

  it('names a date picker’s months in the protocol language', () => {
    const { container } = render(
      <German>
        <DatePickerField type="month" name="date" value="2020-05" />
      </German>,
    );

    const months = Array.from(container.querySelectorAll('select')[1]!.options)
      .map((option) => option.textContent)
      .filter((text) => text !== '' && text !== null);
    expect(months).toContain('Januar');
    expect(months).not.toContain('January');
  });
});
