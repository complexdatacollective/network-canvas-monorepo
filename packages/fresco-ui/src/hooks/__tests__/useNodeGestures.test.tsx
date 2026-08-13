import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type NodeDragEndInfo, useNodeGestures } from '../useNodeGestures';

const HOLD_DURATION = 500;
const FEEDBACK_DELAY = 150;

type ProbeProps = {
  onLongPress?: () => void;
  onHoldInterrupted?: () => void;
  onDragStart?: (event: PointerEvent) => void;
  onDragMove?: (event: PointerEvent) => void;
  onDragEnd?: (event: PointerEvent, info: NodeDragEndInfo) => void;
  onClickResult?: (suppressed: boolean) => void;
  holdEnabled?: boolean;
  dragEnabled?: boolean;
  disabled?: boolean;
};

function Probe({
  onLongPress,
  onHoldInterrupted,
  onDragStart,
  onDragMove,
  onDragEnd,
  onClickResult,
  holdEnabled = true,
  dragEnabled = false,
  disabled = false,
}: ProbeProps) {
  const { onPointerDown, shouldSuppressClick, isHolding, isDragging } =
    useNodeGestures({
      onLongPress,
      onHoldInterrupted,
      onDragStart,
      onDragMove,
      onDragEnd,
      holdEnabled,
      dragEnabled,
      disabled,
    });

  return (
    <button
      type="button"
      data-holding={isHolding}
      data-dragging={isDragging}
      onPointerDown={onPointerDown}
      onClick={() => onClickResult?.(shouldSuppressClick())}
    >
      hold me
    </button>
  );
}

const target = () => screen.getByRole('button');

const press = (clientX = 0, clientY = 0, pointerId = 1) =>
  fireEvent.pointerDown(target(), { button: 0, clientX, clientY, pointerId });

const hold = () => act(() => void vi.advanceTimersByTime(HOLD_DURATION));

const isHolding = () => target().getAttribute('data-holding') === 'true';
const isDragging = () => target().getAttribute('data-dragging') === 'true';

beforeEach(() => {
  vi.useFakeTimers();
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
});
afterEach(() => vi.useRealTimers());

