import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

import { cx } from './utils/cva';

export type ProtocolCardProps = Omit<HTMLMotionProps<'div'>, 'children'> & {
  /** Pattern or other artwork positioned behind the card content. */
  background: ReactNode;
  /** Adds the elevated active-card treatment used by Interviewer. */
  isActive?: boolean;
  /** Overrides the default deck-style pattern-to-surface gradient. */
  gradientClassName?: string;
  children: ReactNode;
};

/**
 * Shared visual shell for protocol previews. It owns the card surface,
 * patterned-background layer, legibility gradient, focus treatment, and
 * active state; consumers provide context-specific content and controls.
 */
export function ProtocolCard({
  background,
  isActive = false,
  gradientClassName,
  className,
  children,
  ...props
}: ProtocolCardProps) {
  return (
    <motion.div
      {...props}
      className={cx(
        'focus-visible:ring-sea-green focus-visible:ring-4 focus-visible:outline-none',
        'text-navy-taupe bg-platinum publish-colors',
        '@container relative w-full overflow-clip rounded',
        'border-platinum-dark border-[0.15cqi]',
        isActive && 'spring-medium',
        className,
      )}
    >
      {background}
      <div
        aria-hidden
        className={cx(
          'to-platinum from-rich-black/20 via-platinum/80 absolute inset-0 size-full bg-linear-to-b via-30% to-70%',
          gradientClassName,
        )}
      />
      {children}
    </motion.div>
  );
}
