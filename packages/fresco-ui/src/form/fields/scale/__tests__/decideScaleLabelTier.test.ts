import { describe, expect, it } from 'vitest';

import {
  decideScaleLabelTier,
  type ScaleLabelMetric,
} from '../decideScaleLabelTier';

const metric = (
  fullWidth: number,
  longestWordWidth = fullWidth,
): ScaleLabelMetric => ({
  fullWidth,
  longestWordWidth,
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
        labelLineHeight: 16,
      }),
    ).toBe('full');
  });

  it('returns full for a single option regardless of width', () => {
    expect(
      decideScaleLabelTier({
        availableWidth: 10,
        labels: [metric(500)],
        maxLabelHeight: 140,
        labelLineHeight: 16,
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
        labelLineHeight: 16,
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
        labelLineHeight: 16,
      }),
    ).toBe('full');
  });

  it('rotates when a word is wider than its cell and the band fits', () => {
    // Longest word 50 > 37.5 end cell → cannot wrap. maxFullWidth 120 →
    // band ≈ (120+16)*0.707 ≈ 96 ≤ 140 budget → rotate.
    expect(
      decideScaleLabelTier({
        availableWidth: 300,
        labels: five(metric(120, 50)),
        maxLabelHeight: 140,
        labelLineHeight: 16,
      }),
    ).toBe('rotated');
  });

  it('collapses to anchors when the rotated band exceeds the vertical budget', () => {
    // maxFullWidth 200 → band ≈ (200+16)*0.707 ≈ 153 > 140 budget → anchors.
    expect(
      decideScaleLabelTier({
        availableWidth: 300,
        labels: five(metric(200, 60)),
        maxLabelHeight: 140,
        labelLineHeight: 16,
      }),
    ).toBe('anchors');
  });

  it('rotates the same labels when the vertical budget is generous', () => {
    expect(
      decideScaleLabelTier({
        availableWidth: 300,
        labels: five(metric(200, 60)),
        maxLabelHeight: 200,
        labelLineHeight: 16,
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
        labelLineHeight: 16,
      }),
    ).toBe('full');
  });
});
