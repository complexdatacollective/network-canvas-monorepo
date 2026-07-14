'use client';

import {
  animate,
  motion,
  type MotionValue,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import {
  createContext,
  type ReactNode,
  type Ref,
  type RefCallback,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import NetworkWeaveBackground from '@codaco/art/NetworkWeaveBackground';
import type {
  NetworkWeaveConvergence,
  NetworkWeaveOrientation,
} from '@codaco/art/NetworkWeaveBackground';

const DEFAULT_CONVERGENCE: NetworkWeaveConvergence = { x: 0.5, y: 0.6 };
const POSITION_TOLERANCE = 0.0005;
const PARAMETER_TOLERANCE = 0.0005;
const INITIAL_INTENSITY = 0.4;
const DEFAULT_FLARE = 1.8;
const DEFAULT_SPEED_FACTOR = 0.35;
const SCROLL_PROGRESS_RANGE = [0, 1];
const SCROLL_OPACITY_RANGE = [1, 0];
const SCROLL_SCALE_RANGE = [1, 1.8];
const ROUTE_FADE_DURATION_SECONDS = 0.35;
const ROUTE_FADE_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// The weave is hidden behind an inverse-radial mask until the convergence target
// (the hero video) resolves, then the masked disc shrinks to nothing at the
// target so the weave appears to knit inward from the edges to the centre.
const REVEAL_DURATION_SECONDS = 2;
const REVEAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const REVEAL_EDGE_FEATHER = 0.12;
const REVEAL_START_MARGIN = 1.06;
const REVEAL_INITIAL_RADIUS = 100000;

const PageBackgroundTargetContext =
  createContext<RefCallback<HTMLElement> | null>(null);

type DocumentLayoutBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type TargetMeasurement = {
  convergence: NetworkWeaveConvergence;
  targetIsBeforeLayer: boolean;
  targetExitScrollY: number;
};

type WeaveSettings = {
  convergence: NetworkWeaveConvergence;
  intensity: number;
  flare: number;
  speedFactor: number;
};

function convergencePointsAreEqual(
  currentPoint: NetworkWeaveConvergence,
  nextPoint: NetworkWeaveConvergence,
) {
  return (
    Math.abs(currentPoint.x - nextPoint.x) < POSITION_TOLERANCE &&
    Math.abs(currentPoint.y - nextPoint.y) < POSITION_TOLERANCE
  );
}

function weaveSettingsAreEqual(
  currentSettings: WeaveSettings,
  nextSettings: WeaveSettings,
) {
  return (
    convergencePointsAreEqual(
      currentSettings.convergence,
      nextSettings.convergence,
    ) &&
    Math.abs(currentSettings.intensity - nextSettings.intensity) <
      PARAMETER_TOLERANCE &&
    Math.abs(currentSettings.flare - nextSettings.flare) <
      PARAMETER_TOLERANCE &&
    Math.abs(currentSettings.speedFactor - nextSettings.speedFactor) <
      PARAMETER_TOLERANCE
  );
}

function getDocumentLayoutBox(element: HTMLElement): DocumentLayoutBox {
  const rect = element.getBoundingClientRect();
  const isFixed = window.getComputedStyle(element).position === 'fixed';

  if (element.offsetWidth <= 0 || element.offsetHeight <= 0) {
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }

  let left = 0;
  let top = 0;
  let currentElement: HTMLElement | null = element;

  while (currentElement) {
    left += currentElement.offsetLeft;
    top += currentElement.offsetTop;
    const offsetParent: Element | null = currentElement.offsetParent;
    currentElement = offsetParent instanceof HTMLElement ? offsetParent : null;
  }

  // For fixed elements, convert viewport-relative offsets to document coordinates
  if (isFixed) {
    left += window.scrollX;
    top += window.scrollY;
  }

  return {
    left,
    top,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

function measureConvergence(
  layer: HTMLDivElement,
  target: HTMLElement,
): TargetMeasurement | null {
  // Layout boxes ignore entrance transforms and share document space.
  const layerBox = getDocumentLayoutBox(layer);
  const targetBox = getDocumentLayoutBox(target);

  if (layerBox.width <= 0 || layerBox.height <= 0) return null;

  const convergence = {
    x: (targetBox.left + targetBox.width / 2 - layerBox.left) / layerBox.width,
    y: (targetBox.top + targetBox.height / 2 - layerBox.top) / layerBox.height,
  };

  return Number.isFinite(convergence.x) && Number.isFinite(convergence.y)
    ? {
        convergence,
        targetIsBeforeLayer: targetBox.top + targetBox.height <= layerBox.top,
        targetExitScrollY: targetBox.top + targetBox.height,
      }
    : null;
}

export function usePageBackgroundTargetRef() {
  return useContext(PageBackgroundTargetContext);
}

export function PageBackgroundProvider({
  children,
  fallbackConvergence = DEFAULT_CONVERGENCE,
  intensity = INITIAL_INTENSITY,
  motionMode = 'scroll',
  visible = true,
  waitForTarget = true,
}: {
  children: ReactNode;
  fallbackConvergence?: NetworkWeaveConvergence;
  intensity?: number;
  motionMode?: 'scroll' | 'target';
  visible?: boolean;
  waitForTarget?: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [resolved, setResolved] = useState(false);
  const [convergence, setConvergence] =
    useState<NetworkWeaveConvergence>(fallbackConvergence);
  const [scrollFadeEnd, setScrollFadeEnd] = useState<number>();
  const hasTrackedTargetRef = useRef(false);
  const targetRef = useCallback<RefCallback<HTMLElement>>((element) => {
    setTarget(element);
  }, []);

  useLayoutEffect(() => {
    hasTrackedTargetRef.current = false;
    const layer = layerRef.current;
    if (!waitForTarget || !layer || !target) return undefined;

    const updateConvergence = () => {
      const measurement = measureConvergence(layer, target);
      if (!measurement) return;

      setScrollFadeEnd(Math.max(1, measurement.targetExitScrollY));

      if (motionMode === 'scroll' && measurement.targetIsBeforeLayer) {
        setResolved(true);

        if (hasTrackedTargetRef.current) {
          setConvergence((currentConvergence) => {
            const exitConvergence = {
              x: measurement.convergence.x,
              y: 0,
            };

            return convergencePointsAreEqual(
              currentConvergence,
              exitConvergence,
            )
              ? currentConvergence
              : exitConvergence;
          });
        }

        return;
      }

      hasTrackedTargetRef.current = true;
      setResolved(true);
      setConvergence((currentConvergence) =>
        Math.abs(currentConvergence.x - measurement.convergence.x) <
          POSITION_TOLERANCE &&
        Math.abs(currentConvergence.y - measurement.convergence.y) <
          POSITION_TOLERANCE
          ? currentConvergence
          : measurement.convergence,
      );
    };

    updateConvergence();

    const observer = new ResizeObserver(updateConvergence);
    observer.observe(layer);
    observer.observe(target);
    window.addEventListener('resize', updateConvergence);
    window.addEventListener('scroll', updateConvergence, { passive: true });
    let isActive = true;
    void document.fonts?.ready.then(() => {
      if (isActive) updateConvergence();
      return undefined;
    });

    return () => {
      isActive = false;
      observer.disconnect();
      window.removeEventListener('resize', updateConvergence);
      window.removeEventListener('scroll', updateConvergence);
    };
  }, [motionMode, target, waitForTarget]);

  useLayoutEffect(() => {
    if (waitForTarget && target) return;

    setResolved(false);
    setConvergence(fallbackConvergence);
  }, [fallbackConvergence, target, waitForTarget]);

  return (
    <>
      <PageBackground
        convergence={convergence}
        intensity={intensity}
        layerRef={layerRef}
        motionMode={motionMode}
        resolved={waitForTarget ? resolved : undefined}
        scrollFadeEnd={scrollFadeEnd}
        visible={visible}
      />
      <PageBackgroundTargetContext.Provider value={targetRef}>
        {children}
      </PageBackgroundTargetContext.Provider>
    </>
  );
}

function getFarthestCornerDistance(
  center: NetworkWeaveConvergence,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const centerX = center.x * viewportWidth;
  const centerY = center.y * viewportHeight;
  const reachX = Math.max(centerX, viewportWidth - centerX);
  const reachY = Math.max(centerY, viewportHeight - centerY);
  return Math.hypot(reachX, reachY);
}

type ConvergenceReveal = {
  maskImage: MotionValue<string> | undefined;
  masked: boolean;
};

// Drives the inverse-radial reveal. `resolved` is `undefined` when the caller
// opts out entirely (the weave is always visible, no mask); `false` while the
// convergence target is still being measured (fully hidden); `true` once it has
// resolved (play the reveal, or show instantly under reduced motion).
function useConvergenceReveal(
  convergence: NetworkWeaveConvergence,
  resolved: boolean | undefined,
  reduceMotion: boolean | null,
): ConvergenceReveal {
  const radius = useMotionValue(REVEAL_INITIAL_RADIUS);
  const innerRadius = useTransform(radius, (value) =>
    Math.max(0, value * (1 - REVEAL_EDGE_FEATHER)),
  );
  const centerX = convergence.x * 100;
  const centerY = convergence.y * 100;
  const maskImage = useMotionTemplate`radial-gradient(circle at ${centerX}% ${centerY}%, transparent ${innerRadius}px, #000 ${radius}px)`;

  const [masked, setMasked] = useState(resolved !== undefined);
  const hasRevealedRef = useRef(false);
  // Read via a ref so a mid-reveal convergence change (e.g. a fonts.ready layout
  // shift) doesn't re-run the effect and stop the tween before it completes. The
  // mask centre still tracks live convergence — it is computed on each render.
  const convergenceRef = useRef(convergence);
  convergenceRef.current = convergence;

  useLayoutEffect(() => {
    if (resolved === undefined) {
      hasRevealedRef.current = false;
      radius.set(REVEAL_INITIAL_RADIUS);
      setMasked(false);
      return undefined;
    }

    if (!resolved) {
      hasRevealedRef.current = false;
      radius.set(REVEAL_INITIAL_RADIUS);
      setMasked(true);
      return undefined;
    }

    if (reduceMotion === null || hasRevealedRef.current) return undefined;
    hasRevealedRef.current = true;

    if (reduceMotion) {
      radius.set(0);
      setMasked(false);
      return undefined;
    }

    const cornerDistance = getFarthestCornerDistance(
      convergenceRef.current,
      window.innerWidth,
      window.innerHeight,
    );
    radius.set(
      (cornerDistance * REVEAL_START_MARGIN) / (1 - REVEAL_EDGE_FEATHER),
    );
    const controls = animate(radius, 0, {
      duration: REVEAL_DURATION_SECONDS,
      ease: REVEAL_EASE,
      onComplete: () => setMasked(false),
    });
    return () => controls.stop();
  }, [radius, reduceMotion, resolved]);

  return { maskImage: masked ? maskImage : undefined, masked };
}

// The weave is authored for a wide (horizontal) canvas; in a portrait viewport
// its vertical layout reads far better. Starts 'horizontal' to match the server
// render, then corrects on the client in a layout effect (before paint).
function useResponsiveOrientation(): NetworkWeaveOrientation {
  const [orientation, setOrientation] =
    useState<NetworkWeaveOrientation>('horizontal');

  useLayoutEffect(() => {
    const portrait = window.matchMedia('(orientation: portrait)');
    const update = () =>
      setOrientation(portrait.matches ? 'vertical' : 'horizontal');
    update();
    portrait.addEventListener('change', update);
    return () => portrait.removeEventListener('change', update);
  }, []);

  return orientation;
}

export function PageBackground({
  convergence = DEFAULT_CONVERGENCE,
  intensity = INITIAL_INTENSITY,
  motionMode = 'scroll',
  resolved,
  scrollFadeEnd,
  visible = true,
  layerRef,
}: {
  convergence?: NetworkWeaveConvergence;
  intensity?: number;
  motionMode?: 'scroll' | 'target';
  resolved?: boolean;
  scrollFadeEnd?: number;
  visible?: boolean;
  layerRef?: Ref<HTMLDivElement>;
}) {
  const reduceMotion = useReducedMotion();
  const orientation = useResponsiveOrientation();
  const { scrollY, scrollYProgress } = useScroll();
  const targetScrollOpacity = useTransform(
    scrollY,
    [0, scrollFadeEnd ?? 1],
    SCROLL_OPACITY_RANGE,
  );
  const pageScrollOpacity = useTransform(
    scrollYProgress,
    SCROLL_PROGRESS_RANGE,
    SCROLL_OPACITY_RANGE,
  );
  const targetScrollScale = useTransform(
    scrollY,
    [0, scrollFadeEnd ?? 1],
    SCROLL_SCALE_RANGE,
  );
  const pageScrollScale = useTransform(
    scrollYProgress,
    SCROLL_PROGRESS_RANGE,
    SCROLL_SCALE_RANGE,
  );
  const scrollOpacity =
    scrollFadeEnd === undefined ? pageScrollOpacity : targetScrollOpacity;
  const scrollScale =
    scrollFadeEnd === undefined ? pageScrollScale : targetScrollScale;
  const [weaveSettings, setWeaveSettings] = useState<WeaveSettings>({
    convergence,
    intensity,
    flare: DEFAULT_FLARE,
    speedFactor: DEFAULT_SPEED_FACTOR,
  });
  const weaveSettingsRef = useRef(weaveSettings);
  const hasResolvedTargetRef = useRef(resolved === true);
  const commitWeaveSettings = useCallback((settings: WeaveSettings) => {
    if (weaveSettingsAreEqual(weaveSettingsRef.current, settings)) return;

    weaveSettingsRef.current = settings;
    setWeaveSettings(settings);
  }, []);
  useLayoutEffect(() => {
    if (motionMode !== 'target') return undefined;

    const nextSettings: WeaveSettings = {
      convergence,
      intensity,
      flare: DEFAULT_FLARE,
      speedFactor: DEFAULT_SPEED_FACTOR,
    };
    const isFirstResolvedTarget =
      resolved === true && !hasResolvedTargetRef.current;

    if (resolved === false) hasResolvedTargetRef.current = false;
    if (resolved === true) hasResolvedTargetRef.current = true;

    if (reduceMotion !== false || resolved === false || isFirstResolvedTarget) {
      commitWeaveSettings(nextSettings);
      return undefined;
    }

    const startSettings = weaveSettingsRef.current;
    if (weaveSettingsAreEqual(startSettings, nextSettings)) return undefined;

    const controls = animate(0, 1, {
      type: 'spring',
      stiffness: 100,
      damping: 20,
      mass: 0.8,
      onUpdate: (progress) => {
        commitWeaveSettings({
          convergence: {
            x:
              startSettings.convergence.x +
              (nextSettings.convergence.x - startSettings.convergence.x) *
                progress,
            y:
              startSettings.convergence.y +
              (nextSettings.convergence.y - startSettings.convergence.y) *
                progress,
          },
          intensity:
            startSettings.intensity +
            (nextSettings.intensity - startSettings.intensity) * progress,
          flare: DEFAULT_FLARE,
          speedFactor: DEFAULT_SPEED_FACTOR,
        });
      },
    });

    return () => controls.stop();
  }, [
    commitWeaveSettings,
    convergence,
    intensity,
    motionMode,
    reduceMotion,
    resolved,
  ]);

  const { maskImage, masked } = useConvergenceReveal(
    convergence,
    resolved,
    reduceMotion,
  );
  const renderedSettings =
    motionMode === 'scroll'
      ? {
          convergence,
          intensity,
          flare: DEFAULT_FLARE,
          speedFactor: DEFAULT_SPEED_FACTOR,
        }
      : weaveSettings;
  const maskStyle = masked
    ? { WebkitMaskImage: maskImage, maskImage }
    : { WebkitMaskImage: 'none', maskImage: 'none' };
  const scrollStyle =
    motionMode === 'scroll'
      ? {
          opacity: scrollOpacity,
          scale: reduceMotion === false ? scrollScale : 1,
          transformOrigin: `${convergence.x * 100}% ${convergence.y * 100}%`,
        }
      : {};
  const targetAnimation =
    motionMode === 'target'
      ? {
          initial: false,
          animate: { opacity: visible ? 1 : 0 },
          transition: {
            duration: reduceMotion ? 0 : ROUTE_FADE_DURATION_SECONDS,
            ease: ROUTE_FADE_EASE,
          },
        }
      : {};

  return (
    <motion.div
      ref={layerRef}
      aria-hidden="true"
      data-testid="page-background-layer"
      className="pointer-events-none fixed inset-0 z-1 overflow-hidden"
      {...targetAnimation}
      style={{ ...maskStyle, ...scrollStyle }}
    >
      <NetworkWeaveBackground
        seed="networkcanvas.com"
        convergence={renderedSettings.convergence}
        intensity={renderedSettings.intensity}
        flare={renderedSettings.flare}
        speedFactor={renderedSettings.speedFactor}
        orientation={orientation}
        className="block"
      />
    </motion.div>
  );
}
