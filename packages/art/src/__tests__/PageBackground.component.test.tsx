import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { ComponentPropsWithRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PageBackground,
  PageBackgroundProvider,
  usePageBackgroundTargetRef,
} from '../PageBackground/PageBackground';

const networkWeaveProps = vi.hoisted(() => vi.fn());
const motionDivProps = vi.hoisted(() => vi.fn());
const animateMock = vi.hoisted(() =>
  vi.fn(
    (
      start: unknown,
      _end: unknown,
      options?: { onUpdate?: (progress: number) => void },
    ) => {
      if (typeof start === 'number') options?.onUpdate?.(1);
      return { stop: () => {} };
    },
  ),
);
const motionState = vi.hoisted(() => {
  const state: {
    reduced: boolean;
    progress: number;
    scroll: number;
    scrollY: { get: () => number };
    scrollYProgress: { get: () => number };
  } = {
    reduced: false,
    progress: 0,
    scroll: 0,
    scrollY: { get: () => state.scroll },
    scrollYProgress: { get: () => state.progress },
  };

  return state;
});

type MockMotionValue = {
  get: () => number;
  set: (next: number) => void;
  on: () => () => void;
};

type MockMotionDivComponentProps = Omit<
  ComponentPropsWithRef<'div'>,
  'style'
> & {
  animate?: unknown;
  initial?: unknown;
  style?: unknown;
  transition?: unknown;
};

const createMotionValue = (initial: number): MockMotionValue => {
  let current = initial;
  return {
    get: () => current,
    set: (next: number) => {
      current = next;
    },
    on: () => () => {},
  };
};

function interpolateValue(
  input: number,
  inputRange: number[],
  outputRange: number[],
) {
  if (input <= (inputRange[0] ?? 0)) return outputRange[0] ?? 0;
  const lastIndex = inputRange.length - 1;
  if (input >= (inputRange[lastIndex] ?? 1)) {
    return outputRange[lastIndex] ?? 0;
  }

  const endIndex = inputRange.findIndex((rangeValue) => rangeValue >= input);
  const startIndex = Math.max(0, endIndex - 1);
  const rangeStart = inputRange[startIndex] ?? 0;
  const rangeEnd = inputRange[endIndex] ?? rangeStart;
  const outputStart = outputRange[startIndex] ?? 0;
  const outputEnd = outputRange[endIndex] ?? outputStart;
  const segmentProgress =
    rangeEnd === rangeStart
      ? 0
      : (input - rangeStart) / (rangeEnd - rangeStart);

  return outputStart + (outputEnd - outputStart) * segmentProgress;
}

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      animate,
      initial,
      style,
      transition,
      ...props
    }: MockMotionDivComponentProps) => {
      motionDivProps({ animate, initial, style, transition });
      return <div {...props} />;
    },
  },
  useReducedMotion: () => motionState.reduced,
  useScroll: () => ({
    scrollY: motionState.scrollY,
    scrollYProgress: motionState.scrollYProgress,
  }),
  useMotionValue: (initial: number) => createMotionValue(initial),
  useTransform: (
    input: MockMotionValue,
    inputRangeOrTransformer: number[] | ((value: number) => number),
    outputRange?: number[],
  ) =>
    createMotionValue(
      typeof inputRangeOrTransformer === 'function'
        ? inputRangeOrTransformer(input.get())
        : interpolateValue(
            input.get(),
            inputRangeOrTransformer,
            outputRange ?? [],
          ),
    ),
  useMotionTemplate: () => 'none',
  animate: animateMock,
}));

vi.mock('@codaco/art/NetworkWeaveBackground', () => ({
  default: (props: unknown) => {
    networkWeaveProps(props);
    return <div data-testid="network-weave-background" />;
  },
}));

const resizeObservers: MockResizeObserver[] = [];

class MockResizeObserver implements ResizeObserver {
  callback: ResizeObserverCallback;
  observe = vi.fn((_target: Element) => {});
  unobserve = vi.fn((_target: Element) => {});
  disconnect = vi.fn(() => {});

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  trigger() {
    this.callback([], this);
  }
}

