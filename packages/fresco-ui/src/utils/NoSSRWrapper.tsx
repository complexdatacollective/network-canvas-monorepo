import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  useEffect,
  useState,
} from 'react';

/**
 * SSR-safe wrapper. The wrapped tree is mounted only after hydration —
 * useful for components that depend on browser-only APIs (`document`, `window`,
 * Web Workers, layout measurement, etc.).
 *
 * Implementation note: we use a mount-detection pattern (useEffect + useState)
 * rather than Next's `dynamic({ ssr: false })` so the package works in any
 * React environment, not just Next.js.
 */
const NoSSRWrapper = ({ children }: { children: ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
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
