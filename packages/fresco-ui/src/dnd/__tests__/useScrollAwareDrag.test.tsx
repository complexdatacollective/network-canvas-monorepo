import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollArea } from '../../ScrollArea';
import { DndStoreProvider, useDndStore } from '../DndStoreProvider';
import { useDragSource } from '../useDragSource';
import { useDropTarget } from '../useDropTarget';
import { SCROLL_AXIS_DRAG_HOLD } from '../useScrollAwareDrag';

const OVERFLOW_PROPERTIES = [
  'scrollWidth',
  'clientWidth',
  'scrollHeight',
  'clientHeight',
] as const;

beforeEach(() => {
  // jsdom lays nothing out, so overflow has to be declared: an element's
  // `data-overflow` names the axes its content overflows ("x", "y", "xy").
  for (const property of OVERFLOW_PROPERTIES) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        const overflow = this.dataset.overflow ?? '';
        if (property === 'scrollWidth' && overflow.includes('x')) return 900;
        if (property === 'scrollHeight' && overflow.includes('y')) return 900;
        return 100;
      },
    });
  }
  // jsdom implements no pointer capture.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  // Nor hit testing: no drop target is ever under the pointer.
  document.elementsFromPoint = () => [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const property of OVERFLOW_PROPERTIES) {
    Reflect.deleteProperty(HTMLElement.prototype, property);
  }
});

function Source() {
  const { dragProps } = useDragSource({ type: 'person', announcedName: 'Ada' });
  return <div data-testid="source" {...dragProps} />;
}

function DragState() {
  const isDragging = useDndStore((state) => state.isDragging);
  return (
    <output data-testid="state">{isDragging ? 'dragging' : 'idle'}</output>
  );
}

const renderWith = (children: ReactNode) =>
  render(
    <DndStoreProvider>
      {children}
      <DragState />
    </DndStoreProvider>,
  );

/** A source in a region scrolling along `overflow`, or outside any region. */
const renderIn = (
  orientation: 'horizontal' | 'vertical' | 'none',
  overflow = '',
) =>
  renderWith(
    orientation === 'none' ? (
      <Source />
    ) : (
      <ScrollArea
        orientation={orientation}
        data-overflow={overflow}
        data-testid="region"
      >
        <Source />
      </ScrollArea>
    ),
  );

// The drag preview is a clone of the source, test id included, so a test
// keeps hold of the original rather than querying for it mid-drag.
const source = () => screen.getAllByTestId('source')[0]!;
const dragState = () => screen.getByTestId('state').textContent;
const touchActionSettles = (value: string) =>
  waitFor(() => expect(source().style.touchAction).toBe(value));

/** jsdom has no PointerEvent; a MouseEvent carries the coordinates. */
const pointer = (
  type: string,
  target: EventTarget,
  { x = 0, y = 0, pointerType = 'touch', pointerId = 1 } = {},
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  Object.assign(event, { pointerId, pointerType });
  act(() => {
    target.dispatchEvent(event);
  });
};

const touchMove = () => {
  const event = new Event('touchmove', { bubbles: true, cancelable: true });
  source().dispatchEvent(event);
  return event;
};

