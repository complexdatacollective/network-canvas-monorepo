import { createContext, useContext, type ReactNode } from 'react';

import type { ProtocolBuilderResourceGateway } from './gateway';

/**
 * The resource gateway a stage editor's resource pickers talk to. The host
 * (Architect's session adapter, the Storybook proof host) supplies it once at
 * the shell; pickers, previews, and Sections reach it only through
 * `useResourceGateway`, never through a host store or storage API.
 */
const ResourceGatewayContext = createContext<
  ProtocolBuilderResourceGateway | undefined
>(undefined);

type ResourceGatewayProviderProps = Readonly<{
  /**
   * The session's gateway, or `undefined` for a session opened without one.
   *
   * `undefined` is provided rather than left alone on purpose: a session with
   * no gateway must not fall through to whichever provider happens to be above
   * it — one editor nested in another would otherwise stage into the outer
   * session, which neither tracks nor cleans up what it staged.
   */
  gateway: ProtocolBuilderResourceGateway | undefined;
  children: ReactNode;
}>;

export function ResourceGatewayProvider({
  gateway,
  children,
}: ResourceGatewayProviderProps) {
  return (
    <ResourceGatewayContext.Provider value={gateway}>
      {children}
    </ResourceGatewayContext.Provider>
  );
}

export function useResourceGateway(): ProtocolBuilderResourceGateway {
  const gateway = useContext(ResourceGatewayContext);
  if (gateway === undefined) {
    throw new Error(
      'useResourceGateway must be used inside a ResourceGatewayProvider with a gateway: this editing session was opened without one, and a resource control cannot stage into another session',
    );
  }
  return gateway;
}
