import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Node from './Node';

const animateCalls: unknown[][] = [];

// The ring is a box-shadow animation on the shape layer; jsdom has no layout
// or animation, so the choreography is observed through the animate calls.
vi.mock('./hooks/useSafeAnimate', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('./hooks/useSafeAnimate')>();
  return {
    ...original,
    useSafeAnimate: <T extends Element>() => {
      const scope = { current: document.createElement('span') };
      const animate = (...args: unknown[]) => {
        animateCalls.push(args);
        return { then: () => undefined };
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

  it('shows the ring immediately when selection changes without a press', () => {
    const { rerender } = render(
      <Node label="Ash" onClick={vi.fn()} selected={false} />,
    );

    rerender(<Node label="Ash" onClick={vi.fn()} selected />);

    expect(ringCalls().length).toBeGreaterThan(0);
  });
});
