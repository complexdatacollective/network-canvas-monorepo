'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { PageBackground } from '@codaco/art';
import type { NetworkWeaveConvergence } from '@codaco/art/NetworkWeaveBackground';

const CENTER_CONVERGENCE: NetworkWeaveConvergence = { x: 0.5, y: 0.5 };
const POSITION_TOLERANCE = 0.0005;
const PARAMETER_TOLERANCE = 0.0005;

const WEAVE_PARAMETER_KEYFRAMES = [
  { intensity: 0.62, flare: 1.45, speedFactor: 0.28 },
  { intensity: 0.22, flare: 1.9, speedFactor: 0.52 },
  { intensity: 0.34, flare: 1.58, speedFactor: 0.38 },
  { intensity: 0.18, flare: 2.42, speedFactor: 0.68 },
  { intensity: 0.3, flare: 1.72, speedFactor: 0.44 },
  { intensity: 0.16, flare: 2.72, speedFactor: 0.74 },
  { intensity: 0.27, flare: 2.08, speedFactor: 0.5 },
] as const;

const HERO_PARAMETERS = WEAVE_PARAMETER_KEYFRAMES[0];
const REST_PARAMETERS =
  WEAVE_PARAMETER_KEYFRAMES[WEAVE_PARAMETER_KEYFRAMES.length - 1] ??
  HERO_PARAMETERS;

type PostTargetBehavior = 'center' | 'figure-eight';

type BackgroundState = {
  convergence: NetworkWeaveConvergence;
  intensity: number;
  flare: number;
  speedFactor: number;
  resolved: boolean;
  targetChangeVersion: number;
};

