import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { useKeyboardReorder } from '../useKeyboardReorder';

/**
 * One reorderable control whose index is moved from OUTSIDE it, so a test can
 * shift the item for a reason unrelated to the arrow press: the situation a
 * stale refocus claim goes off in.
 */
function Harness({
  onMove,
}: {
  onMove: (targetIndex: number) => Promise<boolean>;
}) {
  const [index, setIndex] = useState(1);
  const { ref, ...reorder } = useKeyboardReorder({
    index,
    itemCount: 5,
    onMove,
  });

  return (
    <>
      <button type="button" onClick={() => setIndex((current) => current + 1)}>
        Shift the item
      </button>
      <button type="button">Somewhere else</button>
      <button
        type="button"
        ref={ref}
        onKeyDown={reorder.onKeyDown}
        aria-keyshortcuts={reorder['aria-keyshortcuts']}
      >
        Item
      </button>
    </>
  );
}

const nextFrames = async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
};

/**
 * Presses ArrowDown on the item and answers it later with `answer`. Focus is
 * then either LOST (on the page body, where a browser drops the focus of a
 * repositioned control) or put ELSEWHERE by the user, and something unrelated
 * moves the item: the moment a claim on focus still standing would act.
 */
async function pressAndAnswer(
  answer: (resolve: (moved: boolean) => void, reject: () => void) => void,
  focus: 'lost' | 'elsewhere',
) {
  const { promise, resolve, reject } = Promise.withResolvers<boolean>();
  render(<Harness onMove={() => promise} />);
  const item = screen.getByRole('button', { name: 'Item' });
  item.focus();
  fireEvent.keyDown(item, { key: 'ArrowDown' });

  await act(async () => {
    answer(resolve, () => reject(new Error('lost')));
    await promise.catch(() => undefined);
  });

  const elsewhere = screen.getByRole('button', { name: 'Somewhere else' });
  if (focus === 'lost') item.blur();
  else elsewhere.focus();
  fireEvent.click(screen.getByRole('button', { name: 'Shift the item' }));
  await nextFrames();
  return { item, elsewhere };
}

describe('a move whose answer arrives later', () => {
  it('gives back the focus the reorder took when the answer is that the move landed', async () => {
    const { item } = await pressAndAnswer((resolve) => resolve(true), 'lost');
    expect(item).toHaveFocus();
  });

  it('drops its claim on focus when the answer is that the move did not land', async () => {
    await pressAndAnswer((resolve) => resolve(false), 'lost');
    expect(document.activeElement).toBe(document.body);
  });

  it('drops its claim on focus when the move fails outright', async () => {
    await pressAndAnswer((_, reject) => reject(), 'lost');
    expect(document.activeElement).toBe(document.body);
  });
});

describe('a move that lands after the user has moved on', () => {
  it('leaves focus where the user put it', async () => {
    const { elsewhere } = await pressAndAnswer(
      (resolve) => resolve(true),
      'elsewhere',
    );
    expect(elsewhere).toHaveFocus();
  });
});
