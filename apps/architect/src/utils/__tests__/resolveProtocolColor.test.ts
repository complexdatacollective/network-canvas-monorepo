import { describe, expect, it } from 'vitest';

import { resolveProtocolColor } from '../resolveProtocolColor';

describe('resolveProtocolColor', () => {
  it('maps sequence names onto shared theme variables', () => {
    expect(resolveProtocolColor('node-color-seq-3')).toBe('var(--node-3)');
    expect(resolveProtocolColor('edge-color-seq-1')).toBe('var(--edge-1)');
    expect(resolveProtocolColor('ord-color-seq-8')).toBe('var(--ord-8)');
    expect(resolveProtocolColor('cat-color-seq-4')).toBe('var(--cat-4)');
  });

  it('derives dark sequence variants via relative color syntax', () => {
    expect(resolveProtocolColor('node-color-seq-3', { dark: true })).toBe(
      'oklch(from var(--node-3) calc(l - 0.05) c h)',
    );
  });
});
