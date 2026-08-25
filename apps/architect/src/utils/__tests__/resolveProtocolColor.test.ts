import { describe, expect, it } from 'vitest';

import { resolveProtocolColor } from '../resolveProtocolColor';

describe('resolveProtocolColor', () => {
  it('maps sequence names onto shared theme variables', () => {
    expect(resolveProtocolColor('node-color-seq-3')).toBe(
      'var(--node-3, var(--input-contrast))',
    );
    expect(resolveProtocolColor('edge-color-seq-1')).toBe(
      'var(--edge-1, var(--input-contrast))',
    );
    expect(resolveProtocolColor('ord-color-seq-8')).toBe(
      'var(--ord-8, var(--input-contrast))',
    );
    expect(resolveProtocolColor('cat-color-seq-4')).toBe(
      'var(--cat-4, var(--input-contrast))',
    );
  });

  // The guard against an invisible chip is the DEFAULT, not an opt-in: a call
  // site that passes no options at all still gets a colour it can paint for a
  // sequence index past the end of the palette. An opt-in was forgotten at
  // five of six call sites, which is what this pins.
  it('falls back to a visible colour for out-of-range sequence indices without being asked', () => {
    for (const name of [
      'node-color-seq-11',
      'edge-color-seq-9',
      'ord-color-seq-12',
    ]) {
      expect(resolveProtocolColor(name)).toMatch(/^var\(--[a-z]+-\d+, .+\)$/);
    }
  });

  it('derives dark sequence variants via relative color syntax, fallback included', () => {
    expect(resolveProtocolColor('node-color-seq-3', { dark: true })).toBe(
      'oklch(from var(--node-3, var(--input-contrast)) calc(l - 0.05) c h)',
    );
  });

  it('lets a caller override the fallback colour', () => {
    expect(
      resolveProtocolColor('node-color-seq-11', { fallback: 'var(--panel)' }),
    ).toBe('var(--node-11, var(--panel))');
  });

  it('wraps named palette hues in the oklch color function', () => {
    expect(resolveProtocolColor('sea-green')).toBe('oklch(var(--sea-green))');
    expect(resolveProtocolColor('sea-green', { dark: true })).toBe(
      'oklch(var(--sea-green--dark))',
    );
  });
});
