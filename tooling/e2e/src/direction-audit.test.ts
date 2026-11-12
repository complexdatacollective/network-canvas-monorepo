import { describe, expect, it } from 'vitest';

import {
  compareMirrored,
  layoutShowing,
  layoutsMatch,
  type LayoutSnapshot,
  type PlacedElement,
} from './direction-audit.ts';

// The DOM-reading halves of the audit run in a real browser, in the
// Storybook and Playwright suites that use them. The comparison is plain
// arithmetic, checked here on boxes written out by hand.

const snapshot = (
  direction: 'ltr' | 'rtl',
  elements: readonly PlacedElement[],
  directions: Readonly<Record<string, string>> = {},
  text = 'Back to study',
): LayoutSnapshot => ({ direction, elements, directions, text });

const box = (
  key: string,
  left: number,
  right: number,
  pointing?: -1 | 1,
): PlacedElement => ({
  key,
  label: `<div> ${key}`,
  left,
  right,
  ...(pointing === undefined ? {} : { pointing }),
});

describe('compareMirrored', () => {
  it('accepts a box that sits as far from the right as it sat from the left', () => {
    expect(
      compareMirrored(
        snapshot('ltr', [box('0', 16, 200)]),
        snapshot('rtl', [box('0', 200, 16)]),
      ),
    ).toEqual([]);
  });

  it('accepts a centred box, and differences within the tolerance', () => {
    expect(
      compareMirrored(
        snapshot('ltr', [box('0', 50, 50), box('1', 10, 30)]),
        snapshot('rtl', [box('0', 50, 50), box('1', 31, 9)]),
      ),
    ).toEqual([]);
  });

  it('reports a box that stays on the left', () => {
    expect(
      compareMirrored(
        snapshot('ltr', [box('0', 16, 200)]),
        snapshot('rtl', [box('0', 16, 200)]),
      ),
    ).toEqual([
      '<div> 0 is 16px from the left and 200px from the right in ltr, but 200px from the right and 16px from the left in rtl',
    ]);
  });

  it('reports a box whose margin stays on one side', () => {
    // A physical `ml-4` in a full-width row: 16px from the left both ways.
    expect(
      compareMirrored(
        snapshot('ltr', [box('0', 16, 0)]),
        snapshot('rtl', [box('0', 16, 0)]),
      ),
    ).toHaveLength(1);
  });

  it('reports an arrow that points the same way in both directions', () => {
    expect(
      compareMirrored(
        snapshot('ltr', [box('0', 0, 0, 1)]),
        snapshot('rtl', [box('0', 0, 0, 1)]),
      ),
    ).toEqual(['<div> 0 points right in both directions']);
  });

  it('accepts an arrow that turns round, by a flip or by drawing the other one', () => {
    expect(
      compareMirrored(
        snapshot('ltr', [box('0', 0, 0, -1)]),
        snapshot('rtl', [box('0', 0, 0, 1)]),
      ),
    ).toEqual([]);
  });

  it('leaves the inside of an element whose dir is fixed alone, but not the element', () => {
    const fixed = { '1': 'ltr' };
    expect(
      compareMirrored(
        snapshot('ltr', [box('1', 0, 100), box('1/0', 0, 50)], fixed),
        snapshot('rtl', [box('1', 100, 0), box('1/0', 0, 50)], fixed),
      ),
    ).toEqual([]);
    expect(
      compareMirrored(
        snapshot('ltr', [box('1', 0, 100)], fixed),
        snapshot('rtl', [box('1', 0, 100)], fixed),
      ),
    ).toHaveLength(1);
  });

  it('compares the inside of an element whose dir follows the page', () => {
    expect(
      compareMirrored(
        snapshot('ltr', [box('1/0', 0, 50)], { '1': 'ltr' }),
        snapshot('rtl', [box('1/0', 0, 50)], { '1': 'rtl' }),
      ),
    ).toHaveLength(1);
  });

  it('compares only elements present in both renders', () => {
    expect(
      compareMirrored(
        snapshot('ltr', [box('0', 16, 200), box('1', 0, 300)]),
        snapshot('rtl', [box('0', 200, 16)]),
      ),
    ).toEqual([]);
  });

  it('refuses two renders that show different content', () => {
    // A progress bar advanced by a timer between the two renders: its fill
    // is wider in the second, which is no fault of the layout.
    expect(
      compareMirrored(
        snapshot('ltr', [box('0', 0, 380.2)], {}, 'Horizontal (1%)'),
        snapshot('rtl', [box('0', 376.3, 0)], {}, 'Horizontal (2%)'),
      ),
    ).toEqual([
      'the two renders show different content, so they cannot be compared: “Horizontal (1%)” then “Horizontal (2%)”',
    ]);
  });

  it('refuses two renders in the same direction', () => {
    expect(compareMirrored(snapshot('rtl', []), snapshot('rtl', []))).toEqual([
      'both renders are rtl',
    ]);
  });
});

