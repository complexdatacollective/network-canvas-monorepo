import { act, render, screen, waitFor } from '@testing-library/react';
import { type RefObject, useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { useVirtualization } from '../hooks/useVirtualization';
import type { RowInfo } from '../layout/types';

const ROW_HEIGHT = 50;
const rows: RowInfo[] = Array.from({ length: 40 }, (_, rowIndex) => ({
  rowIndex,
  yStart: rowIndex * ROW_HEIGHT,
  height: ROW_HEIGHT,
  itemKeys: [`item-${rowIndex}`],
}));

function VisibleRows({
  scrollRef,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { virtualItems } = useVirtualization({ rows, scrollRef, overscan: 0 });
  return (
    <output data-testid="rows">
      {virtualItems.map(({ row }) => row.rowIndex).join(',')}
    </output>
  );
}

// As in a collection: the viewport is rendered around the rows, so its ref is
// attached only after the layout effects of everything inside it have run.
function Viewport() {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={scrollRef} data-testid="viewport">
      <VisibleRows scrollRef={scrollRef} />
    </div>
  );
}

const firstVisibleRow = () =>
  Number(screen.getByTestId('rows').textContent?.split(',')[0]);

describe('useVirtualization', () => {
  it('follows a viewport its parent renders from the first render on', async () => {
    render(<Viewport />);

    // Nothing re-renders the rows after they mount, so they only appear if
    // the hook found the viewport on its own.
    await waitFor(() =>
      expect(screen.getByTestId('rows').textContent).not.toBe(''),
    );
    expect(firstVisibleRow()).toBe(0);

    const viewport = screen.getByTestId('viewport');
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      value: 20 * ROW_HEIGHT,
    });
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => expect(firstVisibleRow()).toBeGreaterThan(0));
  });
});
