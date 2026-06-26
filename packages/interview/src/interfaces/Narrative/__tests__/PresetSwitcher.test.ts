import { describe, expect, it } from 'vitest';

import type { VariableOption } from '@codaco/protocol-validation';

import { buildGroupLegend } from '../PresetSwitcher';

const OPTIONS: VariableOption[] = [
  { value: 'A', label: 'Option A' },
  { value: 'B', label: 'Option B' },
  { value: 'C', label: 'Option C' },
];

describe('buildGroupLegend', () => {
  it('lists known codebook options with their stable 1-based color index', () => {
    const legend = buildGroupLegend(OPTIONS, []);

    expect(legend).toEqual([
      { label: 'Option A', colorIndex: 1 },
      { label: 'Option B', colorIndex: 2 },
      { label: 'Option C', colorIndex: 3 },
    ]);
  });

  it('appends out-of-codebook values after the known options with distinct colors', () => {
    // 'Z' is a value present on a node but not in the option set.
    const legend = buildGroupLegend(OPTIONS, ['Z']);

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
    const legend = buildGroupLegend(OPTIONS, ['zeta', 'alpha']);

    const extras = legend.filter((entry) => entry.colorIndex > OPTIONS.length);
    expect(extras).toEqual([
      { label: 'alpha', colorIndex: 4 },
      { label: 'zeta', colorIndex: 5 },
    ]);
  });

  it('does not duplicate a value that is already a known option', () => {
    const legend = buildGroupLegend(OPTIONS, ['A', 'Z']);

    expect(legend).toEqual([
      { label: 'Option A', colorIndex: 1 },
      { label: 'Option B', colorIndex: 2 },
      { label: 'Option C', colorIndex: 3 },
      { label: 'Z', colorIndex: 4 },
    ]);
  });

  it('coerces non-string out-of-codebook values to a label', () => {
    const legend = buildGroupLegend(OPTIONS, [99]);

    expect(legend).toContainEqual({ label: '99', colorIndex: 4 });
  });
});
