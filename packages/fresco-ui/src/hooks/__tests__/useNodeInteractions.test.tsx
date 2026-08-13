import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNodeInteractions } from '../useNodeInteractions';

function Probe() {
  const { scope, nodeProps, isPressed } = useNodeInteractions({
    hasClickHandler: true,
  });
  return (
    <button
      type="button"
      ref={scope as React.RefObject<HTMLButtonElement>}
      data-pressed={isPressed}
      {...nodeProps}
    >
      Node
    </button>
  );
}

const node = () => screen.getByRole('button', { name: 'Node' });
const pressed = () => node().getAttribute('data-pressed');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useNodeInteractions: minimum visible key press', () => {
  it('holds a quick key tap depressed until it has been seen', () => {
    render(<Probe />);

    fireEvent.keyDown(node(), { key: 'Enter' });
    expect(pressed()).toBe('true');

    // Released almost immediately — faster than the press could show.
    fireEvent.keyUp(node(), { key: 'Enter' });
    expect(pressed()).toBe('true');

    act(() => void vi.advanceTimersByTime(160));
    expect(pressed()).toBe('false');
  });

  it('releases a dwelled key press immediately', () => {
    render(<Probe />);

    fireEvent.keyDown(node(), { key: ' ' });
    act(() => void vi.advanceTimersByTime(200));
    fireEvent.keyUp(node(), { key: ' ' });

    expect(pressed()).toBe('false');
  });

  it('lets a new key press cancel the held-back release', () => {
    render(<Probe />);

    fireEvent.keyDown(node(), { key: 'Enter' });
    fireEvent.keyUp(node(), { key: 'Enter' });
    fireEvent.keyDown(node(), { key: 'Enter' });

    // The first tap's delayed release must not pop the new press.
    act(() => void vi.advanceTimersByTime(300));
    expect(pressed()).toBe('true');
  });

  it('lifts the press when the window takes the pointer away', () => {
    render(<Probe />);

    fireEvent.pointerDown(node(), { button: 0 });
    expect(pressed()).toBe('true');

    // An app switch mid-press: no pointerup, pointercancel or keyup will
    // ever arrive for this press.
    fireEvent.blur(window);

    expect(pressed()).toBe('false');
  });

  it('lifts a key press held back by the dwell when the window blurs', () => {
    render(<Probe />);

    fireEvent.keyDown(node(), { key: 'Enter' });
    fireEvent.keyUp(node(), { key: 'Enter' });
    fireEvent.blur(window);

    expect(pressed()).toBe('false');
  });

  it('lifts a key press when activation moves focus before keyup', () => {
    render(
      <>
        <Probe />
        <button type="button">Dialog field</button>
      </>,
    );

    const button = node();
    const dialogField = screen.getByRole('button', { name: 'Dialog field' });
    button.focus();
    act(() => {
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      // Enter can synchronously open a form whose autofocus target receives
      // the eventual keyup. Blur therefore happens before the key-down state
      // has committed a render.
      dialogField.focus();
    });

    expect(pressed()).toBe('false');
  });

  it('lets a pointer press cancel the held-back release', () => {
    render(<Probe />);

    fireEvent.keyDown(node(), { key: 'Enter' });
    fireEvent.keyUp(node(), { key: 'Enter' });
    fireEvent.pointerDown(node(), { button: 0 });

    act(() => void vi.advanceTimersByTime(300));
    expect(pressed()).toBe('true');

    fireEvent.pointerUp(node());
    expect(pressed()).toBe('false');
  });
});
