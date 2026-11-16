import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entranceMargin, useOnceInView } from '../useOnceInView';

// jsdom has no layout, so the test records each observer the hook registers
// and reports visibility to it by hand.
const observers: ObservingStub[] = [];

class ObservingStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin: string;
  readonly scrollMargin = '';
  readonly thresholds: number[];
  readonly targets: Element[] = [];
  disconnected = false;
  private readonly callback: IntersectionObserverCallback;

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '';
    const threshold = options?.threshold ?? 0;
    this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
    observers.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }

  report() {
    const rect = DOMRect.fromRect({ x: 0, y: 0, width: 600, height: 4000 });
    this.callback(
      this.targets.map(
        (target) =>
          ({
            target,
            isIntersecting: true,
            boundingClientRect: rect,
            // A section far taller than the window only ever shows a sliver.
            intersectionRatio: 0.02,
            intersectionRect: rect,
            rootBounds: null,
            time: 0,
          }) satisfies IntersectionObserverEntry,
      ),
      this,
    );
  }
}

function Probe() {
  const { ref, play } = useOnceInView<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="probe" data-play={String(play)}>
      section
    </div>
  );
}

const live = () => observers.filter((observer) => !observer.disconnected);

describe('useOnceInView', () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal('IntersectionObserver', ObservingStub);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('sets the entrance line a fifth of the screen height up, in px', () => {
    // A percentage margin would be resolved against the screen's width, which
    // on a wide, short window puts the line near the top.
    expect(entranceMargin(400)).toBe('0px 0px -80px 0px');
    render(<Probe />);
    expect(live().at(-1)?.rootMargin).toBe(entranceMargin(window.innerHeight));
  });

  it('plays once any part of the section crosses the line, however tall it is', () => {
    render(<Probe />);
    expect(live().at(-1)?.thresholds).toEqual([0]);
    act(() => live().at(-1)?.report());
    expect(screen.getByTestId('probe').dataset.play).toBe('true');
  });

  it('moves the line with the screen height when the window is resized', () => {
    render(<Probe />);
    const height = window.innerHeight;
    act(() => {
      window.innerHeight = 300;
      window.dispatchEvent(new Event('resize'));
    });
    expect(live().at(-1)?.rootMargin).toBe(entranceMargin(300));
    window.innerHeight = height;
  });
});
