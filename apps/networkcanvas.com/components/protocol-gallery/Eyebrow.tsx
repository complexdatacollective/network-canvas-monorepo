import type { ComponentPropsWithoutRef, ElementType } from 'react';

import { cn } from '~/lib/cn';

type MonoTextProps<T extends ElementType> = {
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className'>;

export function Eyebrow<T extends ElementType = 'p'>({
  as,
  className,
  tone = 'muted',
  ...props
}: MonoTextProps<T> & { tone?: 'muted' | 'primary' }) {
  const Component = as ?? 'p';
  return (
    <Component
      className={cn(
        'font-monospace text-xs tracking-widest uppercase',
        tone === 'primary' ? 'text-primary' : 'text-text/55',
        className,
      )}
      {...props}
    />
  );
}

export function MonoCaption<T extends ElementType = 'p'>({
  as,
  className,
  ...props
}: MonoTextProps<T>) {
  const Component = as ?? 'p';
  return (
    <Component
      className={cn('font-monospace text-text/60 text-xs', className)}
      {...props}
    />
  );
}
