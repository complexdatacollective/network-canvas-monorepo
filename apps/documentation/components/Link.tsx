import NextLink from 'next/link';
import { type ComponentProps, forwardRef, type ReactNode } from 'react';

import { cn, externalLinkProps, isInternalAsset } from '~/lib/utils';

const Link = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof NextLink> & { children: ReactNode; className?: string }
>((props, ref) => {
  const className = cn(
    'focusable group text-link font-semibold transition-[background-size] duration-300 ease-in-out',
    props.className,
  );
  const label = (
    <span className="from-link to-link bg-linear-to-r bg-size-[0%_2px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-200 ease-out group-hover:bg-size-[100%_2px]">
      {props.children}
    </span>
  );

  // Downloads (protocol bundles, rosters) point at static files in /public, not
  // app routes. next/link would client-side route to a non-existent page and
  // bounce to the not-found fallback, so render a plain <a download> instead.
  if (typeof props.href === 'string' && isInternalAsset(props.href)) {
    return (
      <a ref={ref} href={props.href} download className={className}>
        {label}
      </a>
    );
  }

  const external =
    typeof props.href === 'string' ? externalLinkProps(props.href) : {};
  return (
    <NextLink ref={ref} className={className} {...props} {...external}>
      {label}
    </NextLink>
  );
});

Link.displayName = 'Link';

export default Link;
