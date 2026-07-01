import { describe, expect, it } from 'vitest';

import {
  decideScaleLabelTier,
  type ScaleLabelMetric,
} from '../decideScaleLabelTier';

const metric = (
  longestWordWidth: number,
  cellWidth: number,
  wrappedHeight = 18,
): ScaleLabelMetric => ({ longestWordWidth, cellWidth, wrappedHeight });

const five = (m: ScaleLabelMetric) => [m, m, m, m, m];

describe('decideScaleLabelTier', () => {
  it('returns full before measurement (no tick spacing)', () => {
    expect(
      decideScaleLabelTier({ labels: five(metric(80, 40)), tickSpacing: 0 }),
    ).toBe('full');
  });

  it('returns full before measurement (cells not measured)', () => {
    expect(
      decideScaleLabelTier({ labels: five(metric(80, 0)), tickSpacing: 90 }),
    ).toBe('full');
  });

  it('returns full for a single option', () => {
    expect(
      decideScaleLabelTier({ labels: [metric(200, 40)], tickSpacing: 90 }),
    ).toBe('full');
  });

  it('keeps full while every longest word fits its cell', () => {
    expect(
      decideScaleLabelTier({ labels: five(metric(40, 60)), tickSpacing: 90 }),
    ).toBe('full');
  });

  it('rotates when a word overflows its cell but the rotated box fits the spacing', () => {
    // Word 80 > cell 60 → not full. Rotated box (80+18)*0.707 ≈ 69 ≤ 90 → rotate.
    expect(
      decideScaleLabelTier({ labels: five(metric(80, 60)), tickSpacing: 90 }),
    ).toBe('rotated');
  });

  it('collapses to anchors when the rotated box is wider than the tick spacing', () => {
    // Rotated box (120+60)*0.707 ≈ 127 > 90 spacing → labels would collide → anchors.
    expect(
      decideScaleLabelTier({
        labels: five(metric(120, 60, 60)),
        tickSpacing: 90,
      }),
    ).toBe('anchors');
  });

  it('rotates those same labels once the ticks are far enough apart', () => {
    expect(
      decideScaleLabelTier({
        labels: five(metric(120, 60, 60)),
        tickSpacing: 150,
      }),
    ).toBe('rotated');
  });

  it('escalates when a single label overflows its (narrower) cell', () => {
    // Only the middle label's word (80) exceeds its cell (60); the rest fit.
    // Extent (80+18)*0.707 ≈ 69 ≤ 120 tick spacing → rotate.
    const labels = [
      metric(30, 60),
      metric(30, 60),
      metric(80, 60),
      metric(30, 60),
      metric(30, 60),
    ];
    expect(decideScaleLabelTier({ labels, tickSpacing: 120 })).toBe('rotated');
  });

  it('keeps full for a binary scale whose words fit', () => {
    expect(
      decideScaleLabelTier({
        labels: [metric(30, 100), metric(30, 100)],
        tickSpacing: 200,
      }),
    ).toBe('full');
  });
});
