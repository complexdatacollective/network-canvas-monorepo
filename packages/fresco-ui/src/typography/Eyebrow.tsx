import { type useRender as UseRender, useRender } from '@base-ui/react';
import * as React from 'react';

import { cva, cx, type VariantProps } from '../utils/cva';

export const eyebrowVariants = cva({
  base: 'font-monospace text-xs leading-tight font-bold tracking-widest uppercase',
  variants: {
    tone: {
      default: 'text-current',
      muted: 'text-current/60',
      primary: 'text-primary',
    },
  },
  defaultVariants: {
    tone: 'muted',
  },
});

type EyebrowProps = {
  render?: UseRender.RenderProp;
} & React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof eyebrowVariants>;

/**
 * A short uppercase label set above or beside something else: a category
 * marker, a field label in a fact list, a "featured" flag. Bold monospace at
 * the smallest size, with tight leading so it never reads as a line of copy.
 *
 * Renders a `<p>` by default; use `render` to substitute `<span>`, `<dt>` or
 * another element that fits the surrounding semantics.
 */
const Eyebrow = React.forwardRef<HTMLElement, EyebrowProps>(
  ({ className, tone, render, ...props }, ref) => {
    return useRender({
      render,
      ref,
      props: {
        className: cx(eyebrowVariants({ tone, className })),
        ...props,
      },
      defaultTagName: 'p',
    });
  },
);

Eyebrow.displayName = 'Eyebrow';

export default Eyebrow;