type ScrollLinkedPageBackgroundProps = {
  targetSelector: string;
  interactiveTargetSelector?: string;
  postTargetBehavior?: PostTargetBehavior;
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

function getWeaveParameters(progress: number) {
  const keyframeProgress =
    clampToViewport(progress) * (WEAVE_PARAMETER_KEYFRAMES.length - 1);
  const originIndex = Math.floor(keyframeProgress);
  const targetIndex = Math.min(
    WEAVE_PARAMETER_KEYFRAMES.length - 1,
    originIndex + 1,
  );
  const origin = WEAVE_PARAMETER_KEYFRAMES[originIndex] ?? HERO_PARAMETERS;
  const target = WEAVE_PARAMETER_KEYFRAMES[targetIndex] ?? origin;
  const progressWithinKeyframe = keyframeProgress - originIndex;

  return {
    intensity: interpolate(
      origin.intensity,
      target.intensity,
      progressWithinKeyframe,
    ),
    flare: Math.max(
      HERO_PARAMETERS.flare,
      interpolate(origin.flare, target.flare, progressWithinKeyframe),
    ),
    speedFactor: interpolate(
      origin.speedFactor,
      target.speedFactor,
      progressWithinKeyframe,
    ),
  };
}

function getPostTargetProgress(
  finalTargetCenterY: number,
  viewportCenterY: number,
  viewportHeight: number,
) {
  const finalTargetDocumentY = window.scrollY + finalTargetCenterY;
  const startScrollY = Math.max(0, finalTargetDocumentY - viewportCenterY);
  const maxScrollY = Math.max(
    startScrollY,
    document.documentElement.scrollHeight - viewportHeight,
  );

  if (maxScrollY === startScrollY) {
    return finalTargetCenterY <= viewportCenterY ? 1 : 0;
  }

  return clampToViewport(
    (window.scrollY - startScrollY) / (maxScrollY - startScrollY),
  );
}

function getFigureEightConvergence(progress: number) {
  const angle = progress * Math.PI * 2;

  return {
    x: CENTER_CONVERGENCE.x + Math.sin(angle) * 0.22,
    y: CENTER_CONVERGENCE.y + Math.sin(angle * 2) * 0.12,
  };
}

function getFigureEightParameters(progress: number) {
  const angle = progress * Math.PI * 2;

  return {
    intensity: REST_PARAMETERS.intensity + Math.sin(angle) * 0.07,
    flare: Math.max(
      HERO_PARAMETERS.flare,
      REST_PARAMETERS.flare + (1 - Math.cos(angle)) * 0.32,
    ),
    speedFactor: REST_PARAMETERS.speedFactor + Math.sin(angle * 2) * 0.18,
  };
}

export function ScrollLinkedPageBackground({
  targetSelector,
  interactiveTargetSelector,
  postTargetBehavior = 'center',
}: ScrollLinkedPageBackgroundProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [background, setBackground] = useState<BackgroundState>({
    convergence: CENTER_CONVERGENCE,
    ...HERO_PARAMETERS,
    resolved: false,
    targetChangeVersion: 0,
  });

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(targetSelector),
    );
    const interactiveTargets = interactiveTargetSelector
      ? Array.from(
          document.querySelectorAll<HTMLElement>(interactiveTargetSelector),
        )
      : [];
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
      let targetProgress = 0;
      let postTargetProgress: number | null = null;
      const firstTarget = targetCenters[0];
      const finalTargetIndex = targetCenters.length - 1;
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
        passedTargetIndex < finalTargetIndex
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
          targetProgress =
            finalTargetIndex <= 0
              ? 0
              : (passedTargetIndex + progress) / finalTargetIndex;
        }
      } else if (
        finalTargetIndex >= 0 &&
        passedTargetIndex >= finalTargetIndex
      ) {
        targetProgress = 1;
        if (postTargetBehavior === 'figure-eight') {
          const finalTarget = targetCenters[finalTargetIndex];
          if (finalTarget) {
            postTargetProgress = getPostTargetProgress(
              finalTarget.y,
              viewportCenterY,
              layerRect.height,
            );
            convergence = getFigureEightConvergence(postTargetProgress);
          }
        }
      }

      const nextInteractiveTarget = focusedTarget ?? hoveredTarget;
      if (activeInteractiveTarget !== nextInteractiveTarget) {
        activeInteractiveTarget = nextInteractiveTarget;
        targetChangeVersion += 1;
      }

      const trackedInteractiveTarget =
        activeInteractiveTarget &&
        !(
          postTargetBehavior === 'figure-eight' &&
          passedTargetIndex >= finalTargetIndex
        )
          ? activeInteractiveTarget
          : null;

      if (trackedInteractiveTarget) {
        const interactiveCenter = getElementCenter(trackedInteractiveTarget);
        convergence = {
          x: clampToViewport(
            (interactiveCenter.x - layerRect.left) / layerRect.width,
          ),
          y: clampToViewport(
            (interactiveCenter.y - layerRect.top) / layerRect.height,
          ),
        };
      }

      const { intensity, flare, speedFactor } =
        postTargetProgress === null
          ? getWeaveParameters(targetProgress)
          : getFigureEightParameters(postTargetProgress);

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
      const handleFocusIn = () => {
        focusedTarget = target;
        updateBackground();
      };
      const handleFocusOut = (event: FocusEvent) => {
        if (
          event.relatedTarget instanceof Node &&
          target.contains(event.relatedTarget)
        ) {
          return;
        }
        if (focusedTarget === target) focusedTarget = null;
        updateBackground();
      };

      target.addEventListener('pointerenter', handlePointerEnter);
      target.addEventListener('pointerleave', handlePointerLeave);
      target.addEventListener('focusin', handleFocusIn);
      target.addEventListener('focusout', handleFocusOut);

      return {
        target,
        handlePointerEnter,
        handlePointerLeave,
        handleFocusIn,
        handleFocusOut,
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
          handleFocusIn,
          handleFocusOut,
        }) => {
          target.removeEventListener('pointerenter', handlePointerEnter);
          target.removeEventListener('pointerleave', handlePointerLeave);
          target.removeEventListener('focusin', handleFocusIn);
          target.removeEventListener('focusout', handleFocusOut);
        },
      );
      window.removeEventListener('resize', updateBackground);
      window.removeEventListener('scroll', updateBackground);
    };
  }, [interactiveTargetSelector, postTargetBehavior, targetSelector]);

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
