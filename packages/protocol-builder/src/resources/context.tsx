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
  gateway: ProtocolBuilderResourceGateway;
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
      'useResourceGateway must be used inside a ResourceGatewayProvider',
    );
  }
  return gateway;
}
