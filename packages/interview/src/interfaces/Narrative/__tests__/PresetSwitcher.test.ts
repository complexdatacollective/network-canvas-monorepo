import { describe, expect, it } from 'vitest';

import type {
  LocalizedString,
  VariableOption,
} from '@codaco/protocol-validation';

import { buildGroupLegend } from '../PresetSwitcher';

const OPTIONS: VariableOption[] = [
  { value: 'A', label: { en: 'Option A' } },
  { value: 'B', label: { en: 'Option B' } },
  { value: 'C', label: { en: 'Option C' } },
];

const toEnglish = (label: LocalizedString) => label.en ?? '';
const english = new Intl.Collator('en');

describe('buildGroupLegend', () => {
  it('lists known codebook options with their stable 1-based color index', () => {
    const legend = buildGroupLegend(OPTIONS, [], toEnglish, english);

    expect(legend).toEqual([
      { label: 'Option A', colorIndex: 1 },
      { label: 'Option B', colorIndex: 2 },
      { label: 'Option C', colorIndex: 3 },
    ]);
  });

  it('appends out-of-codebook values after the known options with distinct colors', () => {
    // 'Z' is a value present on a node but not in the option set.
    const legend = buildGroupLegend(OPTIONS, ['Z'], toEnglish, english);

    // Known options keep indices 1..3, 'Z' gets a distinct index (4) so its
    // hull is not uncoloured/unlabelled and does not collide with 'A'.
    expect(legend).toEqual([
      { label: 'Option A', colorIndex: 1 },
      { label: 'Option B', colorIndex: 2 },
      { label: 'Option C', colorIndex: 3 },
      { label: 'Z', colorIndex: 4 },
    ]);
  });

  it('assigns deterministic, distinct indices to multiple out-of-codebook values', () => {
    const legend = buildGroupLegend(
      OPTIONS,
      ['zeta', 'alpha'],
      toEnglish,
      english,
    );

    const extras = legend.filter((entry) => entry.colorIndex > OPTIONS.length);
    expect(extras).toEqual([
      { label: 'alpha', colorIndex: 4 },
      { label: 'zeta', colorIndex: 5 },
    ]);
  });

  it('does not duplicate a value that is already a known option', () => {
    const legend = buildGroupLegend(OPTIONS, ['A', 'Z'], toEnglish, english);

    expect(legend).toEqual([
      { label: 'Option A', colorIndex: 1 },
      { label: 'Option B', colorIndex: 2 },
      { label: 'Option C', colorIndex: 3 },
      { label: 'Z', colorIndex: 4 },
    ]);
  });

  it('coerces non-string out-of-codebook values to a label', () => {
    const legend = buildGroupLegend(OPTIONS, [99], toEnglish, english);

    expect(legend).toContainEqual({ label: '99', colorIndex: 4 });
  });

  it("lists out-of-codebook values in the reader's alphabetical order without changing their colours", () => {
    const values = ['z', 'ö', 'a'];

    const swedish = buildGroupLegend(
      OPTIONS,
      values,
      toEnglish,
      new Intl.Collator('sv'),
    ).slice(OPTIONS.length);
    const german = buildGroupLegend(
      OPTIONS,
      values,
      toEnglish,
      new Intl.Collator('de'),
    ).slice(OPTIONS.length);

    expect(swedish.map((entry) => entry.label)).toEqual(['a', 'z', 'ö']);
    expect(german.map((entry) => entry.label)).toEqual(['a', 'ö', 'z']);
    // The colour belongs to the value, not to the language the legend is in.
    const colourOf = (legend: typeof swedish, label: string) =>
      legend.find((entry) => entry.label === label)?.colorIndex;
    for (const value of values) {
      expect(colourOf(swedish, value)).toBe(colourOf(german, value));
    }
  });
});
