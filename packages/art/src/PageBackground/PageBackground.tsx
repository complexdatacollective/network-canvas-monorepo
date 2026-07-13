'use client';

import {
  transform,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
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
import type { NetworkWeaveConvergence } from '@codaco/art/NetworkWeaveBackground';

const DEFAULT_CONVERGENCE: NetworkWeaveConvergence = { x: 0.5, y: 0.6 };
const POSITION_TOLERANCE = 0.0005;
const PARAMETER_TOLERANCE = 0.0005;
const CURVE_MIN_X = 0.08;
const CURVE_MAX_X = 0.92;
const CURVE_MIN_Y = 0.12;
const CURVE_MAX_Y = 0.88;
const INITIAL_INTENSITY = 0.22;
const BASELINE_INTENSITY = 0.1;
const DEFAULT_FLARE = 1.25;
const DEFAULT_SPEED_FACTOR = 0.35;
const INTENSITY_SCROLL_RANGE = [0, 0.18];
const INTENSITY_VALUES = [INITIAL_INTENSITY, BASELINE_INTENSITY];
const PARAMETER_SCROLL_RANGE = [0, 0.25, 0.5, 0.75, 1];
const FLARE_VALUES = [DEFAULT_FLARE, 0.9, 1.55, 1.05, 1.4];
const SPEED_FACTOR_VALUES = [DEFAULT_SPEED_FACTOR, 0.48, 0.28, 0.44, 0.34];

const PageBackgroundTargetContext =
  createContext<RefCallback<HTMLDivElement> | null>(null);

type DocumentLayoutBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ScrollCurve = {
  firstControl: NetworkWeaveConvergence;
  secondControl: NetworkWeaveConvergence;
  end: NetworkWeaveConvergence;
};

type WeaveSettings = {
  convergence: NetworkWeaveConvergence;
  intensity: number;
  flare: number;
  speedFactor: number;
};

const randomBetween = (minimum: number, maximum: number) =>
  minimum + Math.random() * (maximum - minimum);

function createRandomScrollCurve(): ScrollCurve {
  const randomPoint = (): NetworkWeaveConvergence => ({
    x: randomBetween(CURVE_MIN_X, CURVE_MAX_X),
    y: randomBetween(CURVE_MIN_Y, CURVE_MAX_Y),
  });

  return {
    firstControl: randomPoint(),
    secondControl: randomPoint(),
    end: randomPoint(),
  };
}

function pointOnScrollCurve(
  start: NetworkWeaveConvergence,
  curve: ScrollCurve,
  progress: number,
): NetworkWeaveConvergence {
  const t = Math.min(1, Math.max(0, progress));
  const inverseT = 1 - t;
  const startWeight = inverseT ** 3;
  const firstControlWeight = 3 * inverseT ** 2 * t;
  const secondControlWeight = 3 * inverseT * t ** 2;
  const endWeight = t ** 3;

  return {
    x:
      startWeight * start.x +
      firstControlWeight * curve.firstControl.x +
      secondControlWeight * curve.secondControl.x +
      endWeight * curve.end.x,
    y:
      startWeight * start.y +
      firstControlWeight * curve.firstControl.y +
      secondControlWeight * curve.secondControl.y +
      endWeight * curve.end.y,
  };
}

function getDocumentLayoutBox(element: HTMLDivElement): DocumentLayoutBox {
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
  target: HTMLDivElement,
): NetworkWeaveConvergence | null {
  // Layout boxes ignore the hero's entrance transform and share document space.
  const layerBox = getDocumentLayoutBox(layer);
  const targetBox = getDocumentLayoutBox(target);

  if (layerBox.width <= 0 || layerBox.height <= 0) return null;

  const convergence = {
    x: (targetBox.left + targetBox.width / 2 - layerBox.left) / layerBox.width,
    y: (targetBox.top + targetBox.height / 2 - layerBox.top) / layerBox.height,
  };

  return Number.isFinite(convergence.x) && Number.isFinite(convergence.y)
    ? convergence
    : null;
}

export function usePageBackgroundTargetRef() {
  return useContext(PageBackgroundTargetContext);
}

export function PageBackgroundProvider({ children }: { children: ReactNode }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [convergence, setConvergence] =
    useState<NetworkWeaveConvergence>(DEFAULT_CONVERGENCE);
  const targetRef = useCallback<RefCallback<HTMLDivElement>>((element) => {
    setTarget(element);
  }, []);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || !target) return undefined;

    const updateConvergence = () => {
      const nextConvergence = measureConvergence(layer, target);
      if (!nextConvergence) return;

      setConvergence((currentConvergence) =>
        Math.abs(currentConvergence.x - nextConvergence.x) <
          POSITION_TOLERANCE &&
        Math.abs(currentConvergence.y - nextConvergence.y) < POSITION_TOLERANCE
          ? currentConvergence
          : nextConvergence,
      );
    };

    updateConvergence();

    const observer = new ResizeObserver(updateConvergence);
    observer.observe(layer);
    observer.observe(target);
    window.addEventListener('resize', updateConvergence);
    let isActive = true;
    void document.fonts?.ready.then(() => {
      if (isActive) updateConvergence();
      return undefined;
    });

    return () => {
      isActive = false;
      observer.disconnect();
      window.removeEventListener('resize', updateConvergence);
    };
  }, [target]);

  return (
    <>
      <PageBackground convergence={convergence} layerRef={layerRef} />
      <PageBackgroundTargetContext.Provider value={targetRef}>
        {children}
      </PageBackgroundTargetContext.Provider>
    </>
  );
}

