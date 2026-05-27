import type { ElementType, ReactNode } from 'react';

import { cn } from '~/lib/cn';

type ContainerProps = {
  as?: ElementType;
  className?: string;
  id?: string;
  children: ReactNode;
};

export function Container({
  as: Comp = 'div',
  className,
  id,
  children,
}: ContainerProps) {
  return (
    <Comp
      id={id}
      className={cn(
        'tablet-landscape:px-10 mx-auto w-full max-w-[1200px] px-6',
        className,
      )}
    >
      {children}
    </Comp>
  );
}
