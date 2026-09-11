import type { ReactNode } from 'react';

import Button from '@codaco/fresco-ui/Button';

export function ActionButton({
  children,
  compact,
  href,
  secondary,
  target,
}: {
  children: ReactNode;
  compact?: boolean;
  href: string;
  secondary?: boolean;
  target?: string;
}) {
  return (
    <Button
      asChild
      color={secondary ? 'dynamic' : 'success'}
      size={compact ? 'md' : 'lg'}
      textStyle={secondary ? 'uppercase' : undefined}
      variant={secondary ? 'outline' : 'raised'}
    >
      <a href={href} target={target} rel="noreferrer">
        {children}
      </a>
    </Button>
  );
}
