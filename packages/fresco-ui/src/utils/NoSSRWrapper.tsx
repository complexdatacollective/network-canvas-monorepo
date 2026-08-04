import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  useSyncExternalStore,
} from 'react';

// The snapshot never changes within an environment, so there is nothing to
// subscribe to.
const emptySubscribe = () => () => {};

/**
 * SSR-safe wrapper. The wrapped tree renders `null` on the server and during
 * the hydration pass, but is present from the very first commit in a
 * client-only render.
 *
 * Implementation note: `useSyncExternalStore` with divergent client/server
 * snapshots is the canonical hydration-safe environment check. The previous
 * useEffect mount-gate blanked the first client frame on *every* mount —
 * a table cell remounting a wrapped component (e.g. TimeAgo) visibly
 * collapsed to zero width and re-expanded a frame later.
 */
const NoSSRWrapper = ({ children }: { children: ReactNode }) => {
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
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
