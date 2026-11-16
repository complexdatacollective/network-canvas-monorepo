import { act, cleanup, render } from '@testing-library/react';
import type { MotionValue } from 'motion/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PageBackgroundVisibilityProvider,
  sectionCoverage,
  useHidePageBackground,
  usePageBackgroundOpacity,
} from '../pageBackgroundVisibility';

const VIEWPORT = 1000;

describe('sectionCoverage', () => {
  it.each([
    ['still below the viewport', VIEWPORT, VIEWPORT + 500, 0],
    ['top 30% of the way up the viewport', 700, 3000, 0.5],
    ['top 60% of the way up the viewport', 400, 3000, 1],
    ['filling the viewport', -500, 3000, 1],
    ['bottom 30% of the way down the viewport', -2000, 300, 0.5],
    ['scrolled past', -3000, 0, 0],
  ])('%s', (_label, top, bottom, expected) => {
    expect(sectionCoverage(top, bottom, VIEWPORT)).toBeCloseTo(expected);
  });
});

describe('PageBackgroundVisibilityProvider', () => {
  let sectionBox = { top: 0, bottom: 0 };
  let opacity: MotionValue<number> | null = null;

  function Probe() {
    opacity = usePageBackgroundOpacity();
    return null;
  }

  function HidingSection({ hides }: { hides: boolean }) {
    const ref = useRef<HTMLElement>(null);
    useHidePageBackground(ref, hides);
    return <section ref={ref} data-hides-background />;
  }

  function Page({
    withSection,
    hides = true,
  }: {
    withSection: boolean;
    hides?: boolean;
  }) {
    return (
      <PageBackgroundVisibilityProvider>
        <Probe />
        {withSection ? <HidingSection hides={hides} /> : null}
      </PageBackgroundVisibilityProvider>
    );
  }

  beforeEach(() => {
    opacity = null;
    vi.stubGlobal('innerHeight', VIEWPORT);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(performance.now()));
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function getRect(this: Element) {
        if (!this.hasAttribute('data-hides-background')) return new DOMRect();
        const { top, bottom } = sectionBox;
        return DOMRect.fromRect({
          x: 0,
          y: top,
          width: 0,
          height: bottom - top,
        });
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('hides the background while a registered section fills the viewport', () => {
    sectionBox = { top: -500, bottom: 3000 };
    render(<Page withSection />);

    expect(opacity?.get()).toBe(0);
  });

  it('follows the section as the page scrolls', async () => {
    sectionBox = { top: VIEWPORT + 200, bottom: VIEWPORT + 3000 };
    render(<Page withSection />);
    expect(opacity?.get()).toBe(1);

    sectionBox = { top: 700, bottom: 3000 };
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });
    expect(opacity?.get()).toBeCloseTo(0.5);
  });

  it('brings the background back when the section unmounts', () => {
    sectionBox = { top: -500, bottom: 3000 };
    const { rerender } = render(<Page withSection />);
    expect(opacity?.get()).toBe(0);

    rerender(<Page withSection={false} />);

    expect(opacity?.get()).toBe(1);
  });

  it('brings the background back when the section stops asking to hide it', () => {
    sectionBox = { top: -500, bottom: 3000 };
    const { rerender } = render(<Page withSection />);
    expect(opacity?.get()).toBe(0);

    rerender(<Page withSection hides={false} />);

    expect(opacity?.get()).toBe(1);
  });

  it('leaves the background alone outside a provider', () => {
    render(<Probe />);

    expect(opacity).toBeNull();
  });
});
