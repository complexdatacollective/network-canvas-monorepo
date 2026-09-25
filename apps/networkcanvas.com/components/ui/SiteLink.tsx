import type { ComponentProps } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { Link } from '~/lib/i18n/navigation';

type SiteLinkProps = Omit<
  ComponentProps<typeof NativeLink>,
  'href' | 'render' | 'target' | 'rel'
> & { href: string };

/**
 * A link that keeps the visitor's locale on the site's own pages and opens
 * other websites in a new tab.
 */
export function SiteLink({ href, ...props }: SiteLinkProps) {
  if (href.startsWith('/')) {
    return <NativeLink {...props} href={href} render={<Link href={href} />} />;
  }
  if (/^https?:\/\//.test(href)) {
    return (
      <NativeLink {...props} href={href} target="_blank" rel="noreferrer" />
    );
  }
  return <NativeLink {...props} href={href} />;
}