describe('useNodeGestures: holds', () => {
  it('fires once the pointer has been held for the full duration', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    press();
    act(() => void vi.advanceTimersByTime(HOLD_DURATION - 1));
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1));
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it('does not fire when the pointer is released first', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    press();
    fireEvent.pointerUp(window, { pointerId: 1 });
    hold();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('abandons the hold once movement could become a drag', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 103, clientY: 100, pointerId: 1 });
    act(() => void vi.advanceTimersByTime(100));
    expect(onLongPress).not.toHaveBeenCalled();

    // Still within the drag threshold, so the hold survives.
    act(() => void vi.advanceTimersByTime(HOLD_DURATION));
    expect(onLongPress).toHaveBeenCalledOnce();

    onLongPress.mockClear();
    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 106, clientY: 100, pointerId: 1 });
    hold();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('abandons the hold on pointer cancellation', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    press();
    fireEvent.pointerCancel(window, { pointerId: 1 });
    hold();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('abandons the hold when the page scrolls under it', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    press();
    fireEvent.scroll(document);
    hold();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('never lets a press interrupted by scrolling become a drag', () => {
    const onDragStart = vi.fn();
    render(
      <Probe dragEnabled onDragStart={onDragStart} onLongPress={vi.fn()} />,
    );

    // Held on the node, the surroundings scroll, and only then does the
    // pointer move: the node has already been scrolled out from under the
    // finger, so picking it up now would move the wrong thing.
    press(100, 100);
    fireEvent.scroll(document);
    fireEvent.pointerMove(window, { clientX: 160, clientY: 100, pointerId: 1 });

    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('never lets a press interrupted by scrolling also tap', () => {
    const onClickResult = vi.fn();
    render(<Probe onLongPress={vi.fn()} onClickResult={onClickResult} />);

    // A wheel or second finger scrolls while the pointer rests on the node;
    // the release under the pointer still synthesizes a native click, but the
    // gesture was classified as a scroll, not a tap.
    press();
    fireEvent.scroll(document);
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(target());

    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('suppresses the click that follows a hold, exactly once', () => {
    const onClickResult = vi.fn();
    render(<Probe onLongPress={vi.fn()} onClickResult={onClickResult} />);

    press();
    hold();
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(target());
    expect(onClickResult).toHaveBeenLastCalledWith(true);

    fireEvent.click(target());
    expect(onClickResult).toHaveBeenLastCalledWith(false);
  });

  it('leaves an ordinary tap alone', () => {
    const onClickResult = vi.fn();
    render(<Probe onLongPress={vi.fn()} onClickResult={onClickResult} />);

    press();
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(target());

    expect(onClickResult).toHaveBeenCalledWith(false);
  });

  it('never fires when holds are not enabled', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} holdEnabled={false} />);

    press();
    hold();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('ignores non-primary buttons', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    fireEvent.pointerDown(target(), { button: 2, clientX: 0, clientY: 0 });
    hold();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('reports a hold in progress once the press looks deliberate', () => {
    render(<Probe onLongPress={vi.fn()} />);

    press();
    expect(isHolding()).toBe(false);

    act(() => void vi.advanceTimersByTime(FEEDBACK_DELAY));
    expect(isHolding()).toBe(true);
  });

  it('stops reporting a hold once it fires', () => {
    render(<Probe onLongPress={vi.fn()} />);

    press();
    hold();

    expect(isHolding()).toBe(false);
  });

  it('stops reporting a hold the moment it is abandoned', () => {
    render(<Probe onLongPress={vi.fn()} />);

    press(100, 100);
    act(() => void vi.advanceTimersByTime(FEEDBACK_DELAY));
    expect(isHolding()).toBe(true);

    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    expect(isHolding()).toBe(false);
  });

  it('never reports a hold for an ordinary tap', () => {
    render(<Probe onLongPress={vi.fn()} />);

    press();
    act(() => void vi.advanceTimersByTime(FEEDBACK_DELAY - 1));
    fireEvent.pointerUp(window, { pointerId: 1 });
    act(() => void vi.advanceTimersByTime(FEEDBACK_DELAY));

    expect(isHolding()).toBe(false);
  });

  it('abandons an in-flight hold that stops being applicable', () => {
    const onLongPress = vi.fn();
    const { rerender } = render(
      <Probe onLongPress={onLongPress} holdEnabled />,
    );

    press();
    act(() => void vi.advanceTimersByTime(FEEDBACK_DELAY));
    expect(isHolding()).toBe(true);

    rerender(<Probe onLongPress={onLongPress} holdEnabled={false} />);
    expect(isHolding()).toBe(false);

    hold();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire after unmount', () => {
    const onLongPress = vi.fn();
    const { unmount } = render(<Probe onLongPress={onLongPress} />);

    press();
    unmount();
    hold();

    expect(onLongPress).not.toHaveBeenCalled();
  });
});

describe('useNodeGestures: multi-touch', () => {
  it('ignores a second pointer moving or lifting elsewhere', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    press(100, 100, 1);

    // A second finger wanders and lifts while the first stays put.
    fireEvent.pointerMove(window, { clientX: 400, clientY: 400, pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 2 });
    hold();

    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it('still abandons the hold for the pointer that started it', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    press(100, 100, 7);
    fireEvent.pointerUp(window, { pointerId: 7 });
    hold();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('keeps a fired hold intact when a second finger lands on the node', () => {
    const onClickResult = vi.fn();
    render(<Probe onLongPress={vi.fn()} onClickResult={onClickResult} />);

    press(0, 0, 1);
    hold();
    expect(isHolding()).toBe(false);

    // The drag system ignores that pointer, so if the hold were torn down here
    // the first finger's release would select the node despite the reveal.
    press(0, 0, 2);

    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(target());

    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe('useNodeGestures: suppression lifecycle', () => {
  it('does not carry a suppression into a later gesture', () => {
    const onClickResult = vi.fn();
    render(<Probe onLongPress={vi.fn()} onClickResult={onClickResult} />);

    // Hold until it fires, then move within the same gesture (no drag
    // callbacks are wired, so an external system owns that movement and any
    // click it swallows).
    press(100, 100);
    hold();
    fireEvent.pointerMove(window, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    // The next ordinary tap must not be swallowed by the leftover.
    press(100, 100);
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(target());

    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('expires a suppression when the gesture is cancelled outright', () => {
    const onClickResult = vi.fn();
    render(<Probe onLongPress={vi.fn()} onClickResult={onClickResult} />);

    press();
    hold();
    // A cancelled sequence produces no click at all, so the suppression has
    // nothing of its own to swallow.
    fireEvent.pointerCancel(window, { pointerId: 1 });
    act(() => void vi.advanceTimersByTime(1));

    // Whatever activates the node next — a key press arrives as a click, with
    // no pointer-down in front of it to clear the flag — must get through.
    fireEvent.click(target());
    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('expires a suppression when the gesture ends away from the node', () => {
    const onClickResult = vi.fn();
    render(<Probe onLongPress={vi.fn()} onClickResult={onClickResult} />);

    press(100, 100);
    hold();
    // Moved off the node after the hold fired: the release lands elsewhere, so
    // again no click reaches the node.
    fireEvent.pointerMove(window, { clientX: 300, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    act(() => void vi.advanceTimersByTime(1));

    fireEvent.click(target());
    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('still suppresses the click that does belong to the hold', () => {
    const onClickResult = vi.fn();
    render(<Probe onLongPress={vi.fn()} onClickResult={onClickResult} />);

    press();
    hold();
    fireEvent.pointerUp(window, { pointerId: 1 });
    // A real click follows its own pointer-up synchronously, well inside the
    // window the expiry leaves open.
    fireEvent.click(target());

    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe('useNodeGestures: drags', () => {
  const dragProbe = (overrides: Partial<ProbeProps> = {}) => {
    const onDragStart = vi.fn();
    const onDragMove = vi.fn();
    const onDragEnd = vi.fn();
    const onClickResult = vi.fn();
    render(
      <Probe
        dragEnabled
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onClickResult={onClickResult}
        {...overrides}
      />,
    );
    return { onDragStart, onDragMove, onDragEnd, onClickResult };
  };

  it('classifies movement past the threshold as a drag, exactly once', () => {
    const { onDragStart, onDragMove } = dragProbe();

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 103, clientY: 100, pointerId: 1 });
    expect(onDragStart).not.toHaveBeenCalled();

    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onDragMove).toHaveBeenCalledOnce();
    expect(isDragging()).toBe(true);

    fireEvent.pointerMove(window, { clientX: 160, clientY: 100, pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onDragMove).toHaveBeenCalledTimes(2);
  });

  it('ends the drag on release, and reports cancellation distinctly', () => {
    const { onDragEnd } = dragProbe();

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledOnce();
    expect(onDragEnd.mock.calls[0]![1]).toEqual({ cancelled: false });
    expect(isDragging()).toBe(false);

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledTimes(2);
    expect(onDragEnd.mock.calls[1]![1]).toEqual({ cancelled: true });
  });

  it('a drag is never also a tap', () => {
    const { onClickResult } = dragProbe();

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    // Pointer capture still delivers the click to the node after a drag.
    fireEvent.click(target());

    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('a drag withdraws a hold already underway', () => {
    const onHoldInterrupted = vi.fn();
    dragProbe({ onHoldInterrupted });

    press(100, 100);
    act(() => void vi.advanceTimersByTime(FEEDBACK_DELAY));
    expect(isHolding()).toBe(true);

    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    expect(isHolding()).toBe(false);
    expect(onHoldInterrupted).toHaveBeenCalledOnce();
    expect(isDragging()).toBe(true);
  });

  it('ignores a second finger for the whole drag', () => {
    const { onDragMove, onDragEnd } = dragProbe();

    press(100, 100, 1);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    const movesAfterStart = onDragMove.mock.calls.length;

    fireEvent.pointerMove(window, { clientX: 500, clientY: 500, pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 2 });
    expect(onDragMove).toHaveBeenCalledTimes(movesAfterStart);
    expect(onDragEnd).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledOnce();
  });

  it('ends a live drag as cancelled when the node unmounts mid-drag', () => {
    const onDragEnd = vi.fn();
    const { unmount } = render(
      <Probe dragEnabled onDragStart={vi.fn()} onDragEnd={onDragEnd} />,
    );

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    expect(onDragEnd).not.toHaveBeenCalled();

    // The host's effects — a DnD item in flight, a pinned simulation node —
    // outlive the hook, so they must hear the drag end.
    unmount();
    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      cancelled: true,
    });
  });

  it('ends a live drag as cancelled when the node becomes disabled mid-drag', () => {
    const onDragEnd = vi.fn();
    const { rerender } = render(
      <Probe dragEnabled onDragStart={vi.fn()} onDragEnd={onDragEnd} />,
    );

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });

    rerender(
      <Probe
        dragEnabled
        disabled
        onDragStart={vi.fn()}
        onDragEnd={onDragEnd}
      />,
    );
    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      cancelled: true,
    });

    // The interruption consumed the drag: releasing afterwards ends nothing.
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledOnce();
  });

  it('ends a live drag as cancelled when the host withdraws its drag handlers', () => {
    const onDragEnd = vi.fn();
    const onClickResult = vi.fn();
    const { rerender } = render(
      <Probe
        dragEnabled
        onDragStart={vi.fn()}
        onDragEnd={onDragEnd}
        onClickResult={onClickResult}
      />,
    );

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });

    // Repositioning toggled off mid-drag: the handlers disappear, but the
    // callback that began the drag owns its cleanup and must see it end.
    rerender(<Probe dragEnabled={false} onClickResult={onClickResult} />);
    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      cancelled: true,
    });

    // The interruption consumed the drag; the release neither ends it again
    // nor turns into a tap.
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledOnce();
    fireEvent.click(target());
    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('settles a drag through the callback that began it, not a later one', () => {
    const original = vi.fn();
    const replacement = vi.fn();
    const { rerender } = render(
      <Probe dragEnabled onDragStart={vi.fn()} onDragEnd={original} />,
    );

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });

    // The host swaps handlers mid-drag; cleanup belongs to the original.
    rerender(
      <Probe dragEnabled onDragStart={vi.fn()} onDragEnd={replacement} />,
    );
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(original).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      cancelled: false,
    });
    expect(replacement).not.toHaveBeenCalled();
  });

  it('does not report an orderly release as a second, cancelled end', () => {
    const onDragEnd = vi.fn();
    const { unmount } = render(
      <Probe dragEnabled onDragStart={vi.fn()} onDragEnd={onDragEnd} />,
    );

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    unmount();

    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      cancelled: false,
    });
  });

  it('does not classify a drag when drags are not enabled', () => {
    const onDragStart = vi.fn();
    const onClickResult = vi.fn();
    render(
      <Probe
        dragEnabled={false}
        onClickResult={onClickResult}
        onLongPress={vi.fn()}
      />,
    );

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(target());

    expect(onDragStart).not.toHaveBeenCalled();
    // No drag was classified, but the gesture stopped being a tap the moment
    // it moved: the click a mouse or sub-slop touch release still synthesizes
    // must not select the node a participant was only trying to hold.
    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('still passes a tap through when movement stays under the threshold', () => {
    const onClickResult = vi.fn();
    render(<Probe dragEnabled={false} onClickResult={onClickResult} />);

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 103, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(target());

    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(false);
  });
});

describe('useNodeGestures: losing the pointer to the window', () => {
  it('ends a live drag as cancelled when the window blurs', () => {
    const onDragEnd = vi.fn();
    render(<Probe dragEnabled onDragStart={vi.fn()} onDragEnd={onDragEnd} />);

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100, pointerId: 1 });
    // The participant switches apps mid-drag: no pointerup or pointercancel
    // will ever arrive for this sequence.
    fireEvent.blur(window);

    expect(onDragEnd).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      cancelled: true,
    });
  });

  it('releases pointer ownership when the window blurs mid-hold', () => {
    const onLongPress = vi.fn();
    const onClickResult = vi.fn();
    render(<Probe onLongPress={onLongPress} onClickResult={onClickResult} />);

    press(100, 100);
    fireEvent.blur(window);

    // The abandoned sequence neither fires its hold nor squats on the
    // pointer: the next press is a fresh gesture that can tap normally.
    act(() => void vi.advanceTimersByTime(HOLD_DURATION + 1));
    expect(onLongPress).not.toHaveBeenCalled();

    press(100, 100);
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(target());
    expect(onClickResult).toHaveBeenCalledExactlyOnceWith(false);
  });
});
