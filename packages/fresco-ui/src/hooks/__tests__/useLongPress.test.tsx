import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLongPress } from '../useLongPress';

const HOLD_DURATION = 500;

const FEEDBACK_DELAY = 150;

function Probe({
  onLongPress,
  onClickResult,
  enabled,
}: {
  onLongPress: () => void;
  onClickResult?: (suppressed: boolean) => void;
  enabled?: boolean;
}) {
  const { onPointerDown, shouldSuppressClick, isHolding } = useLongPress({
    onLongPress,
    enabled,
  });

  return (
    <button
      type="button"
      data-holding={isHolding}
      onPointerDown={onPointerDown}
      onClick={() => onClickResult?.(shouldSuppressClick())}
    >
      hold me
    </button>
  );
}

const isHolding = () => target().getAttribute('data-holding') === 'true';

const target = () => screen.getByRole('button');

const press = (clientX = 0, clientY = 0) =>
  fireEvent.pointerDown(target(), { button: 0, clientX, clientY });

const hold = () => act(() => void vi.advanceTimersByTime(HOLD_DURATION));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useLongPress', () => {
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
    fireEvent.pointerUp(window);
    hold();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('abandons the hold once movement could become a drag', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 103, clientY: 100 });
    act(() => void vi.advanceTimersByTime(100));
    expect(onLongPress).not.toHaveBeenCalled();

    // Still within the drag threshold, so the hold survives.
    act(() => void vi.advanceTimersByTime(HOLD_DURATION));
    expect(onLongPress).toHaveBeenCalledOnce();

    onLongPress.mockClear();
    press(100, 100);
    fireEvent.pointerMove(window, { clientX: 106, clientY: 100 });
    hold();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('abandons the hold on pointer cancellation', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} />);

    press();
    fireEvent.pointerCancel(window);
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

  it('suppresses the click that follows a hold, exactly once', () => {
    const onClickResult = vi.fn();
    render(<Probe onLongPress={vi.fn()} onClickResult={onClickResult} />);

    press();
    hold();
    fireEvent.pointerUp(window);
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
    fireEvent.pointerUp(window);
    fireEvent.click(target());

    expect(onClickResult).toHaveBeenCalledWith(false);
  });

  it('never fires when disabled', () => {
    const onLongPress = vi.fn();
    render(<Probe onLongPress={onLongPress} enabled={false} />);

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

    fireEvent.pointerMove(window, { clientX: 140, clientY: 100 });
    expect(isHolding()).toBe(false);
  });

  it('never reports a hold for an ordinary tap', () => {
    render(<Probe onLongPress={vi.fn()} />);

    press();
    act(() => void vi.advanceTimersByTime(FEEDBACK_DELAY - 1));
    fireEvent.pointerUp(window);
    act(() => void vi.advanceTimersByTime(FEEDBACK_DELAY));

    expect(isHolding()).toBe(false);
  });

  it('never reports a hold when disabled', () => {
    render(<Probe onLongPress={vi.fn()} enabled={false} />);

    press();
    hold();

    expect(isHolding()).toBe(false);
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
