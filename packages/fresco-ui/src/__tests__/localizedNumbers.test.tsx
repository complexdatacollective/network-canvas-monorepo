// The numbers that sit inside localized copy. A component whose words go
// through the formatter but whose digits do not reads as two languages at
// once: an Arabic filter panel listing "1,234", an Arabic scale announcing
// "50%". Every case below renders under a locale whose digits and grouping
// genuinely differ from the source's, so an unformatted number cannot pass.
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';

import OperatorFilter from '../DataTable/filters/OperatorFilter';
import RangeFilter from '../DataTable/filters/RangeFilter';
import { type OperatorFilterConfig } from '../DataTable/filters/types';
import SegmentedCodeField from '../form/fields/SegmentedCodeField';
import VisualAnalogScaleField from '../form/fields/VisualAnalogScale';
import { ARABIC, arabicNumber, sourceTemplate } from './catalogFixtures';

const SEGMENT_ID = 'frescoUi.segmentedCodeField.segment';

function Arabic({
  children,
  messages,
}: {
  children: ReactNode;
  messages?: Record<string, string>;
}) {
  return (
    <AppI18nProvider
      locale={ARABIC.locale}
      locales={[ARABIC]}
      messages={messages}
      manageDocument={false}
    >
      {children}
    </AppI18nProvider>
  );
}

const percent = (value: number) =>
  arabicNumber(value, { style: 'percent', maximumFractionDigits: 0 });

describe('the visual analog scale’s value', () => {
  it('announces a normalised position as a percentage in the reader’s digits', () => {
    // Fixture guard: the assertion below only discriminates while ar-EG and
    // the source language really do write this percentage differently.
    expect(percent(0.5)).not.toBe('50%');

    const { container } = render(
      <Arabic>
        <VisualAnalogScaleField name="feeling" value={0.5} />
      </Arabic>,
    );

    expect(
      container
        .querySelector('[aria-valuetext]')
        ?.getAttribute('aria-valuetext'),
    ).toBe(percent(0.5));
  });

  it('announces a custom range’s value in the reader’s digits and grouping', () => {
    const expected = arabicNumber(1234, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    // Fixture guard: `toFixed(0)` would produce exactly this string in the
    // source language, so the two have to differ for the test to mean
    // anything.
    expect(expected).not.toBe('1234');

    const { container } = render(
      <Arabic>
        <VisualAnalogScaleField name="score" min={0} max={2000} value={1234} />
      </Arabic>,
    );

    expect(
      container
        .querySelector('[aria-valuetext]')
        ?.getAttribute('aria-valuetext'),
    ).toBe(expected);
  });
});

describe('the range filter’s endpoints', () => {
  it('writes them in the reader’s digits when the host names no units', () => {
    expect(arabicNumber(2000)).not.toBe('2000');

    render(
      <Arabic>
        <RangeFilter
          value={undefined}
          onChange={() => undefined}
          config={{ type: 'range', min: 0, max: 2000 }}
        />
      </Arabic>,
    );

    expect(screen.getByText(arabicNumber(0))).toBeInTheDocument();
    expect(screen.getByText(arabicNumber(2000))).toBeInTheDocument();
  });

  it('leaves a host’s own formatter in sole charge of the string', () => {
    // The host is naming units the formatter knows nothing about, so its
    // string has to survive intact — including the digits it chose.
    render(
      <Arabic>
        <RangeFilter
          value={undefined}
          onChange={() => undefined}
          config={{
            type: 'range',
            min: 0,
            max: 2000,
            formatLabel: (value) => `${value.toString()} kg`,
          }}
        />
      </Arabic>,
    );

    expect(screen.getByText('2000 kg')).toBeInTheDocument();
  });
});

describe('the operator filter’s numbers', () => {
  const config: OperatorFilterConfig = {
    type: 'operator',
    operators: ['eq', 'gte'],
  };

  it('writes a saved condition’s value in the reader’s digits', () => {
    expect(arabicNumber(1234)).not.toBe('1234');

    render(
      <Arabic>
        <OperatorFilter
          value={{
            conditions: [
              {
                entityType: 'person',
                entityLabel: 'People',
                entityKind: 'nodes',
                operator: 'gte',
                value: 1234,
              },
            ],
          }}
          onChange={() => undefined}
          config={config}
          data={[]}
        />
      </Arabic>,
    );

    expect(
      screen.getByText(`People ≥ ${arabicNumber(1234)}`),
    ).toBeInTheDocument();
  });

  it('writes the sample digit in the value box in the reader’s digits', () => {
    expect(arabicNumber(0)).not.toBe('0');

    const { container } = render(
      <Arabic>
        <OperatorFilter
          value={undefined}
          onChange={() => undefined}
          config={config}
          data={[]}
        />
      </Arabic>,
    );

    expect(
      container
        .querySelector('input[name="filter-value"]')
        ?.getAttribute('placeholder'),
    ).toBe(arabicNumber(0));
  });
});

describe('the segmented code field’s box names', () => {
  it('numbers the boxes in the reader’s digits', () => {
    expect(arabicNumber(1)).not.toBe('1');

    const { container } = render(
      <Arabic messages={{ [SEGMENT_ID]: sourceTemplate(SEGMENT_ID) }}>
        <SegmentedCodeField name="code" segments={3} />
      </Arabic>,
    );

    const labels = Array.from(container.querySelectorAll('input')).map(
      (input) => input.getAttribute('aria-label'),
    );

    expect(labels).toEqual([
      `Digit ${arabicNumber(1)} of ${arabicNumber(3)}`,
      `Digit ${arabicNumber(2)} of ${arabicNumber(3)}`,
      `Digit ${arabicNumber(3)} of ${arabicNumber(3)}`,
    ]);
  });
});
