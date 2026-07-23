import type { ReactNode } from 'react';

import { ButtonLink } from '~/components/ui/ButtonLink';

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
    <ButtonLink
      external
      href={href}
      color={secondary ? 'dynamic' : 'success'}
      size={compact ? 'md' : 'lg'}
      textStyle={secondary ? 'uppercase' : undefined}
      variant={secondary ? 'outline' : 'raised'}
      target={target}
    >
      {children}
    </ButtonLink>
  );
}
