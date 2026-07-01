import { describe, expect, it } from 'vitest';

import {
  decideScaleLabelTier,
  type ScaleLabelMetric,
} from '../decideScaleLabelTier';

const metric = (
  fullWidth: number,
  longestWordWidth = fullWidth,
  wrappedWidth = Math.min(fullWidth, 120),
  wrappedHeight = 18,
): ScaleLabelMetric => ({
  fullWidth,
  longestWordWidth,
  wrappedWidth,
  wrappedHeight,
});

// availableWidth 300, 5 options → unit = 75, end cells = 37.5, interior = 75.
const five = (m: ScaleLabelMetric) => [m, m, m, m, m];

describe('decideScaleLabelTier', () => {
  it('returns full before measurement (zero width)', () => {
    expect(
      decideScaleLabelTier({
        availableWidth: 0,
        labels: five(metric(120)),
        maxLabelHeight: 140,
      }),
    ).toBe('full');
  });

  it('returns full for a single option regardless of width', () => {
    expect(
      decideScaleLabelTier({
        availableWidth: 10,
        labels: [metric(500)],
        maxLabelHeight: 140,
      }),
    ).toBe('full');
  });

  it('keeps full when every label fits on one line', () => {
    // Even the 37.5px end cells comfortably hold a 30px word.
    expect(
      decideScaleLabelTier({
        availableWidth: 300,
        labels: five(metric(30)),
        maxLabelHeight: 140,
      }),
    ).toBe('full');
  });

  it('keeps full when labels wrap cleanly within two lines', () => {
    // End label: longest word 35 ≤ 37.5 cell, fullWidth 60 → ceil(60/37.5)=2 lines.
    expect(
      decideScaleLabelTier({
        availableWidth: 300,
        labels: five(metric(60, 35)),
        maxLabelHeight: 140,
      }),
    ).toBe('full');
  });

  it('rotates single-line labels when a word overflows its cell but there is room', () => {
    // Width 400: end cell 50, longest word 50 → wraps, but 120px needs 3 lines →
    // not full. Wrapped block 110×18 → extent 90 ≤ 140. Track 286 → tick spacing
    // 71.5, perpendicular gap 50 ≥ 18 wrapped height → rotate.
    expect(
      decideScaleLabelTier({
        availableWidth: 400,
        labels: five(metric(120, 50, 110, 18)),
        maxLabelHeight: 140,
      }),
    ).toBe('rotated');
  });

  it('collapses to anchors when the rotated band exceeds the vertical budget', () => {
    // Wrapped block 120×120 → extent (120+120)*0.707 ≈ 170 > 140 → anchors.
    expect(
      decideScaleLabelTier({
        availableWidth: 500,
        labels: five(metric(300, 60, 120, 120)),
        maxLabelHeight: 140,
      }),
    ).toBe('anchors');
  });

  it('collapses to anchors when tall wrapped labels would overlap their neighbours', () => {
    // Extent (120+72)*0.707 ≈ 136 ≤ 140 budget, but track 140 → tick spacing 35,
    // perpendicular gap ≈ 25 < 72 wrapped height → labels collide → anchors.
    expect(
      decideScaleLabelTier({
        availableWidth: 300,
        labels: five(metric(300, 60, 120, 72)),
        maxLabelHeight: 140,
      }),
    ).toBe('anchors');
  });

  it('rotates those same tall labels once there is enough width to space them', () => {
    // Same labels at width 900: track 763 → tick spacing 191, perpendicular gap
    // 135 ≥ 72 wrapped height → rotate.
    expect(
      decideScaleLabelTier({
        availableWidth: 900,
        labels: five(metric(300, 200, 120, 72)),
        maxLabelHeight: 140,
      }),
    ).toBe('rotated');
  });

  it('keeps full for a binary scale that fits its two cells', () => {
    // 2 options, width 200 → 100px cells. 40px labels fit on one line.
    expect(
      decideScaleLabelTier({
        availableWidth: 200,
        labels: [metric(40), metric(40)],
        maxLabelHeight: 140,
      }),
    ).toBe('full');
  });
});
