import { type useRender as UseRender, useRender } from '@base-ui/react';
import * as React from 'react';

import { cva, cx, type VariantProps } from '../utils/cva';

export const headingVariants = cva({
  // `wrap-break-word`: headings carry researcher-authored identifiers (a
  // variable name, a protocol name, a resource filename), any of which can be
  // one unbroken token longer than its container. Without it such a heading
  // overflows its box rather than breaking — inside a dialog, straight past the
  // clipped edge (#1392).
  base: 'font-heading scroll-m-20 text-pretty wrap-break-word',
  variants: {
    level: {
      h1: 'text-3xl font-bold',
      h2: 'text-2xl font-bold',
      h3: 'text-xl font-bold',
      h4: 'text-lg font-bold',
      label: 'text-base leading-snug font-bold',
    },
    variant: {
      'default': '',
      'all-caps': 'tracking-widest uppercase',
      'page-heading': 'text-4xl',
      'display-heading': 'text-6xl font-black',
      'section-heading': 'text-4xl font-black',
      'subheading': 'text-2xl font-black',
    },
    margin: {
      default: 'mt-0 mb-0 not-first:mt-[1em] not-last:mb-[0.5em]',
      none: 'm-0!',
    },
  },
  defaultVariants: {
    level: 'h2',
    variant: 'default',
    margin: 'default',
  },
  compoundVariants: [
    { level: 'h4', variant: 'all-caps', className: 'text-sm font-black' },
  ],
});

const levelToTagName = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  label: 'h4',
} as const;

type HeadingProps = {
  render?: UseRender.RenderProp;
} & React.HTMLAttributes<HTMLHeadingElement> &
  VariantProps<typeof headingVariants>;

const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, variant, level = 'h2', margin, render, ...props }, ref) => {
    return useRender({
      render,
      ref,
      props: {
        // Trimmed to its caps and baseline so the margin above starts at the
        // cap line and the margin below at the baseline, instead of at the
        // line box's invisible leading.
        className: cx(
          'text-box-trim',
          headingVariants({ variant, level, margin, className }),
        ),
        ...props,
      },
      defaultTagName: levelToTagName[level],
    });
  },
);

Heading.displayName = 'Heading';

export default Heading;
