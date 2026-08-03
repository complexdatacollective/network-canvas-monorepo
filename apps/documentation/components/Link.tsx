import NextLink from 'next/link';
import { type ComponentProps, forwardRef, type ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { resolveNetworkCanvasUrl } from '~/lib/siteUrls';
import { externalLinkProps } from '~/lib/utils';

// An inline link to an app route, rendered via next/link for client-side
// navigation. External destinations open in a new tab. This is what every
// markdown link compiles to; static-asset downloads are not handled here —
// authors mark those explicitly with DownloadLink.
const Link = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof NextLink> & { children: ReactNode }
>(({ className, children, ...props }, ref) => {
  const href =
    typeof props.href === 'string'
      ? (resolveNetworkCanvasUrl(props.href) as ComponentProps<
          typeof NextLink
        >['href'])
      : props.href;
  const external = typeof href === 'string' ? externalLinkProps(href) : {};
  return (
    <NativeLink
      ref={ref}
      className={className}
      render={(linkProps) => (
        <NextLink {...props} href={href} {...external} {...linkProps} />
      )}
    >
      {children}
    </NativeLink>
  );
});

Link.displayName = 'Link';

export default Link;
