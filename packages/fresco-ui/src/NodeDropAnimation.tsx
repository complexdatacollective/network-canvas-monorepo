'use client';

import { motion } from 'motion/react';

import { useShouldSkipAnimations } from './hooks/useSafeAnimate';
import { cva, cx, type VariantProps } from './utils/cva';

const DURATION = 2.4;

const nodeDropVariants = cva({
  base: [
    'relative flex shrink-0 items-end justify-center',
    'h-[calc(var(--drop-node-size)*2.25)] w-[calc(var(--drop-node-size)*1.5)]',
  ],
  variants: {
    size: {
      sm: '[--drop-node-size:1.5rem]',
      md: '[--drop-node-size:2.5rem]',
      lg: '[--drop-node-size:3.5rem]',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const slotClasses =
  'absolute bottom-0 size-(--drop-node-size) rounded-full border-2 border-dashed border-current opacity-40';
const nodeClasses =
  'absolute bottom-0 size-(--drop-node-size) rounded-full bg-current opacity-80';

// The node falls from above, squashes as it lands in the slot, rests, then
// fades so the loop can start again.
const nodeKeyframes = {
  y: ['-125%', '-125%', '0%', '0%', '0%', '0%'],
  scaleX: [1, 1, 1.15, 1, 1, 1],
  scaleY: [1, 1, 0.85, 1, 1, 1],
  opacity: [0, 0.8, 0.8, 0.8, 0.8, 0],
};
const nodeTimes = [0, 0.15, 0.45, 0.55, 0.85, 1];

// The slot answers the landing with a small pulse.
const slotKeyframes = {
  scale: [1, 1, 1.15, 1, 1],
  opacity: [0.4, 0.4, 0.7, 0.4, 0.4],
};
const slotTimes = [0, 0.44, 0.52, 0.65, 1];

type NodeDropAnimationProps = {
  className?: string;
} & VariantProps<typeof nodeDropVariants>;

/**
 * A decorative loop of a node dropping into an empty slot, used to invite a
 * participant to drop something on an empty target. It is hidden from
 * assistive technology, so pair it with text that says what to do. With
 * reduced motion it shows a still frame of the node just above its slot.
 */
export default function NodeDropAnimation({
  size,
  className,
}: NodeDropAnimationProps) {
  const skipAnimations = useShouldSkipAnimations();

  if (skipAnimations) {
    return (
      <div
        aria-hidden
        data-testid="node-drop-animation"
        className={cx(nodeDropVariants({ size }), className)}
      >
        <div className={slotClasses} />
        <div className={cx(nodeClasses, '-translate-y-3/4')} />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-testid="node-drop-animation"
      className={cx(nodeDropVariants({ size }), className)}
    >
      <motion.div
        className={slotClasses}
        initial={false}
        animate={slotKeyframes}
        transition={{
          duration: DURATION,
          times: slotTimes,
          ease: 'easeOut',
          repeat: Infinity,
        }}
      />
      <motion.div
        className={cx(nodeClasses, 'origin-bottom')}
        initial={{ y: '-125%', opacity: 0 }}
        animate={nodeKeyframes}
        transition={{
          duration: DURATION,
          times: nodeTimes,
          ease: ['linear', 'easeIn', 'easeOut', 'linear', 'easeIn'],
          repeat: Infinity,
        }}
      />
    </div>
  );
}
