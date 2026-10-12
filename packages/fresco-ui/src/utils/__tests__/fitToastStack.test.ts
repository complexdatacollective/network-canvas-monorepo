import { describe, expect, it } from 'vitest';

import { fitToastStack } from '../fitToastStack';

// Newest (frontmost) first, as Base UI orders them.
const toast = (
  id: string,
  height: number,
  extra: { limited?: boolean; transitionStatus?: 'starting' | 'ending' } = {},
) => ({ id, height, ...extra });

const space = { available: 500, gap: 10, indicator: 30 };

describe('fitToastStack', () => {
  it('hides nothing when the expanded stack fits', () => {
    // Tops: a 100, b 100+10+100 = 210, c 200+20+100 = 320.
    const fit = fitToastStack(
      [toast('a', 100), toast('b', 100), toast('c', 100)],
      space,
    );

    expect([...fit.overflowingIds]).toEqual([]);
    expect(fit.hiddenCount).toBe(0);
    expect(fit.extent).toBe(320);
  });

  it('hides the oldest toasts that would run past the top', () => {
    // Tops: a 200, b 410, c 620. Without the indicator b fits (410 <= 500);
    // c does not, so room is left for the indicator: 500 - 30 - 10 = 460.
    const fit = fitToastStack(
      [toast('a', 200), toast('b', 200), toast('c', 200)],
      space,
    );

    expect([...fit.overflowingIds]).toEqual(['c']);
    expect(fit.hiddenCount).toBe(1);
    expect(fit.extent).toBe(410);
  });

  it('leaves room for the indicator once anything is hidden', () => {
    // Tops: a 200, b 480, c 690. b fits the full 500 but not the 460 left
    // once the indicator is needed for c, so it is hidden as well.
    const fit = fitToastStack(
      [toast('a', 200), toast('b', 270), toast('c', 200)],
      space,
    );

    expect([...fit.overflowingIds]).toEqual(['b', 'c']);
    expect(fit.hiddenCount).toBe(2);
    expect(fit.extent).toBe(200);
  });

  it('always shows the frontmost toast, however tall', () => {
    const fit = fitToastStack([toast('a', 900), toast('b', 50)], space);

    expect([...fit.overflowingIds]).toEqual(['b']);
    expect(fit.extent).toBe(900);
  });

  it('counts toasts past the provider limit and leaves room to say so', () => {
    // b fits the full 500 (top 200+10+260 = 470) but not the 460 left for
    // the indicator, which is needed for the limited toast c.
    const fit = fitToastStack(
      [toast('a', 200), toast('b', 260), toast('c', 200, { limited: true })],
      space,
    );

    expect([...fit.overflowingIds]).toEqual(['b']);
    expect(fit.hiddenCount).toBe(2);
  });

  it('positions toasts the way Base UI does while one animates out', () => {
    // Base UI zeroes a closing toast's height but keeps it in the list until
    // its exit animation ends; it takes no gap, and is never counted hidden.
    const fit = fitToastStack(
      [
        toast('closing', 0, { transitionStatus: 'ending' }),
        toast('a', 200),
        toast('b', 200),
      ],
      space,
    );

    expect([...fit.overflowingIds]).toEqual([]);
    expect(fit.hiddenCount).toBe(0);
    expect(fit.extent).toBe(410);
  });

  it('treats a toast Base UI has not measured yet as having no height', () => {
    const fit = fitToastStack([{ id: 'a' }, { id: 'b' }], space);

    expect([...fit.overflowingIds]).toEqual([]);
    expect(fit.extent).toBe(10);
  });
});
