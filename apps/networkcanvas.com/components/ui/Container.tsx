import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { cn } from '~/lib/cn';

type ContainerProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;

export function Container({
  as: Comp = 'div',
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <Comp
      {...props}
      className={cn(
        'tablet-landscape:px-10 mx-auto w-full max-w-[1200px] px-6',
        className,
      )}
    >
      {children}
    </Comp>
  );
}
