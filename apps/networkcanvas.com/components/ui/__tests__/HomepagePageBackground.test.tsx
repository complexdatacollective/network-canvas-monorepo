import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type * as MotionReact from 'motion/react';
import type { Ref } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomepagePageBackground } from '../HomepagePageBackground';
import { ScrollLinkedPageBackground } from '../ScrollLinkedPageBackground';

const pageBackgroundProps = vi.hoisted(() => vi.fn());
const reducedMotionState = vi.hoisted(() => ({ reduced: false }));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  return {
    ...actual,
    useReducedMotion: () => reducedMotionState.reduced,
  };
});

vi.mock('@codaco/art', () => ({
  PageBackground: ({
    layerRef,
    ...props
  }: {
    layerRef: Ref<HTMLDivElement>;
    convergence: { x: number; y: number };
    complexity: number;
    intensity: number;
    flare: number;
    speedFactor: number;
    motionMode: string;
    resolved: boolean;
    targetChangeVersion: number;
  }) => {
    pageBackgroundProps(props);
    return <div ref={layerRef} data-testid="page-background-layer" />;
  },
}));

class MockResizeObserver implements ResizeObserver {
  callback: ResizeObserverCallback;
  observe = vi.fn((_target: Element) => {});
  unobserve = vi.fn((_target: Element) => {});
  disconnect = vi.fn(() => {});

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
}

const createRect = ({
  left = 0,
  top,
  width = 200,
  height = 200,
}: {
  left?: number;
  top: number;
  width?: number;
  height?: number;
}): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  toJSON: () => ({}),
});

