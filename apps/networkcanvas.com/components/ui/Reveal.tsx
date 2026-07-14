'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
} & Omit<ComponentProps<typeof motion.div>, 'children'>;

export function Reveal({
  children,
  className,
  delay = 0,
  ...props
}: RevealProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.5, ease: 'easeOut', delay }
      }
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
