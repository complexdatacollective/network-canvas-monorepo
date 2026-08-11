import { forwardRef, type ReactNode } from 'react';

import { cn } from '~/lib/cn';

export const Section = forwardRef<
  HTMLElement,
  { children: ReactNode } & React.HTMLAttributes<HTMLElement>
>(({ children, className, ...rest }, ref) => (
  <section
    ref={ref}
    className={cn('tablet-landscape:px-10 relative my-24 px-6', className)}
    {...rest}
  >
    {children}
  </section>
));

Section.displayName = 'Section';
