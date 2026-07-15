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

const HOMEPAGE_PARAMETER_KEYFRAMES = [
  { complexity: 20, intensity: 0.62, flare: 1.45, speedFactor: 0.28 },
  { complexity: 16, intensity: 0.22, flare: 1.9, speedFactor: 0.52 },
  { complexity: 34, intensity: 0.34, flare: 1.58, speedFactor: 0.38 },
  { complexity: 24, intensity: 0.18, flare: 2.42, speedFactor: 0.68 },
  { complexity: 44, intensity: 0.3, flare: 1.72, speedFactor: 0.44 },
  { complexity: 18, intensity: 0.16, flare: 2.72, speedFactor: 0.74 },
  { complexity: 36, intensity: 0.27, flare: 2.08, speedFactor: 0.5 },
] as const;

const GET_STARTED_PARAMETER_KEYFRAMES = [
  { complexity: 20, intensity: 0.36, flare: 1.45, speedFactor: 0.24 },
  { complexity: 16, intensity: 0.16, flare: 1.82, speedFactor: 0.44 },
  { complexity: 28, intensity: 0.26, flare: 2.18, speedFactor: 0.58 },
  { complexity: 18, intensity: 0.14, flare: 1.62, speedFactor: 0.34 },
  { complexity: 32, intensity: 0.24, flare: 2.5, speedFactor: 0.66 },
  { complexity: 20, intensity: 0.15, flare: 1.9, speedFactor: 0.42 },
  { complexity: 26, intensity: 0.2, flare: 2.22, speedFactor: 0.54 },
] as const;

type WeaveParameterKeyframe = {
  complexity: number;
  intensity: number;
  flare: number;
  speedFactor: number;
};

type ParameterProfile = 'homepage' | 'get-started';

type PostTargetBehavior = 'center' | 'figure-eight';

type BackgroundState = {
  convergence: NetworkWeaveConvergence;
  complexity: number;
  intensity: number;
  flare: number;
  speedFactor: number;
  resolved: boolean;
  targetChangeVersion: number;
};

type ScrollLinkedPageBackgroundProps = {
  targetSelector: string;
  interactiveTargetSelector?: string;
  holdTargetSelector?: string;
  postTargetBehavior?: PostTargetBehavior;
  parameterProfile?: ParameterProfile;
  varyComplexity?: boolean;
};

