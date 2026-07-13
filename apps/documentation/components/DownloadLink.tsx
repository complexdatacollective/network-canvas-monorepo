import { type ComponentProps, forwardRef } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';

// Renders a static download (protocol bundle, roster) as a plain <a download>.
// Authors reach for this explicitly in content
// (<DownloadLink href="/protocols/Example.netcanvas">…</DownloadLink>) when a
// link points at a file in /public rather than an app route — next/link would
// client-side route to a non-existent page and bounce to the not-found
// fallback. Forwards all anchor props (title, onClick, aria-*, data-*); only
// `download` and the shared className are imposed.
const DownloadLink = forwardRef<HTMLAnchorElement, ComponentProps<'a'>>(
  ({ className, children, ...props }, ref) => (
    <NativeLink ref={ref} className={className} {...props} download>
      {children}
    </NativeLink>
  ),
);

DownloadLink.displayName = 'DownloadLink';

export default DownloadLink;
