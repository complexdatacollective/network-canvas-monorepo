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

const destinationPaths = [
  'M500 0 C500 70 250 60 250 155',
  'M500 0 C500 70 750 60 750 155',
  'M500 0 C500 215 250 190 250 410',
  'M500 0 C500 215 750 190 750 410',
] as const;

const destinationColors = [
  'stroke-sea-green/35',
  'stroke-sea-serpent/35',
  'stroke-neon-coral/35',
  'stroke-mustard/35',
] as const;

function ScrollLinkedDestinationPath({
  color,
  index,
  motionEnabled,
  path,
  progress,
}: {
  color: (typeof destinationColors)[number];
  index: number;
  motionEnabled: boolean;
  path: (typeof destinationPaths)[number];
  progress: MotionValue<number>;
}) {
  const entryStart = 0.02 + index * 0.025;
  const entryEnd = 0.22 + index * 0.035;
  const exitStart = 0.78 - index * 0.025;
  const pathLength = useTransform(
    progress,
    [0, entryStart, entryEnd, exitStart, 1],
    [0, 0, 1, 1, 0],
  );
  const opacity = useTransform(
    progress,
    [0, entryStart, entryEnd, exitStart, 0.96, 1],
    [0, 0, 1, 1, 0.5, 0],
  );

  return (
    <motion.path
      d={path}
      fill="none"
      className={color}
      strokeWidth="2"
      vectorEffect="non-scaling-stroke"
      style={motionEnabled ? { opacity, pathLength } : undefined}
    />
  );
}

export function DestinationFan() {
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
    stiffness: 100,
    damping: 26,
    mass: 0.3,
  });
  const originOpacity = useTransform(
    progress,
    [0, 0.08, 0.84, 1],
    [0, 1, 1, 0],
  );
  const originScale = useTransform(progress, [0, 0.12, 0.82, 1], [0, 1, 1, 0]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="tablet-portrait:block pointer-events-none absolute inset-0 hidden size-full overflow-visible"
    >
      <svg
        focusable="false"
        viewBox="0 0 1000 520"
        preserveAspectRatio="none"
        className="size-full overflow-visible"
      >
        <motion.circle
          cx="500"
          cy="0"
          r="7"
          className="fill-slate-blue"
          style={
            motionEnabled
              ? {
                  opacity: originOpacity,
                  scale: originScale,
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }
              : undefined
          }
        />
        {destinationPaths.map((path, index) => {
          const color = destinationColors[index];
          if (!color) return null;

          return (
            <ScrollLinkedDestinationPath
              key={path}
              path={path}
              color={color}
              index={index}
              progress={progress}
              motionEnabled={motionEnabled}
            />
          );
        })}
      </svg>
    </div>
  );
}