export function PageBackground({
  convergence = DEFAULT_CONVERGENCE,
  layerRef,
}: {
  convergence?: NetworkWeaveConvergence;
  layerRef?: Ref<HTMLDivElement>;
}) {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const curveRef = useRef<ScrollCurve | null>(null);
  const [weaveSettings, setWeaveSettings] = useState<WeaveSettings>({
    convergence,
    intensity: INITIAL_INTENSITY,
    flare: DEFAULT_FLARE,
    speedFactor: DEFAULT_SPEED_FACTOR,
  });
  const updateWeaveSettings = useCallback(
    (progress: number) => {
      const curve = curveRef.current;
      const nextSettings: WeaveSettings =
        reduceMotion === false && curve
          ? {
              convergence: pointOnScrollCurve(convergence, curve, progress),
              intensity: transform(
                progress,
                INTENSITY_SCROLL_RANGE,
                INTENSITY_VALUES,
              ),
              flare: transform(progress, PARAMETER_SCROLL_RANGE, FLARE_VALUES),
              speedFactor: transform(
                progress,
                PARAMETER_SCROLL_RANGE,
                SPEED_FACTOR_VALUES,
              ),
            }
          : {
              convergence,
              intensity: INITIAL_INTENSITY,
              flare: DEFAULT_FLARE,
              speedFactor: DEFAULT_SPEED_FACTOR,
            };

      setWeaveSettings((currentSettings) =>
        Math.abs(currentSettings.convergence.x - nextSettings.convergence.x) <
          POSITION_TOLERANCE &&
        Math.abs(currentSettings.convergence.y - nextSettings.convergence.y) <
          POSITION_TOLERANCE &&
        Math.abs(currentSettings.intensity - nextSettings.intensity) <
          PARAMETER_TOLERANCE &&
        Math.abs(currentSettings.flare - nextSettings.flare) <
          PARAMETER_TOLERANCE &&
        Math.abs(currentSettings.speedFactor - nextSettings.speedFactor) <
          PARAMETER_TOLERANCE
          ? currentSettings
          : nextSettings,
      );
    },
    [convergence, reduceMotion],
  );

  useLayoutEffect(() => {
    curveRef.current ??= createRandomScrollCurve();
    updateWeaveSettings(scrollYProgress.get());
  }, [scrollYProgress, updateWeaveSettings]);

  useMotionValueEvent(scrollYProgress, 'change', updateWeaveSettings);

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      data-testid="page-background-layer"
      className="pointer-events-none fixed inset-0 z-1 overflow-hidden"
    >
      <NetworkWeaveBackground
        seed="networkcanvas.com"
        convergence={weaveSettings.convergence}
        intensity={weaveSettings.intensity}
        flare={weaveSettings.flare}
        speedFactor={weaveSettings.speedFactor}
        className="block"
      />
    </div>
  );
}
