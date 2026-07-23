import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomepagePageBackground } from '../HomepagePageBackground';

type MockPageBackgroundProps = {
  convergence: { x: number; y: number };
  flare: number;
  intensity: number;
  layerRef: RefObject<HTMLDivElement | null>;
};

const { motionPreferences, pageBackgroundRender } = vi.hoisted(() => ({
  motionPreferences: { shouldReduce: false },
  pageBackgroundRender: vi.fn((props: MockPageBackgroundProps) => props),
}));

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

        if (
          this instanceof HTMLElement &&
          this.hasAttribute('data-homepage-weave-target')
        ) {
          return new DOMRect(400, 200 - window.scrollY, 200, 200);
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
});