describe('scroll-aware drag sources', () => {
  describe('touch-action', () => {
    it('leaves the browser only the pans the region can perform', async () => {
      const { unmount } = renderIn('horizontal', 'x');
      await touchActionSettles('pan-x');
      unmount();

      renderIn('vertical', 'y');
      await touchActionSettles('pan-y');
    });

    it('leaves the browser nothing once the region has nothing to scroll', async () => {
      const { rerender } = renderIn('horizontal', 'x');
      await touchActionSettles('pan-x');

      // The last people leave the bin: everything left fits.
      rerender(
        <DndStoreProvider>
          <ScrollArea orientation="horizontal" remeasureKey="fits">
            <Source />
          </ScrollArea>
          <DragState />
        </DndStoreProvider>,
      );
      await touchActionSettles('none');
    });

    it('ignores vertical overflow a horizontal region clips', async () => {
      // Overflowing both ways, a horizontal region still only pans sideways.
      const { rerender } = renderIn('horizontal', 'xy');
      await touchActionSettles('pan-x');
      const region = screen.getByTestId('region');
      expect(region).toHaveAttribute('tabindex', '0');

      // Overflowing only the axis it clips, it has nothing to scroll — and
      // nothing to reach by keyboard either.
      rerender(
        <DndStoreProvider>
          <ScrollArea
            orientation="horizontal"
            data-overflow="y"
            data-testid="region"
            remeasureKey="y"
          >
            <Source />
          </ScrollArea>
          <DragState />
        </DndStoreProvider>,
      );
      await waitFor(() => expect(region).toHaveAttribute('tabindex', '-1'));
      expect(source().style.touchAction).toBe('none');
    });

    it('combines nested regions', async () => {
      renderWith(
        <ScrollArea data-overflow="y">
          <ScrollArea orientation="horizontal">
            <Source />
          </ScrollArea>
        </ScrollArea>,
      );
      // The inner bin fits, but swiping up and down still scrolls the outer.
      await touchActionSettles('pan-y');
    });

    it('leaves the page its vertical scrolling outside any region', () => {
      renderIn('none');
      expect(source().style.touchAction).toBe('pan-y');
    });
  });

  describe('a touch gesture', () => {
    it('scrolls along the scroll axis and drags across it', async () => {
      renderIn('horizontal', 'x');
      await touchActionSettles('pan-x');

      pointer('pointerdown', source());
      pointer('pointermove', document, { x: 20, y: 2 });
      expect(dragState()).toBe('idle');
      expect(touchMove().defaultPrevented).toBe(false);

      // The same gesture turning upward is no longer the region's to scroll.
      pointer('pointermove', document, { x: 20, y: -40 });
      expect(dragState()).toBe('dragging');
      expect(touchMove().defaultPrevented).toBe(true);
    });

    it('drags across a vertical region immediately', async () => {
      renderIn('vertical', 'y');
      await touchActionSettles('pan-y');

      pointer('pointerdown', source());
      pointer('pointermove', document, { x: 30, y: 0 });
      expect(dragState()).toBe('dragging');
    });

    it('scrolls only within 30° of the scroll axis', async () => {
      renderIn('horizontal', 'x');
      await touchActionSettles('pan-x');

      pointer('pointerdown', source());
      // 25° from horizontal: a sideways swipe.
      pointer('pointermove', document, { x: -30, y: -14 });
      expect(dragState()).toBe('idle');
      // 35° from horizontal: aimed diagonally out of the bin.
      pointer('pointermove', document, { x: -30, y: -21 });
      expect(dragState()).toBe('dragging');
    });

    it('drags along the scroll axis once a still press has been held', async () => {
      renderIn('horizontal', 'x');
      await touchActionSettles('pan-x');
      vi.useFakeTimers();

      pointer('pointerdown', source());
      expect(touchMove().defaultPrevented).toBe(false);
      act(() => vi.advanceTimersByTime(SCROLL_AXIS_DRAG_HOLD));

      expect(source()).toHaveAttribute('data-drag-armed');
      expect(source().style.filter).not.toBe('');
      expect(touchMove().defaultPrevented).toBe(true);
      pointer('pointermove', document, { x: 20, y: 0 });
      expect(dragState()).toBe('dragging');
    });

    it('does not arm a press that moves before the hold completes', async () => {
      renderIn('horizontal', 'x');
      await touchActionSettles('pan-x');
      vi.useFakeTimers();

      pointer('pointerdown', source());
      pointer('pointermove', document, { x: 20, y: 0 });
      act(() => vi.advanceTimersByTime(SCROLL_AXIS_DRAG_HOLD));

      expect(source()).not.toHaveAttribute('data-drag-armed');
      expect(touchMove().defaultPrevented).toBe(false);
    });

    it('lets go of a gesture the browser takes before it drags', async () => {
      renderIn('horizontal', 'x');
      await touchActionSettles('pan-x');

      pointer('pointerdown', source());
      pointer('pointermove', document, { x: 20, y: 0 });
      pointer('pointercancel', document, { x: 20, y: 0 });
      // The gesture is over: later movement belongs to nothing.
      pointer('pointermove', document, { x: 20, y: -60 });
      expect(dragState()).toBe('idle');
    });

    it('ignores a second finger', async () => {
      renderIn('horizontal', 'x');
      await touchActionSettles('pan-x');

      pointer('pointerdown', source());
      pointer('pointermove', document, { y: -40, pointerId: 2 });
      expect(dragState()).toBe('idle');

      pointer('pointermove', document, { y: -40 });
      expect(dragState()).toBe('dragging');
      pointer('pointerup', document, { y: -40, pointerId: 2 });
      expect(dragState()).toBe('dragging');
      pointer('pointerup', document, { y: -40 });
      expect(dragState()).toBe('idle');
    });
  });

  it('drags a mouse along the scroll axis immediately', async () => {
    renderIn('horizontal', 'x');
    await touchActionSettles('pan-x');

    pointer('pointerdown', source(), { pointerType: 'mouse' });
    pointer('pointermove', document, { x: 20, y: 0, pointerType: 'mouse' });
    expect(dragState()).toBe('dragging');
  });

  describe('over a drop target', () => {
    function Target({ onDrop }: { onDrop: () => void }) {
      const { dropProps, isOver } = useDropTarget({
        id: 'target',
        accepts: ['person'],
        announcedName: 'Target',
        onDrop,
      });
      return (
        <div
          data-testid="target"
          data-over={isOver || undefined}
          {...dropProps}
        />
      );
    }

    const dragOverTarget = async () => {
      const onDrop = vi.fn();
      renderWith(
        <>
          <Source />
          <Target onDrop={onDrop} />
        </>,
      );
      const target = screen.getByTestId('target');
      document.elementsFromPoint = () => [target];

      pointer('pointerdown', source());
      pointer('pointermove', document, { x: 40, y: 0 });
      expect(dragState()).toBe('dragging');
      // Hit testing follows the pointer a frame behind.
      pointer('pointermove', document, { x: 50, y: 0 });
      await waitFor(() => expect(target).toHaveAttribute('data-over', 'true'));
      return onDrop;
    };

    it('drops where the pointer is released', async () => {
      const onDrop = await dragOverTarget();
      pointer('pointerup', document, { x: 50, y: 0 });
      expect(onDrop).toHaveBeenCalledTimes(1);
    });

    it('does not drop when the browser cancels the gesture', async () => {
      const onDrop = await dragOverTarget();
      pointer('pointercancel', document, { x: 50, y: 0 });
      expect(dragState()).toBe('idle');
      expect(onDrop).not.toHaveBeenCalled();
      expect(source().style.visibility).toBe('');
    });
  });
});