describe('layoutsMatch', () => {
  it('matches the same boxes, within half a pixel', () => {
    expect(
      layoutsMatch(
        snapshot('ltr', [box('0', 10, 20), box('0/0', 0, 5, 1)]),
        snapshot('ltr', [box('0', 10.4, 20), box('0/0', 0, 5, 1)]),
      ),
    ).toBe(true);
  });

  it('tells text that changed', () => {
    expect(
      layoutsMatch(
        snapshot('ltr', [box('0', 10, 20)], {}, 'Saving…'),
        snapshot('ltr', [box('0', 10, 20)], {}, 'Saved'),
      ),
    ).toBe(false);
  });

  it('tells a box that moved, an element that appeared and an arrow that turned', () => {
    const settled = snapshot('ltr', [box('0', 10, 20, 1)]);
    expect(layoutsMatch(settled, snapshot('ltr', [box('0', 12, 18, 1)]))).toBe(
      false,
    );
    expect(
      layoutsMatch(
        settled,
        snapshot('ltr', [box('0', 10, 20, 1), box('1', 0, 0)]),
      ),
    ).toBe(false);
    expect(layoutsMatch(settled, snapshot('ltr', [box('0', 10, 20, -1)]))).toBe(
      false,
    );
  });
});

describe('layoutShowing', () => {
  // Frames are scripted: each call to `nextFrame` moves to the next
  // snapshot, and the clock moves 16ms a frame.
  const scripted = (frames: readonly LayoutSnapshot[]) => {
    let frame = 0;
    return {
      snapshot: () => frames[Math.min(frame, frames.length - 1)]!,
      nextFrame: async () => {
        frame += 1;
      },
      now: () => frame * 16,
      limitMs: frames.length * 16,
    };
  };
  const loading = snapshot('ltr', [box('0', 0, 300)], {}, 'Loading…');
  const loaded = snapshot('ltr', [box('0', 0, 100)], {}, 'Ada Lovelace');
  const oldDirection = snapshot('rtl', [box('0', 100, 0)], {}, 'Ada Lovelace');

  it('waits out the old direction and a load, then measures the content', async () => {
    expect(
      await layoutShowing({
        direction: 'ltr',
        text: 'Ada Lovelace',
        ...scripted([oldDirection, loading, loading, loaded, loaded]),
      }),
    ).toBe(loaded);
  });

  it('waits for the layout to hold still once the content arrives', async () => {
    const measuring = snapshot('ltr', [box('0', 0, 140)], {}, 'Ada Lovelace');
    expect(
      await layoutShowing({
        direction: 'ltr',
        text: 'Ada Lovelace',
        ...scripted([loading, measuring, loaded, loaded]),
      }),
    ).toBe(loaded);
  });

  it('takes the frame a timer showed the content, before it moved on', async () => {
    const at = (percent: number) =>
      snapshot('ltr', [box('0', 0, 384 - percent * 3.84)], {}, `${percent}%`);
    const frames = [at(0), at(1), at(2), at(3)];
    expect(
      await layoutShowing({
        direction: 'ltr',
        text: '2%',
        ...scripted(frames),
      }),
    ).toBe(frames[2]);
  });

  it('gives up on content that never comes, with the last snapshot', async () => {
    const result = await layoutShowing({
      direction: 'ltr',
      text: 'Ada Lovelace',
      ...scripted([loading, loading, loading]),
    });
    expect(result.text).toBe('Loading…');
    expect(compareMirrored(result, oldDirection)).toEqual([
      'the two renders show different content, so they cannot be compared: “Loading…” then “Ada Lovelace”',
    ]);
  });
});
