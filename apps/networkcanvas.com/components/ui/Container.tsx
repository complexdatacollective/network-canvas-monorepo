import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { cn } from '~/lib/cn';

type ContainerProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  maxWidth?: 'default' | 'wide';
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;

export function Container({
  as: Comp = 'div',
  className,
  children,
  maxWidth = 'default',
  ...props
}: ContainerProps) {
  return (
    <Comp
      {...props}
      className={cn(
        'tablet-landscape:px-10 mx-auto w-full px-6',
        maxWidth === 'wide' ? 'max-w-[1400px]' : 'max-w-[1200px]',
        className,
      )}
    >
      {children}
    </Comp>
  );
}
