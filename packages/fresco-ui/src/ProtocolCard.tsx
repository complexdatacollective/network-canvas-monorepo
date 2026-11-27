'use client';

import { motion, spring, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

import { springs } from './motion';
import { cx } from './utils/cva';

export type ProtocolCardProps = Omit<HTMLMotionProps<'div'>, 'children'> & {
  /** Pattern or other artwork positioned behind the card content. */
  background: ReactNode;
  /**
   * Marks the card that Interviewer's deck has selected: a change to the
   * card's shadow eases in while it is active.
   */
  isActive?: boolean;
  /** Overrides the default deck-style pattern-to-surface gradient. */
  gradientClassName?: string;
  children: ReactNode;
};

/**
 * The active card's elevation (a consumer's shadow class, such as Interviewer's
 * `effect-shadow-2xl`) eases in on the `settle` spring. Only `box-shadow`
 * transitions: the card is often a Motion `layout` element, and a CSS
 * transition on its transform or border radius would lag behind the values
 * that Motion writes each frame.
 */
const activeTransition = `box-shadow ${spring(
  springs.settle.visualDuration,
  springs.settle.bounce,
).toString()}`;

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
  style,
  ...props
}: ProtocolCardProps) {
  return (
    <motion.div
      {...props}
      style={isActive ? { transition: activeTransition, ...style } : style}
      className={cx(
        'focus-visible:ring-sea-green focus-visible:ring-4 focus-visible:outline-none',
        'text-navy-taupe bg-platinum publish-colors',
        '@container relative w-full overflow-clip rounded',
        'border-platinum-dark border-[0.15cqi]',
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
