'use client';

import type { VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '../utils';

export const baseParagraphClasses = 'text-pretty font-normal';

export const paragraphVariants = cva(baseParagraphClasses, {
  variants: {
    variant: {
      default: '',
      blockquote: 'mt-6 border-l-2 pl-6 italic',
      inlineCode:
        'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
      lead: 'text-lg',
      mutedText: 'text-muted',
      smallText: 'text-sm',
    },
    margin: {
      default: '[p+&]:mt-5',
      forced: 'mt-5',
      none: 'mt-0',
    },
  },
  compoundVariants: [
    {
      variant: 'lead',
      margin: 'default',
      // className: '!my-7',
    },
  ],
  defaultVariants: {
    variant: 'default',
    margin: 'default',
  },
});

export type ParagraphProps = {
  variant?: VariantProps<typeof paragraphVariants>['variant'];
  margin?: VariantProps<typeof paragraphVariants>['margin'];
  asChild?: boolean;
} & React.HTMLAttributes<HTMLParagraphElement>;

const Paragraph = forwardRef<HTMLParagraphElement, ParagraphProps>(
  ({ className, variant, margin, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn(paragraphVariants({ variant, margin, className }))}
        {...props}
      />
    );
  },
);

Paragraph.displayName = 'Paragraph';

export default Paragraph;
