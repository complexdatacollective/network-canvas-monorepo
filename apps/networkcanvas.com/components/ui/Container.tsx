import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { cn } from '~/lib/cn';

const maxWidths = {
  default: 'max-w-[1200px]',
  wide: 'max-w-[1400px]',
  ultrawide: 'max-w-[1600px]',
  full: 'max-w-none',
} as const;

type ContainerProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  maxWidth?: keyof typeof maxWidths;
  /**
   * Vertical rhythm around the container. `bottom` keeps it below only, for a
   * container that sits close under a page introduction; `none` lets the
   * caller set it.
   */
  margin?: 'default' | 'bottom' | 'none';
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;

export function Container({
  as: Comp = 'div',
  className,
  children,
  maxWidth = 'default',
  margin = 'default',
  ...props
}: ContainerProps) {
  return (
    <Comp
      {...props}
      className={cn(
        margin === 'default' && 'tablet-landscape:my-32 my-20',
        margin === 'bottom' && 'tablet-landscape:mb-32 mb-20',
        'tablet-landscape:px-10 mx-auto w-full px-6',
        maxWidths[maxWidth],
        className,
      )}
    >
      {children}
    </Comp>
  );
}
