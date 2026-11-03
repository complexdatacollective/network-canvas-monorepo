import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Node from './Node';

// Unit tests finish every Motion animation at once, so the ring shows where
// its animation ends: the pulse's far keyframe while it pulses, its resting
// width once it stops.
const PULSE_FAR = '0 0 0 0.7em var(--selected)';
const REST = '0 0 0 0.08em var(--selected)';

// The ring is the one child of the shape layer that is not the hold fill.
const ring = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(
    'span[aria-hidden] > span[aria-hidden]:not([data-node-holding])',
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Node linking ring', () => {
  it('pulses while its window is focused and rests while it is not', async () => {
    let focused = true;
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    const { container } = render(<Node label="Alex" linking />);

    await vi.waitFor(() =>
      expect(ring(container)?.style.boxShadow).toBe(PULSE_FAR),
    );

    await act(async () => {
      focused = false;
      window.dispatchEvent(new Event('blur'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await vi.waitFor(() => expect(ring(container)?.style.boxShadow).toBe(REST));

    await act(async () => {
      focused = true;
      window.dispatchEvent(new Event('focus'));
    });
    await vi.waitFor(() =>
      expect(ring(container)?.style.boxShadow).toBe(PULSE_FAR),
    );
  });
});
