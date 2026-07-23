'use client';

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import {
  type ComponentProps,
  type ReactNode,
  useRef,
  useSyncExternalStore,
} from 'react';

type RevealDirection = 'left' | 'right' | 'up' | 'zoom';

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: RevealDirection;
  distance?: number;
  duration?: number;
  easing?: [number, number, number, number];
  scrollLinked?: boolean;
  scrollStagger?: number;
} & Omit<
  ComponentProps<typeof motion.div>,
  'children' | 'initial' | 'transition' | 'viewport' | 'whileInView'
>;

type RevealContentProps = Omit<RevealProps, 'scrollLinked' | 'scrollStagger'>;

type ScrollLinkedRevealProps = RevealContentProps & {
  scrollStagger: number;
};

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function getEntryOffset(direction: RevealDirection, distance: number) {
  return {
    x: direction === 'left' ? -distance : direction === 'right' ? distance : 0,
    y: direction === 'up' || direction === 'zoom' ? distance : 0,
  };
}

function ScrollLinkedReveal({
  children,
  className,
  delay = 0,
  direction = 'up',
  distance = 24,
  duration: _duration,
  easing: _easing,
  scrollStagger,
  style,
  ...props
}: ScrollLinkedRevealProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const motionEnabled = hasHydrated && shouldReduceMotion === false;
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ['start 92%', 'end 8%'],
  });
  const phaseShift = Math.min(0.14, delay * 0.18 * scrollStagger);
  const phases = [
    phaseShift,
    0.18 + phaseShift,
    0.78 - phaseShift,
    1 - phaseShift,
  ];
  const entryOffset = getEntryOffset(direction, distance);
  const opacity = useTransform(scrollYProgress, phases, [0, 1, 1, 0.12]);
  const x = useTransform(scrollYProgress, phases, [
    entryOffset.x,
    0,
    0,
    entryOffset.x * -0.65,
  ]);
  const y = useTransform(scrollYProgress, phases, [
    entryOffset.y,
    0,
    0,
    entryOffset.y * -0.65,
  ]);
  const scale = useTransform(
    scrollYProgress,
    phases,
    direction === 'zoom' ? [0.955, 1, 1, 0.975] : [1, 1, 1, 1],
  );

  return (
    <motion.div
      ref={targetRef}
      style={
        motionEnabled
          ? {
              ...style,
              opacity,
              scale,
              x,
              y,
            }
          : style
      }
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

function InViewReveal({
  children,
  className,
  delay = 0,
  direction = 'up',
  distance = 24,
  duration = 0.5,
  easing,
  ...props
}: RevealContentProps) {
  const shouldReduceMotion = useReducedMotion();
  const entryOffset = getEntryOffset(direction, distance);
  const initial = {
    opacity: 0,
    ...entryOffset,
    scale: direction === 'zoom' ? 0.955 : 1,
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : initial}
      whileInView={
        shouldReduceMotion ? undefined : { opacity: 1, x: 0, y: 0, scale: 1 }
      }
      viewport={{ once: true, margin: '0px 0px -7% 0px' }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration, ease: easing ?? 'easeOut', delay }
      }
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Reveal({
  scrollLinked = false,
  scrollStagger = 1,
  ...props
}: RevealProps) {
  return scrollLinked ? (
    <ScrollLinkedReveal {...props} scrollStagger={scrollStagger} />
  ) : (
    <InViewReveal {...props} />
  );
}
