import NextLink from 'next/link';
import { type ComponentProps, forwardRef, type ReactNode } from 'react';

import { LinkLabel, linkRootClass } from './linkStyles';

// An inline link to an app route, rendered via next/link for client-side
// navigation. This is what every markdown link compiles to; static-asset
// downloads are not handled here — authors mark those explicitly with
// DownloadLink.
const Link = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof NextLink> & { children: ReactNode; className?: string }
>(({ className, children, ...props }, ref) => (
  <NextLink ref={ref} className={linkRootClass(className)} {...props}>
    <LinkLabel>{children}</LinkLabel>
  </NextLink>
));

Link.displayName = 'Link';

export default Link;
