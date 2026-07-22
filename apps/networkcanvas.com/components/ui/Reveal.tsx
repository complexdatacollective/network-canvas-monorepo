'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'left' | 'right' | 'up' | 'zoom';
  distance?: number;
  duration?: number;
  easing?: [number, number, number, number];
} & Omit<
  ComponentProps<typeof motion.div>,
  'children' | 'initial' | 'transition' | 'viewport' | 'whileInView'
>;

export function Reveal({
  children,
  className,
  delay = 0,
  direction = 'up',
  distance = 24,
  duration = 0.5,
  easing,
  ...props
}: RevealProps) {
  const shouldReduceMotion = useReducedMotion();
  const initial = {
    opacity: 0,
    x: direction === 'left' ? -distance : direction === 'right' ? distance : 0,
    y: direction === 'up' || direction === 'zoom' ? distance : 0,
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
