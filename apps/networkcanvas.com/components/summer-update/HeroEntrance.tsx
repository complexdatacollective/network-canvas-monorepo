import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

import { summerUpdateEasing } from './summerUpdateMotion';

export function HeroEntrance({
  bar,
  children,
  className,
  delay,
  direction = 'up',
}: {
  bar?: boolean;
  children?: ReactNode;
  className?: string;
  delay: number;
  direction?: 'down' | 'up';
}) {
  const shouldReduceMotion = useReducedMotion();
  const initial = bar
    ? { opacity: 0, scaleX: 0 }
    : {
        opacity: 0,
        y: direction === 'down' ? -16 : 30,
      };
  const visible = bar ? { opacity: 1, scaleX: 1 } : { opacity: 1, y: 0 };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : initial}
      animate={shouldReduceMotion ? undefined : visible}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : {
              duration: bar ? 1 : 0.9,
              delay,
              ease: summerUpdateEasing,
            }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}
