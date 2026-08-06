import { Link as RouterLink } from '@tanstack/react-router';

import type { ImageProps, LinkProps } from '~/components/ui/nav';

/**
 * The TanStack Start implementation of `components/ui/nav.tsx`, substituted by
 * a `vite.config.ts` alias.
 *
 * `Image` is a plain `<img>`. TanStack Start has no first-party image
 * component and no server-side resizer, and the documented alternative
 * (`@unpic/react`) delegates resizing to a CDN that a self-hosted Docker
 * deployment does not have. Dropping optimisation was an explicit product
 * decision, not a default: the call sites are small fixed-size dashboard icons
 * served from `/public`, where the optimiser was contributing nothing. `sharp`
 * would leave the dependency list with the last `next/image` site.
 */

export function Link({ href, children, ...props }: LinkProps) {
  return (
    <RouterLink to={href} {...props}>
      {children}
    </RouterLink>
  );
}

export function Image({ src, alt, width, height, className }: ImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
    />
  );
}
