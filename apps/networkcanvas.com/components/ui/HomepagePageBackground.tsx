'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { PageBackground } from '@codaco/art';
import type { NetworkWeaveConvergence } from '@codaco/art/NetworkWeaveBackground';

const CENTER_CONVERGENCE: NetworkWeaveConvergence = { x: 0.5, y: 0.5 };
const POSITION_TOLERANCE = 0.0005;
const PARAMETER_TOLERANCE = 0.0005;
const TARGET_SELECTOR = '[data-homepage-weave-target]';
const INTERACTIVE_TARGET_SELECTOR = '[data-homepage-weave-interactive-target]';
const HERO_INTENSITY = 0.62;
const CONTENT_INTENSITY = 0.2;
const HERO_FLARE = 1.45;
const FINAL_FLARE = 2.25;
const HERO_SPEED_FACTOR = 0.28;
const FINAL_SPEED_FACTOR = 0.5;

type BackgroundState = {
  convergence: NetworkWeaveConvergence;
  intensity: number;
  flare: number;
  speedFactor: number;
  resolved: boolean;
  targetChangeVersion: number;
};

function clampToViewport(value: number) {
  return Math.min(1, Math.max(0, value));
}

function pointsAreEqual(
  current: NetworkWeaveConvergence,
  next: NetworkWeaveConvergence,
) {
  return (
    Math.abs(current.x - next.x) < POSITION_TOLERANCE &&
    Math.abs(current.y - next.y) < POSITION_TOLERANCE
  );
}

function valuesAreEqual(current: number, next: number) {
  return Math.abs(current - next) < PARAMETER_TOLERANCE;
}

