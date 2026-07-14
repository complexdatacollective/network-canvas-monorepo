import type { ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';

type ExternalLinkProps = {
  href: string;
  children: ReactNode;
};

export function ExternalLink({ href, children }: ExternalLinkProps) {
  return (
    <NativeLink href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </NativeLink>
  );
}
