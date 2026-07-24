import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomepagePageBackground } from '../HomepagePageBackground';

type MockPageBackgroundProps = {
  convergence: { x: number; y: number };
  flare: number;
  intensity: number;
  layerRef: RefObject<HTMLDivElement | null>;
  resolved: boolean;
};

const { motionPreferences, pageBackgroundRender } = vi.hoisted(() => ({
  motionPreferences: { shouldReduce: false },
  pageBackgroundRender: vi.fn((props: MockPageBackgroundProps) => props),
}));

let targetLayout = {
  height: 200,
  left: 400,
  top: 200,
  width: 200,
};

vi.mock('motion/react', () => ({
  useReducedMotion: () => motionPreferences.shouldReduce,
}));

vi.mock('@codaco/art', () => ({
  PageBackground: (props: MockPageBackgroundProps) => {
    pageBackgroundRender(props);
    return <div ref={props.layerRef} data-testid="page-background-layer" />;
  },
}));

function getLatestBackgroundProps() {
  const props = pageBackgroundRender.mock.calls.at(-1)?.[0];
  if (!props) throw new Error('Page background did not render');
  return props;
}

describe('HomepagePageBackground', () => {
  beforeEach(() => {
    motionPreferences.shouldReduce = false;
    pageBackgroundRender.mockClear();
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
      writable: true,
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(performance.now()));
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    targetLayout = {
      height: 200,
      left: 400,
      top: 200,
      width: 200,
    };
    const isTarget = (element: HTMLElement) =>
      element.hasAttribute('data-homepage-weave-target') ||
      element.hasAttribute('data-get-started-weave-target');
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function getOffsetHeight(this: HTMLElement) {
        return isTarget(this) ? targetLayout.height : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(
      function getOffsetLeft(this: HTMLElement) {
        return isTarget(this) ? targetLayout.left : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(
      function getOffsetTop(this: HTMLElement) {
        return isTarget(this) ? targetLayout.top : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
      function getOffsetWidth(this: HTMLElement) {
        return isTarget(this) ? targetLayout.width : 0;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lets the focal point continue toward the origin after the hero exits', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: Element) {
        if (
          this instanceof HTMLElement &&
          this.dataset.testid === 'page-background-layer'
        ) {
          return new DOMRect(0, 0, 1000, 1000);
        }

        return new DOMRect();
      },
    );

    render(
      <>
        <div data-homepage-weave-target />
        <HomepagePageBackground />
      </>,
    );

    expect(getLatestBackgroundProps().convergence).toEqual({
      x: 0.5,
      y: 0.3,
    });

    act(() => {
      window.scrollY = 400;
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      const background = getLatestBackgroundProps();
      expect(background.intensity).toBeCloseTo(0.15);
      expect(background.flare).toBe(4.08);
      expect(background.convergence.x).toBeCloseTo(0.2143, 4);
      expect(background.convergence.y).toBeCloseTo(0.1286, 4);
    });

    act(() => {
      window.scrollY = 700;
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      expect(getLatestBackgroundProps().convergence).toEqual({ x: 0, y: 0 });
    });
  });

  it('keeps the weave hidden until the homepage entrance begins', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: Element) {
        if (
          this instanceof HTMLElement &&
          this.dataset.testid === 'page-background-layer'
        ) {
          return new DOMRect(0, 0, 1000, 1000);
        }

        return new DOMRect();
      },
    );

    const { rerender } = render(
      <>
        <div data-homepage-weave-target />
        <HomepagePageBackground reveal={false} />
      </>,
    );

    expect(getLatestBackgroundProps().resolved).toBe(false);

    rerender(
      <>
        <div data-homepage-weave-target />
        <HomepagePageBackground reveal />
      </>,
    );

    expect(getLatestBackgroundProps().resolved).toBe(true);
  });

  it('anchors the weave to a page-specific hero target', () => {
    targetLayout = {
      height: 300,
      left: 200,
      top: 100,
      width: 400,
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: Element) {
        if (
          this instanceof HTMLElement &&
          this.dataset.testid === 'page-background-layer'
        ) {
          return new DOMRect(0, 0, 1000, 1000);
        }

        return new DOMRect();
      },
    );

    render(
      <>
        <div data-get-started-weave-target />
        <HomepagePageBackground target="[data-get-started-weave-target]" />
      </>,
    );

    expect(getLatestBackgroundProps().convergence).toEqual({
      x: 0.4,
      y: 0.25,
    });
  });

  it('ignores visual transforms when measuring the hero anchor', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: Element) {
        if (
          this instanceof HTMLElement &&
          this.dataset.testid === 'page-background-layer'
        ) {
          return new DOMRect(0, 0, 1000, 1000);
        }

        if (
          this instanceof HTMLElement &&
          this.hasAttribute('data-homepage-weave-target')
        ) {
          return new DOMRect(360, 104 - window.scrollY, 184, 184);
        }

        return new DOMRect();
      },
    );

    render(
      <>
        <div data-homepage-weave-target />
        <HomepagePageBackground />
      </>,
    );

    expect(getLatestBackgroundProps().convergence).toEqual({
      x: 0.5,
      y: 0.3,
    });

    act(() => {
      window.scrollY = 200;
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      const background = getLatestBackgroundProps();
      expect(background.convergence.x).toBeCloseTo(0.3571, 4);
      expect(background.convergence.y).toBeCloseTo(0.2143, 4);
    });
  });

  it('preserves the default reveal for reduced-motion contexts', () => {
    motionPreferences.shouldReduce = true;

    render(<HomepagePageBackground />);

    expect(getLatestBackgroundProps().resolved).toBe(true);
  });
});
