import { describe, expect, it } from 'vitest';

import { readingScrollTop } from '../PublicationsNetwork';

describe('bringing a focused publication to the reading line', () => {
  it('centres a card that fits on the screen', () => {
    // A 300px card 1000px down an 800px screen: its middle (1150) lands at
    // the middle of the screen (400).
    expect(readingScrollTop(0, 1000, 300, 800)).toBe(750);
  });

  it('keeps the start of a card taller than the screen in view', () => {
    // A 900px card on an 800px screen: centring would put its top 50px above
    // the screen, so its top is brought just below the screen's top instead.
    const top = readingScrollTop(0, 1000, 900, 800);
    expect(top).toBe(976);
    expect(1000 - top).toBeGreaterThan(0);
  });
});
