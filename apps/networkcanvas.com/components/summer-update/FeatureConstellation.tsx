'use client';

import {
  motion,
  type MotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { useRef, useSyncExternalStore } from 'react';

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

const paths = [
  'M100 100 C170 100 230 100 300 100 C370 100 430 100 500 100',
  'M100 300 C170 300 230 300 300 300 C370 300 430 300 500 300',
  'M100 500 C170 500 230 500 300 500 C370 500 430 500 500 500',
  'M100 700 C170 700 230 700 300 700 C370 700 430 700 500 700',
  'M100 900 C170 900 230 900 300 900 C370 900 430 900 500 900',
  'M100 100 C100 230 300 170 300 300 S500 370 500 500 S300 630 300 700 S100 770 100 900',
  'M500 100 C500 230 300 170 300 300 S100 370 100 500 S300 630 300 700 S500 770 500 900',
] as const;

function ScrollLinkedConstellationPath({
  index,
  motionEnabled,
  path,
  progress,
}: {
  index: number;
  motionEnabled: boolean;
  path: (typeof paths)[number];
  progress: MotionValue<number>;
}) {
  const entryStart = 0.015 + index * 0.018;
  const entryEnd = 0.2 + index * 0.028;
  const exitStart = 0.78 - index * 0.015;
  const pathLength = useTransform(
    progress,
    [0, entryStart, entryEnd, exitStart, 1],
    [0, 0, 1, 1, 0],
  );
  const opacity = useTransform(
    progress,
    [0, entryStart, entryEnd, exitStart, 0.96, 1],
    [0, 0, 1, 1, 0.45, 0],
  );

  return (
    <motion.path
      d={path}
      fill="none"
      className={
        index % 2 === 0 ? 'stroke-sea-serpent/20' : 'stroke-slate-blue/15'
      }
      strokeWidth="2"
      vectorEffect="non-scaling-stroke"
      style={motionEnabled ? { opacity, pathLength } : undefined}
    />
  );
}

export function FeatureConstellation() {
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const motionEnabled = hasHydrated && shouldReduceMotion === false;
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 92%', 'end 8%'],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 95,
    damping: 26,
    mass: 0.3,
  });

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="tablet-portrait:block pointer-events-none absolute inset-0 hidden size-full overflow-visible"
    >
      <svg
        focusable="false"
        viewBox="0 0 600 1000"
        preserveAspectRatio="none"
        className="size-full overflow-visible"
      >
        {paths.map((path, index) => (
          <ScrollLinkedConstellationPath
            key={path}
            path={path}
            index={index}
            progress={progress}
            motionEnabled={motionEnabled}
          />
        ))}
      </svg>
    </div>
  );
}
