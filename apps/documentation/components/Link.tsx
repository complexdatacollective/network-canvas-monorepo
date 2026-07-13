import NextLink from 'next/link';
import { type ComponentProps, forwardRef, type ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { externalLinkProps } from '~/lib/utils';

// An inline link to an app route, rendered via next/link for client-side
// navigation. External destinations open in a new tab. This is what every
// markdown link compiles to; static-asset downloads are not handled here —
// authors mark those explicitly with DownloadLink.
const Link = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof NextLink> & { children: ReactNode }
>(({ className, children, ...props }, ref) => {
  const external =
    typeof props.href === 'string' ? externalLinkProps(props.href) : {};
  return (
    <NativeLink
      ref={ref}
      className={className}
      render={(linkProps) => (
        <NextLink {...props} {...external} {...linkProps} />
      )}
    >
      {children}
    </NativeLink>
  );
});

Link.displayName = 'Link';

export default Link;
