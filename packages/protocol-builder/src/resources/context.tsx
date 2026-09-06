import { createContext, useContext, type ReactNode } from 'react';

import type { ProtocolBuilderResourceGateway } from './gateway';
import type { StagedResourceReferenceGuard } from './lifecycle.ts';

/**
 * A gateway as a control receives it: the host's port, and — when the editor
 * is inside an editing session, which is how a host wires it — the session's
 * own reference guard as well.
 *
 * Optional rather than required because a control can be rendered over a
 * host's gateway directly, in a story or a test of the control alone. There is
 * no session there to serialize a discard against, and nothing staged that
 * outlives the surface, so a reference taken in that state is always its own.
 */
export type ProvidedResourceGateway = ProtocolBuilderResourceGateway &
  Partial<StagedResourceReferenceGuard>;

/**
 * The resource gateway a stage editor's resource pickers talk to. The host
 * (Architect's session adapter, the Storybook proof host) supplies it once at
 * the shell; pickers, previews, and Sections reach it only through
 * `useResourceGateway`, never through a host store or storage API.
 */
const ResourceGatewayContext = createContext<
  ProvidedResourceGateway | undefined
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
  gateway: ProvidedResourceGateway | undefined;
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

export function useResourceGateway(): ProvidedResourceGateway {
  const gateway = useContext(ResourceGatewayContext);
  if (gateway === undefined) {
    throw new Error(
      'useResourceGateway must be used inside a ResourceGatewayProvider with a gateway: this editing session was opened without one, and a resource control cannot stage into another session',
    );
  }
  return gateway;
}
