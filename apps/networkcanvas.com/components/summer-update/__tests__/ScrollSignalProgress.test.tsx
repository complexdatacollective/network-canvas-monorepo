import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScrollSignalProgress } from '../ScrollSignalProgress';

describe('ScrollSignalProgress', () => {
  // The bars fill from the edge the language starts at, and the head rides
  // their leading end. The stylesheet is not loaded here, so this holds each
  // part to asking for the right-to-left form.
  it('fills from the start edge', () => {
    const { container } = render(<ScrollSignalProgress />);
    const spans = [...container.querySelectorAll('span')];
    const head = spans.at(-1);
    const bars = spans.slice(0, -1);

    expect(bars).toHaveLength(4);
    for (const bar of bars) {
      expect(bar).toHaveClass('origin-left', 'rtl:origin-right');
    }
    expect(head).toHaveClass('-translate-x-1/2', 'rtl:translate-x-1/2');
    // Offset from the start edge, not from the left.
    expect(head?.style.left).toBe('');
  });
});
