'use client';

import {
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';

import { PageBackground } from '@codaco/art';
import type { NetworkWeaveConvergence } from '@codaco/art/NetworkWeaveBackground';

const CENTER_CONVERGENCE: NetworkWeaveConvergence = { x: 0.5, y: 0.5 };
const POSITION_TOLERANCE = 0.0005;
const PARAMETER_TOLERANCE = 0.0005;
const DEFAULT_COMPLEXITY = 20;
const HOLD_RELEASE_VIEWPORT_OFFSET = 32;

const HOMEPAGE_FLARE_KEYFRAMES = [
  1.45, 1.9, 1.58, 2.42, 1.72, 2.72, 2.08,
] as const;

const GET_STARTED_FLARE_KEYFRAMES = [
  1.45, 1.82, 2.18, 1.62, 2.5, 1.9, 2.22,
] as const;

type ParameterProfile = 'homepage' | 'get-started';

type PostTargetBehavior = 'center' | 'figure-eight';

type BackgroundState = {
  convergence: NetworkWeaveConvergence;
  intensity: number;
  flare: number;
  resolved: boolean;
  targetChangeVersion: number;
};

type ScrollLinkedPageBackgroundProps = {
  targetSelector: string;
  interactiveTargetSelector?: string;
  interactiveIntensityBoost?: number;
  holdTargetSelector?: string;
  movingTargetSelector?: string;
  postTargetBehavior?: PostTargetBehavior;
  parameterProfile?: ParameterProfile;
};

function getFlareKeyframes(parameterProfile: ParameterProfile) {
  return parameterProfile === 'get-started'
    ? GET_STARTED_FLARE_KEYFRAMES
    : HOMEPAGE_FLARE_KEYFRAMES;
}

function getStaticParameters(parameterProfile: ParameterProfile) {
  return parameterProfile === 'get-started'
    ? { intensity: 0.36, speedFactor: 0.24 }
    : { intensity: 0.62, speedFactor: 0.28 };
}

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

function getRectCenter(rect: DOMRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function interpolate(origin: number, target: number, progress: number) {
  return origin + (target - origin) * progress;
}

function getWeaveFlare(progress: number, parameterProfile: ParameterProfile) {
  const keyframes = getFlareKeyframes(parameterProfile);
  const heroFlare = keyframes[0] ?? HOMEPAGE_FLARE_KEYFRAMES[0];
  const keyframeProgress = clampToViewport(progress) * (keyframes.length - 1);
  const originIndex = Math.floor(keyframeProgress);
  const targetIndex = Math.min(keyframes.length - 1, originIndex + 1);
  const origin = keyframes[originIndex] ?? heroFlare;
  const target = keyframes[targetIndex] ?? origin;
  const progressWithinKeyframe = keyframeProgress - originIndex;

  return Math.max(
    heroFlare,
    interpolate(origin, target, progressWithinKeyframe),
  );
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

function getFigureEightFlare(
  progress: number,
  parameterProfile: ParameterProfile,
) {
  const keyframes = getFlareKeyframes(parameterProfile);
  const heroFlare = keyframes[0] ?? HOMEPAGE_FLARE_KEYFRAMES[0];
  const restFlare = keyframes[keyframes.length - 1] ?? heroFlare;
  const angle = progress * Math.PI * 2;

  return Math.max(heroFlare, restFlare + (1 - Math.cos(angle)) * 0.32);
}

function getScrollLinkedFlare(
  progress: number,
  parameterProfile: ParameterProfile,
) {
  return progress <= 1
    ? getWeaveFlare(progress, parameterProfile)
    : getFigureEightFlare(progress - 1, parameterProfile);
}

function rectIntersectsLayer(rect: DOMRect, layerRect: DOMRect) {
  return (
    rect.bottom > layerRect.top &&
    rect.top < layerRect.bottom &&
    rect.right > layerRect.left &&
    rect.left < layerRect.right
  );
}

function getMovingTargetPoint(
  rect: DOMRect,
  layerRect: DOMRect,
  targetIndex: number,
) {
  const center = getRectCenter(rect);
  const travelDistance = layerRect.height + rect.height;
  const travelProgress =
    travelDistance <= 0
      ? 0
      : clampToViewport((layerRect.bottom - rect.top) / travelDistance);
  const angle = travelProgress * Math.PI * 2 + targetIndex * Math.PI * 0.55;

  return {
    x: center.x + Math.sin(angle) * rect.width * 0.28,
    y: center.y + Math.cos(angle) * rect.height * 0.2,
  };
}

export function ScrollLinkedPageBackground({
  targetSelector,
  interactiveTargetSelector,
  interactiveIntensityBoost = 0,
  holdTargetSelector,
  movingTargetSelector,
  postTargetBehavior = 'center',
  parameterProfile = 'homepage',
}: ScrollLinkedPageBackgroundProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const scrollParameterProgress = useMotionValue(0);
  const flare = useTransform(scrollParameterProgress, (progress) =>
    getScrollLinkedFlare(progress, parameterProfile),
  );
  const [background, setBackground] = useState<BackgroundState>({
    convergence: CENTER_CONVERGENCE,
    intensity: getStaticParameters(parameterProfile).intensity,
    flare: getWeaveFlare(0, parameterProfile),
    resolved: false,
    targetChangeVersion: 0,
  });

  useMotionValueEvent(flare, 'change', (nextFlare) => {
    setBackground((current) =>
      valuesAreEqual(current.flare, nextFlare)
        ? current
        : { ...current, flare: nextFlare },
    );
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
      const targetRects = targets.map((target) =>
        target.getBoundingClientRect(),
      );
      const targetCenters = targetRects.map(getRectCenter);
      const targetFocusPoints = targetRects.map((rect, targetIndex) =>
        movingTargetSelector &&
        targets[targetIndex]?.matches(movingTargetSelector)
          ? getMovingTargetPoint(rect, layerRect, targetIndex)
          : getRectCenter(rect),
      );
      let convergence = CENTER_CONVERGENCE;
      let targetProgress = 0;
      let postTargetProgress: number | null = null;
      const firstTarget = targetFocusPoints[0];
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
        const origin = targetFocusPoints[passedTargetIndex];
        const target = targetFocusPoints[passedTargetIndex + 1];
        const originCenter = targetCenters[passedTargetIndex];
        const targetCenter = targetCenters[passedTargetIndex + 1];
        const originElement = targets[passedTargetIndex];
        const originRect = targetRects[passedTargetIndex];
        const holdsUntilExit =
          holdTargetSelector !== undefined &&
          originElement?.matches(holdTargetSelector) === true;

        if (origin && target && originCenter && targetCenter && originRect) {
          // Standard handoffs begin at the viewport midpoint. A held target
          // instead releases near the viewport edge, then catches up by the
          // time the next target reaches the midpoint. Both paths remain fully
          // reversible and scroll-linked.
          const holdReleaseTop = layerRect.top + HOLD_RELEASE_VIEWPORT_OFFSET;
          const scrollPastHoldRelease = Math.max(
            0,
            holdReleaseTop - originRect.top,
          );
          const heldTransitionDistance =
            targetCenter.y + scrollPastHoldRelease - viewportCenterY;
          const transitionDistance = targetCenter.y - originCenter.y;
          const progress = holdsUntilExit
            ? heldTransitionDistance <= 0
              ? 1
              : clampToViewport(scrollPastHoldRelease / heldTransitionDistance)
            : transitionDistance <= 0
              ? 1
              : clampToViewport(
                  (viewportCenterY - originCenter.y) / transitionDistance,
                );
          const heldOriginY = origin.y + scrollPastHoldRelease;
          const focusX = origin.x + (target.x - origin.x) * progress;
          const focusY =
            (holdsUntilExit ? heldOriginY : origin.y) +
            (target.y - (holdsUntilExit ? heldOriginY : origin.y)) * progress;

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

      const interactiveRect =
        activeInteractiveTarget?.getBoundingClientRect() ?? null;
      const trackedInteractiveTarget =
        activeInteractiveTarget &&
        interactiveRect &&
        rectIntersectsLayer(interactiveRect, layerRect)
          ? activeInteractiveTarget
          : null;
      if (trackedInteractiveTarget && interactiveRect) {
        const interactiveCenter = getRectCenter(interactiveRect);
        convergence = {
          x: clampToViewport(
            (interactiveCenter.x - layerRect.left) / layerRect.width,
          ),
          y: clampToViewport(
            (interactiveCenter.y - layerRect.top) / layerRect.height,
          ),
        };
      }

      scrollParameterProgress.set(
        postTargetProgress === null ? targetProgress : 1 + postTargetProgress,
      );
      const renderedIntensity = Math.min(
        1,
        getStaticParameters(parameterProfile).intensity +
          (trackedInteractiveTarget ? interactiveIntensityBoost : 0),
      );

      setBackground((current) => {
        if (
          current.resolved &&
          pointsAreEqual(current.convergence, convergence) &&
          valuesAreEqual(current.intensity, renderedIntensity) &&
          current.targetChangeVersion === targetChangeVersion
        ) {
          return current;
        }

        return {
          ...current,
          convergence,
          intensity: renderedIntensity,
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
  }, [
    holdTargetSelector,
    interactiveIntensityBoost,
    interactiveTargetSelector,
    movingTargetSelector,
    parameterProfile,
    postTargetBehavior,
    scrollParameterProgress,
    targetSelector,
  ]);

  return (
    <PageBackground
      convergence={background.convergence}
      complexity={DEFAULT_COMPLEXITY}
      intensity={background.intensity}
      flare={background.flare}
      speedFactor={getStaticParameters(parameterProfile).speedFactor}
      layerRef={layerRef}
      motionMode="target"
      resolved={background.resolved}
      targetChangeVersion={background.targetChangeVersion}
    />
  );
}
