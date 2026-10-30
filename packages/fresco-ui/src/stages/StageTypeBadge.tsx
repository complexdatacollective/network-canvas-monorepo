import { createElement } from 'react';
import type * as React from 'react';

import { cva, cx, type VariantProps } from '../utils/cva';
import { stageColorStyle, stageIcon } from './stageTypes';

const stageTypeBadgeVariants = cva({
  base: 'inline-flex shrink-0 items-center justify-center rounded-full',
  variants: {
    size: {
      sm: 'size-6 [&>svg]:size-3.5',
      md: 'size-10 [&>svg]:size-5',
      lg: 'size-12 [&>svg]:size-6',
      xl: 'size-14 [&>svg]:size-6.5',
    },
    // A white ring keeps every colour distinct from a dark page and turns the
    // badge into a stop on a timeline.
    ringed: {
      true: 'ring-white',
      false: '',
    },
  },
  compoundVariants: [
    { size: 'sm', ringed: true, className: 'ring-2' },
    { size: 'md', ringed: true, className: 'ring-2' },
    { size: 'lg', ringed: true, className: 'ring-4' },
    { size: 'xl', ringed: true, className: 'ring-8' },
  ],
  defaultVariants: {
    size: 'md',
    ringed: false,
  },
});

// Larger icons take a heavier stroke so they keep the weight of the small ones.
const ICON_STROKE = { sm: 2, md: 2, lg: 2.5, xl: 2.75 } as const;

type StageTypeBadgeProps = {
  /** A stage type. One this build does not know is drawn in a neutral grey. */
  type: string;
} & VariantProps<typeof stageTypeBadgeVariants> &
  Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>;

/**
 * A stage type's icon on a disc of its colour from `STAGE_TYPES`. Decorative:
 * the stage is always named in text beside it, so the badge is hidden from
 * assistive technology.
 */
export function StageTypeBadge({
  type,
  size,
  ringed,
  className,
  style,
  ...props
}: StageTypeBadgeProps) {
  const { color, contrast } = stageColorStyle(type);
  return (
    <span
      aria-hidden
      className={cx(stageTypeBadgeVariants({ size, ringed }), className)}
      style={{ backgroundColor: color, color: contrast, ...style }}
      {...props}
    >
      {createElement(stageIcon(type), {
        strokeWidth: ICON_STROKE[size ?? 'md'],
      })}
    </span>
  );
}
