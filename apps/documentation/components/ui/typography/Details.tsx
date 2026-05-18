'use client';

import { ChevronRight } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';

import { cn } from '~/lib/utils';

import { paragraphVariants } from './Paragraph';

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
        'border-border my-5 rounded-xl border-2 px-5 [&_svg]:open:rotate-90',
        className,
      )}
      {...props}
    >
      {children}
    </details>
  );
});

Details.displayName = 'Details';

// HTMLSummaryElement appears to have been removed from lib.dom; redefine locally.
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
        'flex cursor-pointer list-none items-center gap-2 select-none',
        className,
      )}
      {...props}
    >
      <ChevronRight
        size={24}
        className="text-accent inline-block h-6 w-6 transition-all"
      />
      <div className="my-5">{children}</div>
    </summary>
  );
});

Summary.displayName = 'Summary';