function getElementCenter(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function interpolate(origin: number, target: number, progress: number) {
  return origin + (target - origin) * progress;
}

export function HomepagePageBackground() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [background, setBackground] = useState<BackgroundState>({
    convergence: CENTER_CONVERGENCE,
    intensity: HERO_INTENSITY,
    flare: HERO_FLARE,
    speedFactor: HERO_SPEED_FACTOR,
    resolved: false,
    targetChangeVersion: 0,
  });

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(TARGET_SELECTOR),
    );
    const interactiveTargets = Array.from(
      document.querySelectorAll<HTMLElement>(INTERACTIVE_TARGET_SELECTOR),
    );
    let hoveredTarget: HTMLElement | null = null;
    let focusedTarget: HTMLElement | null = null;
    let activeInteractiveTarget: HTMLElement | null = null;
    let targetChangeVersion = 0;

    const updateBackground = () => {
      const layerRect = layer.getBoundingClientRect();
      if (layerRect.width <= 0 || layerRect.height <= 0) return;

      const viewportCenterY = layerRect.top + layerRect.height / 2;
      const targetCenters = targets.map(getElementCenter);
      let convergence = CENTER_CONVERGENCE;
      const firstTarget = targetCenters[0];
      const passedTargetIndex = targetCenters.findLastIndex(
        ({ y }) => y <= viewportCenterY,
      );

      if (firstTarget && passedTargetIndex < 0) {
        convergence = {
          x: clampToViewport(
            (firstTarget.x - layerRect.left) / layerRect.width,
          ),
          y: clampToViewport(
            (firstTarget.y - layerRect.top) / layerRect.height,
          ),
        };
      } else if (
        passedTargetIndex >= 0 &&
        passedTargetIndex < targetCenters.length - 1
      ) {
        const origin = targetCenters[passedTargetIndex];
        const target = targetCenters[passedTargetIndex + 1];

        if (origin && target) {
          // The handoff begins as the origin crosses the viewport midpoint and
          // finishes as the next target reaches it. Tying progress to those two
          // positions keeps the transition fully reversible and scroll-linked.
          const transitionDistance = target.y - origin.y;
          const progress =
            transitionDistance <= 0
              ? 1
              : clampToViewport(
                  (viewportCenterY - origin.y) / transitionDistance,
                );
          const focusX = origin.x + (target.x - origin.x) * progress;
          const focusY = origin.y + (target.y - origin.y) * progress;

          convergence = {
            x: clampToViewport((focusX - layerRect.left) / layerRect.width),
            y: clampToViewport((focusY - layerRect.top) / layerRect.height),
          };
        }
      }

      const nextInteractiveTarget = focusedTarget ?? hoveredTarget;
      if (activeInteractiveTarget !== nextInteractiveTarget) {
        activeInteractiveTarget = nextInteractiveTarget;
        targetChangeVersion += 1;
      }

      if (activeInteractiveTarget) {
        const interactiveCenter = getElementCenter(activeInteractiveTarget);
        convergence = {
          x: clampToViewport(
            (interactiveCenter.x - layerRect.left) / layerRect.width,
          ),
          y: clampToViewport(
            (interactiveCenter.y - layerRect.top) / layerRect.height,
          ),
        };
      }

      const secondTarget = targetCenters[1];
      const heroExitProgress =
        firstTarget && secondTarget
          ? clampToViewport(
              (viewportCenterY - firstTarget.y) /
                Math.max(1, secondTarget.y - firstTarget.y),
            )
          : firstTarget && firstTarget.y > viewportCenterY
            ? 0
            : 1;
      const pageScrollDistance = Math.max(
        1,
        document.documentElement.scrollHeight - layerRect.height,
      );
      const pageScrollProgress = clampToViewport(
        window.scrollY / pageScrollDistance,
      );
      const intensity = interpolate(
        HERO_INTENSITY,
        CONTENT_INTENSITY,
        heroExitProgress,
      );
      const flare = interpolate(HERO_FLARE, FINAL_FLARE, pageScrollProgress);
      const speedFactor = interpolate(
        HERO_SPEED_FACTOR,
        FINAL_SPEED_FACTOR,
        pageScrollProgress,
      );

      setBackground((current) => {
        if (
          current.resolved &&
          pointsAreEqual(current.convergence, convergence) &&
          valuesAreEqual(current.intensity, intensity) &&
          valuesAreEqual(current.flare, flare) &&
          valuesAreEqual(current.speedFactor, speedFactor) &&
          current.targetChangeVersion === targetChangeVersion
        ) {
          return current;
        }

        return {
          convergence,
          intensity,
          flare,
          speedFactor,
          resolved: true,
          targetChangeVersion,
        };
      });
    };

    const interactiveTargetListeners = interactiveTargets.map((target) => {
      const handlePointerEnter = () => {
        hoveredTarget = target;
        updateBackground();
      };
      const handlePointerLeave = () => {
        if (hoveredTarget === target) hoveredTarget = null;
        updateBackground();
      };
      const handleFocus = () => {
        focusedTarget = target;
        updateBackground();
      };
      const handleBlur = () => {
        if (focusedTarget === target) focusedTarget = null;
        updateBackground();
      };

      target.addEventListener('pointerenter', handlePointerEnter);
      target.addEventListener('pointerleave', handlePointerLeave);
      target.addEventListener('focus', handleFocus);
      target.addEventListener('blur', handleBlur);

      return {
        target,
        handlePointerEnter,
        handlePointerLeave,
        handleFocus,
        handleBlur,
      };
    });

    updateBackground();

    const observer = new ResizeObserver(updateBackground);
    observer.observe(layer);
    targets.forEach((target) => observer.observe(target));
    interactiveTargets.forEach((target) => observer.observe(target));
    window.addEventListener('resize', updateBackground);
    window.addEventListener('scroll', updateBackground, { passive: true });
    let isActive = true;
    void document.fonts?.ready.then(() => {
      if (isActive) updateBackground();
      return undefined;
    });

    return () => {
      isActive = false;
      observer.disconnect();
      interactiveTargetListeners.forEach(
        ({
          target,
          handlePointerEnter,
          handlePointerLeave,
          handleFocus,
          handleBlur,
        }) => {
          target.removeEventListener('pointerenter', handlePointerEnter);
          target.removeEventListener('pointerleave', handlePointerLeave);
          target.removeEventListener('focus', handleFocus);
          target.removeEventListener('blur', handleBlur);
        },
      );
      window.removeEventListener('resize', updateBackground);
      window.removeEventListener('scroll', updateBackground);
    };
  }, []);

  return (
    <PageBackground
      convergence={background.convergence}
      intensity={background.intensity}
      flare={background.flare}
      speedFactor={background.speedFactor}
      layerRef={layerRef}
      motionMode="target"
      resolved={background.resolved}
      targetChangeVersion={background.targetChangeVersion}
    />
  );
}
