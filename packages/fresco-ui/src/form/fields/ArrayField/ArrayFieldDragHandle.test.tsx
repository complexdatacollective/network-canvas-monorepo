import { fireEvent, render, screen } from '@testing-library/react';
import { useDragControls } from 'motion/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ArrayFieldDragHandle } from './ArrayField';

/**
 * Harness whose index is controlled from OUTSIDE the handle, so a test can move
 * the item for a reason that has nothing to do with the arrow press — which is
 * the situation a stale refocus claim goes off in.
 */
function Harness({
  onMove,
}: {
  onMove: (targetIndex: number) => void | boolean;
}) {
  const dragControls = useDragControls();
  const [index, setIndex] = useState(1);

  return (
    <>
      <button type="button" onClick={() => setIndex((current) => current + 1)}>
        Shift the item
      </button>
      <button type="button">Somewhere else</button>
      <ArrayFieldDragHandle
        dragControls={dragControls}
        index={index}
        itemCount={5}
        onMove={onMove}
      />
    </>
  );
}

const handle = () => screen.getByRole('button', { name: /^Reorder item/ });

describe('ArrayFieldDragHandle', () => {
  it('reclaims focus after a move it asked for', async () => {
    render(<Harness onMove={vi.fn()} />);

    handle().focus();
    fireEvent.keyDown(handle(), { key: 'ArrowDown' });
    // The list "commits" by re-indexing the item.
    fireEvent.click(screen.getByRole('button', { name: 'Shift the item' }));

    await vi.waitFor(() => expect(handle()).toHaveFocus());
  });

  it('drops its claim on focus when the list refuses the move', async () => {
    // A list with ordering rules of its own — Architect's timeline refuses a
    // reorder that would strand a skip destination — answers `false` and leaves
    // the item where it was.
    render(<Harness onMove={() => false} />);

    handle().focus();
    fireEvent.keyDown(handle(), { key: 'ArrowDown' });

    const elsewhere = screen.getByRole('button', { name: 'Somewhere else' });
    elsewhere.focus();
    // Something unrelated now moves the item. Without the disarm the refused
    // press is still waiting, and focus is yanked back onto the handle here.
    fireEvent.click(screen.getByRole('button', { name: 'Shift the item' }));

    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(elsewhere).toHaveFocus();
  });

  it('does not ask for a move that would run off either end', () => {
    const onMove = vi.fn();
    const dragControls = { start: vi.fn() };
    render(
      <ArrayFieldDragHandle
        dragControls={
          dragControls as unknown as Parameters<
            typeof ArrayFieldDragHandle
          >[0]['dragControls']
        }
        index={0}
        itemCount={2}
        onMove={onMove}
      />,
    );

    fireEvent.keyDown(handle(), { key: 'ArrowUp' });
    expect(onMove).not.toHaveBeenCalled();
  });
});
