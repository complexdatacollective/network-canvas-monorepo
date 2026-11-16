import { describe, expect, test } from 'vitest';

import {
  computeLayoutMetrics,
  FAMILY_PEDIGREE_GAPS,
} from '../layoutDimensions';

describe('computeLayoutMetrics', () => {
  test('leaves a node-high gap between rows and 60% of a node between neighbours by default', () => {
    expect(computeLayoutMetrics({ nodeWidth: 50, nodeHeight: 80 })).toEqual({
      containerWidth: 50,
      containerHeight: 80,
      rowGap: 80,
      columnGap: 30,
      rowHeight: 160,
      siblingSpacing: 80,
      partnerSpacing: 80,
    });
  });

  test('rounds gaps to whole pixels', () => {
    const metrics = computeLayoutMetrics({ nodeWidth: 73, nodeHeight: 91 });
    expect(metrics.columnGap).toBe(44);
    expect(metrics.rowGap).toBe(91);
  });

  test('scales the gaps by the ratios Family Pedigree passes', () => {
    expect(
      computeLayoutMetrics({
        nodeWidth: 100,
        nodeHeight: 50,
        ...FAMILY_PEDIGREE_GAPS,
      }),
    ).toEqual({
      containerWidth: 100,
      containerHeight: 50,
      rowGap: 70,
      columnGap: 140,
      rowHeight: 120,
      siblingSpacing: 240,
      partnerSpacing: 240,
    });
  });
});
