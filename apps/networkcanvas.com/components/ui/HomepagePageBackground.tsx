'use client';

import { useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';

import { PageBackground } from '@codaco/art';
import type { NetworkWeaveConvergence } from '@codaco/art/NetworkWeaveBackground';

// The hero video is the weave's only focal anchor. On load the weave knits
// inward to it; then, as the hero scrolls away, the focus follows a longer path
// to the viewport origin and rests there for the rest of the page.
const HERO_ANCHOR_SELECTOR = '[data-homepage-weave-target]';
const CENTER: NetworkWeaveConvergence = { x: 0, y: 0 };
const COMPLEXITY = 20;
const SPEED_FACTOR = 0.18;
const HERO_INTENSITY = 0.45;
const READING_INTENSITY = 0.15;
const HERO_FLARE = 1.45;
const READING_FLARE = 4.08;
const FOCUS_RETURN_DISTANCE_FACTOR = 1.75;
const POSITION_TOLERANCE = 0.0005;
const PARAMETER_TOLERANCE = 0.0005;

type BackgroundState = {
  convergence: NetworkWeaveConvergence;
  intensity: number;
  flare: number;
  resolved: boolean;
};

type HomepagePageBackgroundProps = {
  reveal?: boolean;
  target?: string;
};

function clampToViewport(value: number) {
  return Math.min(1, Math.max(0, value));
}

function interpolate(origin: number, target: number, progress: number) {
  return origin + (target - origin) * progress;
}

function getDocumentLayoutRect(element: HTMLElement) {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = element;

  // Offset coordinates stay in layout space, so visual scroll transforms on
  // the hero cannot feed back into the weave's focal-point calculation.
  while (current) {
    left += current.offsetLeft;
    top += current.offsetTop;
    current =
      current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }

  return {
    height: element.offsetHeight,
    left,
    top,
    width: element.offsetWidth,
  };
}

function statesAreEqual(current: BackgroundState, next: BackgroundState) {
  return (
    current.resolved === next.resolved &&
    Math.abs(current.convergence.x - next.convergence.x) < POSITION_TOLERANCE &&
    Math.abs(current.convergence.y - next.convergence.y) < POSITION_TOLERANCE &&
    Math.abs(current.intensity - next.intensity) < PARAMETER_TOLERANCE &&
    Math.abs(current.flare - next.flare) < PARAMETER_TOLERANCE
  );
}

export function HomepagePageBackground({
  reveal = true,
  target,
}: HomepagePageBackgroundProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [background, setBackground] = useState<BackgroundState>({
    convergence: CENTER,
    intensity: HERO_INTENSITY,
    flare: HERO_FLARE,
    resolved: false,
  });

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    const commit = (next: BackgroundState) =>
      setBackground((current) =>
        statesAreEqual(current, next) ? current : next,
      );

    if (reduceMotion) {
      commit({
        convergence: CENTER,
        intensity: READING_INTENSITY,
        flare: READING_FLARE,
        resolved: true,
      });
      return undefined;
    }

    const hero = document.querySelector<HTMLElement>(
      target ?? HERO_ANCHOR_SELECTOR,
    );

    const update = () => {
      const layerRect = layer.getBoundingClientRect();
      if (layerRect.width <= 0 || layerRect.height <= 0) return;

      if (!hero) {
        commit({
          convergence: CENTER,
          intensity: READING_INTENSITY,
          flare: READING_FLARE,
          resolved: true,
        });
        return;
      }

      const heroRect = getDocumentLayoutRect(hero);
      // The hero's centre in document space, projected onto the fixed viewport
      // layer. Document coordinates are stable across scroll, so the eventual
      // glide to centre stays smooth and independent of the hero's live offset.
      const restingConvergence = {
        x: clampToViewport(
          (heroRect.left + heroRect.width / 2 - layerRect.left) /
            layerRect.width,
        ),
        y: clampToViewport(
          (heroRect.top + heroRect.height / 2) / layerRect.height,
        ),
      };
      // The hero has fully exited once its document bottom passes the viewport
      // top (scrollY >= heroDocumentBottom).
      const heroDocumentBottom = heroRect.top + heroRect.height;
      const exitProgress = clampToViewport(
        window.scrollY / Math.max(1, heroDocumentBottom),
      );
      const focusReturnProgress = clampToViewport(
        window.scrollY /
          Math.max(1, heroDocumentBottom * FOCUS_RETURN_DISTANCE_FACTOR),
      );

      commit({
        convergence: {
          x: interpolate(restingConvergence.x, CENTER.x, focusReturnProgress),
          y: interpolate(restingConvergence.y, CENTER.y, focusReturnProgress),
        },
        intensity: interpolate(HERO_INTENSITY, READING_INTENSITY, exitProgress),
        flare: interpolate(HERO_FLARE, READING_FLARE, exitProgress),
        resolved: true,
      });
    };

    update();

    // Coalesce the layout-reading update to one run per frame so bursts of
    // scroll/resize events don't force redundant reflows.
    let frameId = 0;
    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        update();
      });
    };

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(layer);
    if (hero) observer.observe(hero);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    let isActive = true;
    void document.fonts?.ready.then(() => {
      if (isActive) update();
      return undefined;
    });

    return () => {
      isActive = false;
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate);
    };
  }, [reduceMotion, target]);

  return (
    <PageBackground
      convergence={background.convergence}
      complexity={COMPLEXITY}
      intensity={background.intensity}
      flare={background.flare}
      speedFactor={SPEED_FACTOR}
      layerRef={layerRef}
      motionMode="direct"
      resolved={background.resolved && reveal}
    />
  );
}