describe('HomepagePageBackground', () => {
  const targetRects = new Map<string, DOMRect>();

  beforeEach(() => {
    pageBackgroundProps.mockClear();
    reducedMotionState.reduced = false;
    targetRects.clear();
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        const element = this as HTMLElement;
        if (element.dataset.testid === 'page-background-layer') {
          return createRect({ top: 0, width: 1000, height: 800 });
        }

        return (
          targetRects.get(element.dataset.target ?? '') ??
          createRect({ top: 1000 })
        );
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('links each target handoff to its progress across the viewport midpoint', () => {
    targetRects.set(
      'hero',
      createRect({ left: 100, top: 300, width: 400, height: 300 }),
    );
    targetRects.set(
      'heading',
      createRect({ left: 500, top: 900, width: 300, height: 100 }),
    );
    targetRects.set(
      'carousel',
      createRect({ left: 200, top: 1800, width: 600, height: 350 }),
    );

    render(
      <>
        <HomepagePageBackground />
        <div data-homepage-weave-target data-target="hero" />
        <div data-homepage-weave-target data-target="heading" />
        <div data-homepage-weave-target data-target="carousel" />
      </>,
    );

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.3, y: 0.5625 },
        motionMode: 'target',
        resolved: true,
      }),
    );

    targetRects.set(
      'hero',
      createRect({ left: 100, top: 100, width: 400, height: 300 }),
    );
    targetRects.set(
      'heading',
      createRect({ left: 500, top: 600, width: 300, height: 100 }),
    );
    void act(() => fireEvent.scroll(window));

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.43125, y: 0.5 },
      }),
    );

    targetRects.set(
      'heading',
      createRect({ left: 500, top: 350, width: 300, height: 100 }),
    );
    targetRects.set(
      'carousel',
      createRect({ left: 200, top: 750, width: 600, height: 350 }),
    );
    void act(() => fireEvent.scroll(window));

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.65, y: 0.5 },
      }),
    );
  });

  it('stays centered once the final target reaches the viewport midpoint', () => {
    targetRects.set(
      'hero',
      createRect({ left: 100, top: -1000, width: 400, height: 300 }),
    );
    targetRects.set(
      'carousel',
      createRect({ left: 200, top: 225, width: 600, height: 350 }),
    );

    render(
      <>
        <HomepagePageBackground />
        <div data-homepage-weave-target data-target="hero" />
        <div data-homepage-weave-target data-target="carousel" />
      </>,
    );

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.5, y: 0.5 },
        motionMode: 'target',
        resolved: true,
      }),
    );

    targetRects.set(
      'carousel',
      createRect({ left: 200, top: -400, width: 600, height: 350 }),
    );
    void act(() => fireEvent.scroll(window));

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.5, y: 0.5 },
      }),
    );
  });

  it('holds the design-principles focus until the sticky card nears the viewport edge', () => {
    targetRects.set(
      'hero',
      createRect({ left: 100, top: -1000, width: 400, height: 300 }),
    );
    targetRects.set(
      'principles',
      createRect({ left: 100, top: 40, width: 300, height: 200 }),
    );
    targetRects.set(
      'grants',
      createRect({ left: 600, top: 1200, width: 300, height: 300 }),
    );

    render(
      <>
        <HomepagePageBackground />
        <div data-homepage-weave-target data-target="hero" />
        <div
          data-homepage-weave-target
          data-homepage-weave-hold-until-exit
          data-target="principles"
        />
        <div data-homepage-weave-target data-target="grants" />
      </>,
    );

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.25, y: 0.175 },
      }),
    );

    targetRects.set(
      'principles',
      createRect({ left: 100, top: -200, width: 300, height: 200 }),
    );
    targetRects.set(
      'grants',
      createRect({ left: 600, top: 960, width: 300, height: 300 }),
    );
    void act(() => fireEvent.scroll(window));

    const releasedConvergence = pageBackgroundProps.mock.lastCall?.[0]
      ?.convergence as { x: number; y: number } | undefined;
    expect(releasedConvergence?.x).toBeGreaterThan(0.25);
    expect(releasedConvergence?.y).toBeGreaterThan(0.165);
  });

  it('traces a scroll-linked figure eight after the final get-started target', () => {
    let scrollY = 0;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(
      3200,
    );
    targetRects.set(
      'intro',
      createRect({ left: 200, top: 50, width: 600, height: 100 }),
    );
    targetRects.set(
      'starting-cards',
      createRect({ left: 100, top: 550, width: 800, height: 100 }),
    );
    targetRects.set(
      'starting-card',
      createRect({ left: 700, top: 250, width: 100, height: 100 }),
    );

    const { getByTestId } = render(
      <>
        <ScrollLinkedPageBackground
          targetSelector="[data-get-started-weave-target]"
          interactiveTargetSelector="[data-get-started-weave-interactive-target]"
          parameterProfile="get-started"
          postTargetBehavior="figure-eight"
        />
        <div data-get-started-weave-target data-target="intro" />
        <div data-get-started-weave-target data-target="starting-cards" />
        <button
          type="button"
          aria-label="Starting card"
          data-get-started-weave-interactive-target
          data-target="starting-card"
          data-testid="starting-card"
        />
      </>,
    );

    void act(() => fireEvent.pointerEnter(getByTestId('starting-card')));
    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.75, y: 0.375 },
      }),
    );

    scrollY = 250;
    targetRects.set(
      'intro',
      createRect({ left: 200, top: -200, width: 600, height: 100 }),
    );
    targetRects.set(
      'starting-cards',
      createRect({ left: 100, top: 100, width: 800, height: 100 }),
    );
    void act(() => fireEvent.scroll(window));

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.75, y: 0.375 },
      }),
    );

    scrollY = 750;
    targetRects.set(
      'intro',
      createRect({ left: 200, top: -700, width: 600, height: 100 }),
    );
    targetRects.set(
      'starting-cards',
      createRect({ left: 100, top: -200, width: 800, height: 100 }),
    );
    targetRects.set(
      'starting-card',
      createRect({ left: 700, top: -500, width: 100, height: 100 }),
    );
    void act(() => fireEvent.scroll(window));

    const lastProps = pageBackgroundProps.mock.lastCall?.[0];
    expect(lastProps?.convergence.x).toBeCloseTo(0.72);
    expect(lastProps?.convergence.y).toBeCloseTo(0.5);
    expect(lastProps?.complexity).toBe(20);
    expect(lastProps?.intensity).toBeCloseTo(0.19125);
    expect(lastProps?.flare).toBeCloseTo(2.54);
    expect(lastProps?.speedFactor).toBeCloseTo(0.24);
  });

  it('reduces intensity and varies flare with scroll while keeping complexity and speed fixed', () => {
    let scrollY = 0;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
    targetRects.set(
      'hero',
      createRect({ left: 100, top: 300, width: 400, height: 300 }),
    );
    targetRects.set(
      'heading',
      createRect({ left: 500, top: 900, width: 300, height: 100 }),
    );

    render(
      <>
        <HomepagePageBackground />
        <div data-homepage-weave-target data-target="hero" />
        <div data-homepage-weave-target data-target="heading" />
      </>,
    );

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        complexity: 20,
        intensity: 0.62,
        flare: 1.45,
        speedFactor: 0.28,
      }),
    );

    targetRects.set(
      'hero',
      createRect({ left: 100, top: 100, width: 400, height: 300 }),
    );
    targetRects.set(
      'heading',
      createRect({ left: 500, top: 500, width: 300, height: 100 }),
    );
    scrollY = 400;
    void act(() => fireEvent.scroll(window));

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        complexity: 20,
        intensity: 0.44,
        flare: 2.42,
        speedFactor: 0.28,
      }),
    );

    targetRects.set(
      'hero',
      createRect({ left: 100, top: -400, width: 400, height: 300 }),
    );
    targetRects.set(
      'heading',
      createRect({ left: 500, top: 350, width: 300, height: 100 }),
    );
    scrollY = 800;
    void act(() => fireEvent.scroll(window));

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        complexity: 20,
        intensity: 0.26,
        flare: 2.08,
        speedFactor: 0.28,
      }),
    );
    for (const [{ flare, intensity }] of pageBackgroundProps.mock.calls) {
      expect(flare).toBeGreaterThanOrEqual(1.45);
      expect(intensity).toBeGreaterThanOrEqual(0.26);
      expect(intensity).toBeLessThanOrEqual(0.62);
    }
  });

  it('uses a static low-intensity background for reduced motion', () => {
    reducedMotionState.reduced = true;
    targetRects.set(
      'hero',
      createRect({ left: 100, top: 300, width: 400, height: 300 }),
    );

    render(
      <>
        <HomepagePageBackground />
        <div data-homepage-weave-target data-target="hero" />
      </>,
    );

    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.5, y: 0.5 },
        intensity: 0.26,
        flare: 1.45,
        resolved: true,
      }),
    );
    const renderCount = pageBackgroundProps.mock.calls.length;

    targetRects.set(
      'hero',
      createRect({ left: 600, top: -300, width: 400, height: 300 }),
    );
    void act(() => fireEvent.scroll(window));

    expect(pageBackgroundProps).toHaveBeenCalledTimes(renderCount);
  });

  it('tracks the hovered or focused team member and springs back to center', () => {
    targetRects.set(
      'hero',
      createRect({ left: 100, top: -1000, width: 400, height: 300 }),
    );
    targetRects.set(
      'carousel',
      createRect({ left: 200, top: -400, width: 600, height: 350 }),
    );
    targetRects.set(
      'first-member',
      createRect({ left: 100, top: 200, width: 100, height: 100 }),
    );
    targetRects.set(
      'second-member',
      createRect({ left: 700, top: 400, width: 100, height: 100 }),
    );

    const { getByTestId } = render(
      <>
        <HomepagePageBackground />
        <div data-homepage-weave-target data-target="hero" />
        <div data-homepage-weave-target data-target="carousel" />
        <button
          type="button"
          aria-label="First member"
          data-homepage-weave-interactive-target
          data-target="first-member"
          data-testid="first-member"
        />
        <button
          type="button"
          aria-label="Second member"
          data-homepage-weave-interactive-target
          data-target="second-member"
          data-testid="second-member"
        />
      </>,
    );

    void act(() => fireEvent.pointerEnter(getByTestId('first-member')));
    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.15, y: 0.3125 },
        intensity: 0.84,
        targetChangeVersion: 1,
      }),
    );

    act(() => getByTestId('second-member').focus());
    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.75, y: 0.5625 },
        intensity: 0.84,
        targetChangeVersion: 2,
      }),
    );

    act(() => getByTestId('second-member').blur());
    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.15, y: 0.3125 },
        intensity: 0.84,
        targetChangeVersion: 3,
      }),
    );

    void act(() => fireEvent.pointerLeave(getByTestId('first-member')));
    expect(pageBackgroundProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.5, y: 0.5 },
        intensity: 0.62,
        targetChangeVersion: 4,
      }),
    );
  });

  it('moves marked target focus points within their cards as the page scrolls', () => {
    targetRects.set(
      'app-card',
      createRect({ left: 100, top: 200, width: 600, height: 400 }),
    );
    targetRects.set(
      'next',
      createRect({ left: 700, top: 1800, width: 200, height: 200 }),
    );

    render(
      <>
        <ScrollLinkedPageBackground
          targetSelector="[data-moving-test-target]"
          movingTargetSelector="[data-moving-test]"
        />
        <div data-moving-test-target data-moving-test data-target="app-card" />
        <div data-moving-test-target data-target="next" />
      </>,
    );

    const initialConvergence = pageBackgroundProps.mock.lastCall?.[0]
      ?.convergence as { x: number; y: number };
    expect(initialConvergence).toEqual({ x: 0.4, y: 0.4 });

    targetRects.set(
      'app-card',
      createRect({ left: 100, top: 100, width: 600, height: 400 }),
    );
    targetRects.set(
      'next',
      createRect({ left: 700, top: 1700, width: 200, height: 200 }),
    );
    void act(() => fireEvent.scroll(window));

    const scrolledConvergence = pageBackgroundProps.mock.lastCall?.[0]
      ?.convergence as { x: number; y: number };
    expect(scrolledConvergence.x).toBeGreaterThan(0.1);
    expect(scrolledConvergence.x).toBeLessThan(0.7);
    expect(scrolledConvergence.y).toBeGreaterThan(0.125);
    expect(scrolledConvergence.y).toBeLessThan(0.625);
    expect(scrolledConvergence).not.toEqual(initialConvergence);
  });
});
