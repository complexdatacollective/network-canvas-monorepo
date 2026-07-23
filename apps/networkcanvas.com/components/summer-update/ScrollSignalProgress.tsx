'use client';

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';

const springSettings = [
  { stiffness: 220, damping: 34, mass: 0.28 },
  { stiffness: 180, damping: 32, mass: 0.34 },
  { stiffness: 145, damping: 29, mass: 0.4 },
  { stiffness: 115, damping: 26, mass: 0.48 },
] as const;

const signalClasses = [
  'top-0 bg-neon-coral',
  'top-0.5 bg-sea-serpent',
  'top-1 bg-mustard',
  'top-1.5 bg-sea-green',
] as const;

export function ScrollSignalProgress() {
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const coralProgress = useSpring(scrollYProgress, springSettings[0]);
  const serpentProgress = useSpring(scrollYProgress, springSettings[1]);
  const mustardProgress = useSpring(scrollYProgress, springSettings[2]);
  const greenProgress = useSpring(scrollYProgress, springSettings[3]);
  const progressValues = shouldReduceMotion
    ? [scrollYProgress, scrollYProgress, scrollYProgress, scrollYProgress]
    : [coralProgress, serpentProgress, mustardProgress, greenProgress];
  const signalHeadPosition = useTransform(
    shouldReduceMotion ? scrollYProgress : coralProgress,
    (progress) => `${progress * 100}%`,
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-2 overflow-hidden"
    >
      <div className="bg-text/10 absolute inset-x-0 top-0 h-1" />
      {progressValues.map((progress, index) => (
        <motion.span
          key={signalClasses[index]}
          className={`absolute inset-x-0 h-0.5 origin-left ${signalClasses[index]}`}
          style={{ scaleX: progress }}
        />
      ))}
      <motion.span
        className="border-background bg-neon-coral absolute top-0 size-2 -translate-x-1/2 rounded-full border-2"
        style={{ left: signalHeadPosition }}
      />
    </div>
  );
}
