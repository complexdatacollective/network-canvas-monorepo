'use client';

import type { VariantProps } from 'class-variance-authority';
import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { motion } from 'framer-motion';

import { cn } from '../utils';

export const headingVariants = cva('text-balance [&:not(:first-child)]:mt-6', {
  variants: {
    variant: {
      'h1': 'scroll-m-20 text-3xl font-extrabold tracking-tight',
      'h2': 'scroll-m-20 text-xl font-semibold tracking-tight',
      'h3': 'scroll-m-20 text-lg font-semibold tracking-tight',
      'h4': 'text-md scroll-m-20 font-semibold tracking-tight',
      'h4-all-caps':
        'scroll-m-20 text-sm font-extrabold uppercase tracking-[.2em]',
      'label':
        'scroll-m-20 text-sm font-extrabold tracking-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
    },
  },
});

type VariantPropType = VariantProps<typeof headingVariants>;

const variantElementMap: Record<
  NonNullable<VariantPropType['variant']>,
  string
> = {
  'h1': 'h1',
  'h2': 'h2',
  'h3': 'h3',
  'h4': 'h4',
  'h4-all-caps': 'h4',
  'label': 'label',
};

export type HeadingProps = {
  asChild?: boolean;
  as?: string;
} & React.HTMLAttributes<HTMLHeadingElement> &
  VariantProps<typeof headingVariants>;

const Heading = React.forwardRef<HTMLElement, HeadingProps>(
  ({ className, variant, as, asChild, ...props }, ref) => {
    const Comp = asChild
      ? Slot
      : as ?? (variant ? variantElementMap[variant] : undefined) ?? 'div';
    return (
      <Comp
        className={cn(headingVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);

Heading.displayName = 'Heading';

export const MotionHeading = motion(Heading);

export default Heading;
