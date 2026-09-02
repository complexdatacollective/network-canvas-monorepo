import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { cn } from '~/lib/cn';

type ContainerProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  maxWidth?: 'default' | 'wide' | 'full';
  /** Vertical rhythm around the container; `none` lets the caller set it. */
  margin?: 'default' | 'none';
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
        'tablet-landscape:px-10 mx-auto w-full px-6',
        maxWidth === 'full'
          ? 'max-w-none'
          : maxWidth === 'wide'
            ? 'max-w-[1400px]'
            : 'max-w-[1200px]',
        className,
      )}
    >
      {children}
    </Comp>
  );
}
