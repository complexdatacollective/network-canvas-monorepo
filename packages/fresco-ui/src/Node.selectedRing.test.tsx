import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Node from './Node';

const animateCalls: unknown[][] = [];
// The calls whose animations are still running: unmounting stops every one,
// as Motion's `useAnimate` does in its cleanup.
const running = new Set<unknown[]>();

// The ring is a box-shadow animation on the shape layer; jsdom has no layout
// or animation, so the choreography is observed through the animate calls.
vi.mock('./hooks/useSafeAnimate', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('./hooks/useSafeAnimate')>();
  return {
    ...original,
    useSafeAnimate: <T extends Element>() => {
      const scope = { current: document.createElement('span') };
      useEffect(() => () => running.clear(), []);
      const animate = (...args: unknown[]) => {
        animateCalls.push(args);
        running.add(args);
        return { stop: () => undefined };
      };
      return [scope, animate] as unknown as ReturnType<
        typeof original.useSafeAnimate<T>
      >;
    },
  };
});

const ringCalls = () =>
  animateCalls.filter(([, keyframes]) =>
    JSON.stringify(keyframes ?? '').includes('boxShadow'),
  );

beforeEach(() => {
  animateCalls.length = 0;
  running.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Node selected ring choreography', () => {
  it('lands the ring when the press that caused it lifts', () => {
    const { rerender } = render(
      <Node label="Ash" onClick={vi.fn()} selected={false} />,
    );
    const node = screen.getByRole('button');

    // Keyboard activation: state toggles while the node is still depressed.
    fireEvent.keyDown(node, { key: ' ' });
    rerender(<Node label="Ash" onClick={vi.fn()} selected />);

    // The announcement is immediate; the ring is not.
    expect(node).toHaveAttribute('aria-pressed', 'true');
    expect(ringCalls()).toHaveLength(0);

    // Release; the held-back key release lifts the press, and the ring lands.
    fireEvent.keyUp(node, { key: ' ' });
    act(() => void vi.advanceTimersByTime(200));
    expect(ringCalls().length).toBeGreaterThan(0);
  });

  it('lands the ring when the window ends the press instead of a release', () => {
    const { rerender } = render(
      <Node label="Ash" onClick={vi.fn()} selected={false} />,
    );
    const node = screen.getByRole('button');

    fireEvent.pointerDown(node, { button: 0 });
    rerender(<Node label="Ash" onClick={vi.fn()} selected />);
    expect(ringCalls()).toHaveLength(0);

    // The press is ended by losing the window, not by a release. Deferring
    // the ring until a release that will never arrive would strand it.
    fireEvent.blur(window);

    expect(ringCalls().length).toBeGreaterThan(0);
  });

  it('shows the ring immediately when selection changes without a press', () => {
    const { rerender } = render(
      <Node label="Ash" onClick={vi.fn()} selected={false} />,
    );

    rerender(<Node label="Ash" onClick={vi.fn()} selected />);

    expect(ringCalls().length).toBeGreaterThan(0);
  });

  it('springs the ring in once, however many reasons there are to show it', () => {
    const { rerender } = render(
      <Node label="Ash" onClick={vi.fn()} selected={false} />,
    );

    rerender(<Node label="Ash" onClick={vi.fn()} selected />);
    expect(ringCalls()).toHaveLength(1);

    // Highlighting a node whose ring already shows changes nothing about the
    // ring, and neither does withdrawing one of two reasons for it.
    rerender(<Node label="Ash" onClick={vi.fn()} selected highlighted />);
    rerender(
      <Node label="Ash" onClick={vi.fn()} selected={false} highlighted />,
    );
    expect(ringCalls()).toHaveLength(1);

    // The last reason going retracts it.
    rerender(<Node label="Ash" onClick={vi.fn()} selected={false} />);
    expect(ringCalls()).toHaveLength(2);
  });

  it('springs the ring in again when a node mounted selected is mounted again', () => {
    // StrictMode mounts, unmounts and mounts again, and the unmount stops
    // the first spring.
    render(
      <StrictMode>
        <Node label="Ash" onClick={vi.fn()} selected />
      </StrictMode>,
    );

    const springing = [...running].filter(([, keyframes]) =>
      JSON.stringify(keyframes ?? '').includes('var(--selected)'),
    );
    expect(springing).toHaveLength(1);
  });
});
