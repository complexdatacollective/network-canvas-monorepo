'use client';

import { type ComponentProps, type ComponentType, type ReactNode } from 'react';

import useHasHydrated from '../hooks/useHasHydrated';

/**
 * SSR-safe wrapper. The wrapped tree renders `null` on the server and during
 * the hydration pass, but is present from the very first commit in a
 * client-only render.
 *
 * That last property is why this reads `useHasHydrated` rather than a mount
 * flag: the useEffect mount-gate this replaced blanked the first client frame
 * on *every* mount, so a table cell remounting a wrapped component (e.g.
 * TimeAgo) visibly collapsed to zero width and re-expanded a frame later.
 */
const NoSSRWrapper = ({ children }: { children: ReactNode }) => {
  const hydrated = useHasHydrated();
  return hydrated ? children : null;
};

export const withNoSSRWrapper = <P extends object>(
  WrappedComponent: ComponentType<P>,
): React.FC<ComponentProps<ComponentType<P>>> => {
  const WithNoSSRWrapper: React.FC<ComponentProps<ComponentType<P>>> = (
    props,
  ) => (
    <NoSSRWrapper>
      <WrappedComponent {...props} />
    </NoSSRWrapper>
  );
  return WithNoSSRWrapper;
};
