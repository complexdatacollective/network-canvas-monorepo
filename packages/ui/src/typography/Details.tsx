'use client';

import { type ReactNode, forwardRef } from 'react';
import { cn } from '../utils';
import { headingVariants } from '../typography/Heading';
import { paragraphVariants } from './Paragraph';
import { ChevronRight } from 'lucide-react';

export const Details = forwardRef<
  HTMLDetailsElement,
  {
    children: ReactNode;
    className?: string;
  }
>(({ className, children, ...props }, ref) => {
  return (
    <details
      ref={ref}
      className={cn(
        paragraphVariants({ margin: 'forced' }),
        'rounded-xl border-2 border-border p-4 [&_svg]:open:rotate-90', // Rotate the summary arrow
        className,
      )}
      {...props}
    >
      {children}
    </details>
  );
});

Details.displayName = 'Details';

// It seems like HTMLSummaryElement was removed from lib dom at some point,
// but I can't find any information about it.
type HTMLSummaryElement = HTMLElement & {
  open: boolean;
};

export const Summary = forwardRef<
  HTMLSummaryElement,
  {
    children: ReactNode;
    className?: string;
  }
>(({ className, children, ...props }, ref) => {
  return (
    <summary
      ref={ref}
      className={cn(
        headingVariants({ variant: 'h4', margin: 'none' }),
        'flex cursor-pointer list-none',
        className,
      )}
      {...props}
    >
      <ChevronRight
        size={24}
        className="inline-block h-6 w-6 text-accent transition-all"
      />
      {children}
    </summary>
  );
});

Summary.displayName = 'Summary';
