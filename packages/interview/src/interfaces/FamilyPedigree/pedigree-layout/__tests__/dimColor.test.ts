import { describe, expect, it } from 'vitest';

import { dimColor } from '../dimColor';

describe('dimColor', () => {
  it('blends the colour toward an overridable --dim-blend target (default: --background)', () => {
    // The printable snapshot overrides --dim-blend to white so dimmed nodes and
    // edges recede into the paper; on screen the variable is unset and falls
    // back to var(--background). Keeping the target as --dim-blend rather than a
    // hard-wired var(--background) is what lets the export re-theme dimming — if
    // this reverts, the export can no longer fade dimming toward white.
    const result = dimColor('#e53e3e');
    expect(result.startsWith('color-mix(in oklab,')).toBe(true);
    expect(result).toContain('#e53e3e');
    expect(result).toContain('var(--dim-blend, var(--background))');
  });
});