function getParameterKeyframes(
  parameterProfile: ParameterProfile,
): readonly WeaveParameterKeyframe[] {
  return parameterProfile === 'get-started'
    ? GET_STARTED_PARAMETER_KEYFRAMES
    : HOMEPAGE_PARAMETER_KEYFRAMES;
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

function getWeaveParameters(
  progress: number,
  varyComplexity: boolean,
  parameterProfile: ParameterProfile,
) {
  const keyframes = getParameterKeyframes(parameterProfile);
  const heroParameters = keyframes[0] ?? HOMEPAGE_PARAMETER_KEYFRAMES[0];
  const keyframeProgress = clampToViewport(progress) * (keyframes.length - 1);
  const originIndex = Math.floor(keyframeProgress);
  const targetIndex = Math.min(keyframes.length - 1, originIndex + 1);
  const origin = keyframes[originIndex] ?? heroParameters;
  const target = keyframes[targetIndex] ?? origin;
  const progressWithinKeyframe = keyframeProgress - originIndex;

  return {
    complexity: varyComplexity
      ? interpolate(
          origin.complexity,
          target.complexity,
          progressWithinKeyframe,
        )
      : DEFAULT_COMPLEXITY,
    intensity: interpolate(
      origin.intensity,
      target.intensity,
      progressWithinKeyframe,
    ),
    flare: Math.max(
      heroParameters.flare,
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

function getFigureEightParameters(
  progress: number,
  varyComplexity: boolean,
  parameterProfile: ParameterProfile,
) {
  const keyframes = getParameterKeyframes(parameterProfile);
  const heroParameters = keyframes[0] ?? HOMEPAGE_PARAMETER_KEYFRAMES[0];
  const restParameters = keyframes[keyframes.length - 1] ?? heroParameters;
  const intensityAmplitude = parameterProfile === 'get-started' ? 0.05 : 0.07;
  const angle = progress * Math.PI * 2;

  return {
    complexity: varyComplexity
      ? restParameters.complexity + Math.sin(angle) * 8
      : DEFAULT_COMPLEXITY,
    intensity: restParameters.intensity + Math.sin(angle) * intensityAmplitude,
    flare: Math.max(
      heroParameters.flare,
      restParameters.flare + (1 - Math.cos(angle)) * 0.32,
    ),
    speedFactor: restParameters.speedFactor + Math.sin(angle * 2) * 0.18,
  };
}

function getScrollLinkedParameters(
  progress: number,
  varyComplexity: boolean,
  parameterProfile: ParameterProfile,
) {
  return progress <= 1
    ? getWeaveParameters(progress, varyComplexity, parameterProfile)
    : getFigureEightParameters(progress - 1, varyComplexity, parameterProfile);
}

function rectIntersectsLayer(rect: DOMRect, layerRect: DOMRect) {
  return (
    rect.bottom > layerRect.top &&
    rect.top < layerRect.bottom &&
    rect.right > layerRect.left &&
    rect.left < layerRect.right
  );
}

export function ScrollLinkedPageBackground({
  targetSelector,
  interactiveTargetSelector,
  holdTargetSelector,
  postTargetBehavior = 'center',
  parameterProfile = 'homepage',
  varyComplexity = false,
}: ScrollLinkedPageBackgroundProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const scrollParameterProgress = useMotionValue(0);
  const complexity = useTransform(
    scrollParameterProgress,
    (progress) =>
      getScrollLinkedParameters(progress, varyComplexity, parameterProfile)
        .complexity,
  );
  const intensity = useTransform(
    scrollParameterProgress,
    (progress) =>
      getScrollLinkedParameters(progress, varyComplexity, parameterProfile)
        .intensity,
  );
  const flare = useTransform(
    scrollParameterProgress,
    (progress) =>
      getScrollLinkedParameters(progress, varyComplexity, parameterProfile)
        .flare,
  );
  const speedFactor = useTransform(
    scrollParameterProgress,
    (progress) =>
      getScrollLinkedParameters(progress, varyComplexity, parameterProfile)
        .speedFactor,
  );
  const [background, setBackground] = useState<BackgroundState>({
    convergence: CENTER_CONVERGENCE,
    ...getWeaveParameters(0, varyComplexity, parameterProfile),
    resolved: false,
    targetChangeVersion: 0,
  });

  useMotionValueEvent(complexity, 'change', (nextComplexity) => {
    setBackground((current) =>
      valuesAreEqual(current.complexity, nextComplexity)
        ? current
        : { ...current, complexity: nextComplexity },
    );
  });
  useMotionValueEvent(intensity, 'change', (nextIntensity) => {
    setBackground((current) =>
      valuesAreEqual(current.intensity, nextIntensity)
        ? current
        : { ...current, intensity: nextIntensity },
    );
  });
  useMotionValueEvent(flare, 'change', (nextFlare) => {
    setBackground((current) =>
      valuesAreEqual(current.flare, nextFlare)
        ? current
        : { ...current, flare: nextFlare },
    );
  });
  useMotionValueEvent(speedFactor, 'change', (nextSpeedFactor) => {
    setBackground((current) =>
      valuesAreEqual(current.speedFactor, nextSpeedFactor)
        ? current
        : { ...current, speedFactor: nextSpeedFactor },
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
        const originElement = targets[passedTargetIndex];
        const originRect = targetRects[passedTargetIndex];
        const holdsUntilExit =
          holdTargetSelector !== undefined &&
          originElement?.matches(holdTargetSelector) === true;

        if (origin && target && originRect) {
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
            target.y + scrollPastHoldRelease - viewportCenterY;
          const transitionDistance = target.y - origin.y;
          const progress = holdsUntilExit
            ? heldTransitionDistance <= 0
              ? 1
              : clampToViewport(scrollPastHoldRelease / heldTransitionDistance)
            : transitionDistance <= 0
              ? 1
              : clampToViewport(
                  (viewportCenterY - origin.y) / transitionDistance,
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

      setBackground((current) => {
        if (
          current.resolved &&
          pointsAreEqual(current.convergence, convergence) &&
          current.targetChangeVersion === targetChangeVersion
        ) {
          return current;
        }

        return {
          ...current,
          convergence,
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
    interactiveTargetSelector,
    parameterProfile,
    postTargetBehavior,
    scrollParameterProgress,
    targetSelector,
  ]);

  return (
    <PageBackground
      convergence={background.convergence}
      complexity={background.complexity}
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