const createRect = ({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
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

function BackgroundTarget() {
  const targetRef = usePageBackgroundTargetRef();

  return <div ref={targetRef} data-testid="background-target" />;
}

describe('PageBackground', () => {
  beforeEach(() => {
    networkWeaveProps.mockClear();
    motionDivProps.mockClear();
    animateMock.mockClear();
    motionState.reduced = false;
    motionState.progress = 0;
    motionState.scroll = 0;
    resizeObservers.length = 0;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a viewport-fixed network weave', () => {
    const { container } = render(<PageBackground />);
    const layer = container.firstElementChild as HTMLElement | null;

    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).toHaveClass(
      'pointer-events-none',
      'fixed',
      'inset-0',
      'z-1',
      'overflow-hidden',
    );
    expect(screen.getByTestId('network-weave-background')).toBeInTheDocument();
    expect(networkWeaveProps).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: 'networkcanvas.com',
        convergence: { x: 0.5, y: 0.6 },
        intensity: 0.4,
        flare: 1.8,
        speedFactor: 0.35,
        className: 'block',
      }),
    );
  });

  it('zooms in and fades out by the time the target leaves the viewport', () => {
    motionState.scroll = 300;
    const { rerender } = render(
      <PageBackground convergence={{ x: 0.2, y: 0.4 }} scrollFadeEnd={600} />,
    );

    const halfwayProps = motionDivProps.mock.lastCall?.[0] as {
      style: {
        opacity: MockMotionValue;
        scale: MockMotionValue;
        transformOrigin: string;
      };
    };
    expect(halfwayProps.style.opacity.get()).toBeCloseTo(0.5);
    expect(halfwayProps.style.scale.get()).toBeCloseTo(1.4);
    expect(halfwayProps.style.transformOrigin).toBe('20% 40%');

    motionState.scroll = 600;
    rerender(
      <PageBackground convergence={{ x: 0.2, y: 0.4 }} scrollFadeEnd={600} />,
    );

    const exitedProps = motionDivProps.mock.lastCall?.[0] as {
      style: { opacity: MockMotionValue; scale: MockMotionValue };
    };
    expect(exitedProps.style.opacity.get()).toBe(0);
    expect(exitedProps.style.scale.get()).toBeCloseTo(1.8);
    expect(networkWeaveProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.2, y: 0.4 },
        intensity: 0.4,
        flare: 1.8,
        speedFactor: 0.35,
      }),
    );
  });

  it('keeps the measured convergence stationary for reduced motion', () => {
    motionState.reduced = true;
    render(<PageBackground convergence={{ x: 0.2, y: 0.4 }} />);

    motionState.scroll = 300;
    const layerProps = motionDivProps.mock.lastCall?.[0] as {
      style: { scale: number };
    };

    expect(layerProps.style.scale).toBe(1);
    expect(networkWeaveProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.2, y: 0.4 },
        intensity: 0.4,
        flare: 1.8,
        speedFactor: 0.35,
      }),
    );
  });

  it('animates between target positions and intensities', () => {
    const { rerender } = render(
      <PageBackground
        convergence={{ x: 0.2, y: 0.4 }}
        intensity={0.4}
        motionMode="target"
        resolved
        targetChangeVersion={1}
      />,
    );

    animateMock.mockClear();
    rerender(
      <PageBackground
        convergence={{ x: 0.8, y: 0.7 }}
        intensity={0.1}
        motionMode="target"
        resolved
        targetChangeVersion={2}
      />,
    );

    expect(animateMock).toHaveBeenCalledWith(
      0,
      1,
      expect.objectContaining({
        type: 'spring',
        stiffness: 100,
        damping: 20,
      }),
    );
    const latestProps = networkWeaveProps.mock.lastCall?.[0] as {
      convergence: { x: number; y: number };
      intensity: number;
    };
    expect(latestProps.convergence).toEqual({ x: 0.8, y: 0.7 });
    expect(latestProps.intensity).toBeCloseTo(0.1);
  });

  it('updates the current target position immediately during scroll', () => {
    const { rerender } = render(
      <PageBackground
        convergence={{ x: 0.2, y: 0.4 }}
        intensity={0.1}
        motionMode="target"
        resolved
        targetChangeVersion={1}
      />,
    );

    animateMock.mockClear();
    rerender(
      <PageBackground
        convergence={{ x: 0.2, y: 0.2 }}
        intensity={0.1}
        motionMode="target"
        resolved
        targetChangeVersion={1}
      />,
    );

    expect(
      animateMock.mock.calls.some(([start, end]) => start === 0 && end === 1),
    ).toBe(false);
    expect(networkWeaveProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.2, y: 0.2 },
        intensity: 0.1,
      }),
    );
  });

  it('snaps to the first measured target before revealing the weave', () => {
    const { rerender } = render(
      <PageBackground motionMode="target" resolved={false} />,
    );

    animateMock.mockClear();
    rerender(
      <PageBackground
        convergence={{ x: 0.25, y: 0.75 }}
        motionMode="target"
        resolved
      />,
    );

    expect(
      animateMock.mock.calls.some(([start, end]) => start === 0 && end === 1),
    ).toBe(false);
    expect(networkWeaveProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ convergence: { x: 0.25, y: 0.75 } }),
    );
  });

  it('measures the target center in the hero layer coordinate space', () => {
    const layerRect = createRect({ left: 0, top: 0, width: 1000, height: 800 });
    const targetRect = createRect({
      left: 112,
      top: 216,
      width: 400,
      height: 300,
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        return (this as HTMLElement).dataset.testid === 'page-background-layer'
          ? layerRect
          : targetRect;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.testid === 'page-background-layer' ? 1000 : 400;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.testid === 'page-background-layer' ? 800 : 300;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.testid === 'background-target' ? 100 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.testid === 'background-target' ? 200 : 0;
      },
    );

    render(
      <PageBackgroundProvider>
        <BackgroundTarget />
      </PageBackgroundProvider>,
    );

    expect(networkWeaveProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.3, y: 0.4375 },
      }),
    );
  });

  it('updates for scroll and viewport changes and cleans up its observers', () => {
    let layerRect = createRect({ left: 0, top: 0, width: 1000, height: 800 });
    let targetRect = createRect({
      left: 100,
      top: 200,
      width: 400,
      height: 300,
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        return (this as HTMLElement).dataset.testid === 'page-background-layer'
          ? layerRect
          : targetRect;
      },
    );

    const { container, unmount } = render(
      <PageBackgroundProvider>
        <BackgroundTarget />
      </PageBackgroundProvider>,
    );
    const observer = resizeObservers.at(-1);
    const layer = container.querySelector(
      '[data-testid="page-background-layer"]',
    );
    const target = container.querySelector('[data-testid="background-target"]');

    expect(layer).not.toBeNull();
    expect(target).not.toBeNull();
    expect(observer?.observe).toHaveBeenCalledWith(layer);
    expect(observer?.observe).toHaveBeenCalledWith(target);

    layerRect = createRect({ left: 0, top: 0, width: 800, height: 600 });
    targetRect = createRect({
      left: 300,
      top: 100,
      width: 400,
      height: 300,
    });
    act(() => {
      fireEvent(window, new Event('resize'));
    });

    const latestProps = networkWeaveProps.mock.lastCall?.[0] as {
      convergence: { x: number; y: number };
    };
    expect(latestProps.convergence.x).toBeCloseTo(0.625);
    expect(latestProps.convergence.y).toBeCloseTo(0.4167);

    targetRect = createRect({
      left: 300,
      top: -50,
      width: 400,
      height: 300,
    });
    act(() => {
      fireEvent.scroll(window);
    });

    const scrolledProps = networkWeaveProps.mock.lastCall?.[0] as {
      convergence: { x: number; y: number };
    };
    expect(scrolledProps.convergence.x).toBeCloseTo(0.625);
    expect(scrolledProps.convergence.y).toBeCloseTo(0.1667);
    expect(
      animateMock.mock.calls.filter(
        ([start, end]) => typeof start === 'object' && end === 0,
      ),
    ).toHaveLength(1);

    targetRect = createRect({
      left: 300,
      top: -300,
      width: 400,
      height: 300,
    });
    act(() => {
      fireEvent.scroll(window);
    });

    const detachedProps = networkWeaveProps.mock.lastCall?.[0] as {
      convergence: { x: number; y: number };
    };
    expect(detachedProps.convergence.x).toBeCloseTo(0.625);
    expect(detachedProps.convergence.y).toBe(0);

    targetRect = createRect({
      left: 300,
      top: -500,
      width: 400,
      height: 300,
    });
    act(() => {
      fireEvent.scroll(window);
    });

    expect(networkWeaveProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.625, y: 0 },
      }),
    );

    unmount();
    expect(observer?.disconnect).toHaveBeenCalledOnce();
  });

  it('is fully faded when the initial target is above the viewport', () => {
    motionState.scroll = 500;
    const layerRect = createRect({ left: 0, top: 0, width: 1000, height: 800 });
    const targetRect = createRect({
      left: 100,
      top: -500,
      width: 400,
      height: 100,
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        return (this as HTMLElement).dataset.testid === 'page-background-layer'
          ? layerRect
          : targetRect;
      },
    );

    render(
      <PageBackgroundProvider>
        <BackgroundTarget />
      </PageBackgroundProvider>,
    );

    const latestProps = networkWeaveProps.mock.lastCall?.[0] as {
      convergence: { x: number; y: number };
      intensity: number;
    };
    const layerProps = motionDivProps.mock.lastCall?.[0] as {
      style: { opacity: MockMotionValue };
    };
    expect(latestProps.convergence).toEqual({ x: 0.5, y: 0.6 });
    expect(latestProps.intensity).toBeCloseTo(0.4);
    expect(layerProps.style.opacity.get()).toBe(0);
    expect(
      animateMock.mock.calls.some(
        ([start, end]) => typeof start === 'object' && end === 0,
      ),
    ).toBe(true);
  });

  it('keeps the last finite coordinates when the layer has no size', () => {
    let layerRect = createRect({ left: 0, top: 0, width: 1000, height: 800 });
    const targetRect = createRect({
      left: 100,
      top: 200,
      width: 400,
      height: 300,
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        return (this as HTMLElement).dataset.testid === 'page-background-layer'
          ? layerRect
          : targetRect;
      },
    );

    render(
      <PageBackgroundProvider>
        <BackgroundTarget />
      </PageBackgroundProvider>,
    );
    layerRect = createRect({ left: 0, top: 0, width: 0, height: 0 });

    act(() => resizeObservers.at(-1)?.trigger());

    expect(networkWeaveProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        convergence: { x: 0.3, y: 0.4375 },
      }),
    );
  });

  it('uses the stable fallback when no target registers', () => {
    render(
      <PageBackgroundProvider>
        <div />
      </PageBackgroundProvider>,
    );

    expect(networkWeaveProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ convergence: { x: 0.5, y: 0.6 } }),
    );
    expect(resizeObservers).toHaveLength(0);
  });
});
