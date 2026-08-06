import NextImage from 'next/image';
import NextLink from 'next/link';

/**
 * The navigation and image primitives, in one module so the client tree never
 * imports `next/*` directly.
 *
 * `vite.config.ts` aliases this module to `src/components/nav.tsx` for the
 * TanStack Start build. Without it, a single `next/link` in a shared component
 * drags Next's client runtime — `afterTaskAsyncStorage` and all — into the Vite
 * browser bundle.
 *
 * This is the `~/lib/router` shim the assessment proposed as Phase 2a, and its
 * estimate holds: it collapses the client-tree migration from ~33 files that
 * each import `next/*` to one file per host.
 */

export type LinkProps = {
  'href': string;
  'children'?: React.ReactNode;
  'className'?: string;
  'target'?: string;
  'rel'?: string;
  'aria-label'?: string;
};

export function Link({ href, ...props }: LinkProps) {
  return <NextLink href={{ pathname: href }} {...props} />;
}

export type ImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
};

export function Image(props: ImageProps) {
  return <NextImage {...props} />;
}
