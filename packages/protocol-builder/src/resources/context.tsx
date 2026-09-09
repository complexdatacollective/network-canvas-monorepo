import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type {
  ProtocolBuilderResourceGateway,
  ResourceInspection,
  ResourceResult,
} from './gateway';
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

/**
 * Asks the gateway about one resource, joining a question already being asked
 * about the same one rather than asking it again.
 */
export type SharedInspect = (
  resourceId: string,
) => Promise<ResourceResult<ResourceInspection>>;

/**
 * The shared inspection: the question every consumer asks, and the way any one
 * of them asks it again on behalf of all of them.
 *
 * The answer is deliberately not shared (see {@link useSharedInspect}), so
 * each consumer holds its own — which makes "ask again" a thing that has to
 * reach every one of them rather than only the control the researcher clicked
 * in. The picker is the only place a retry is offered, and a retry that
 * refreshed the picker alone would leave every section reading the same file
 * still holding the failure: the summary saying it could not be read, and
 * every list built from its columns empty, until the editor was reopened.
 */
export type SharedInspection = Readonly<{
  inspect: SharedInspect;
  /**
   * Asks every consumer holding an answer about this resource to read it
   * again. Their calls are made in the same tick, so they join as one.
   */
  refresh: (resourceId: string) => void;
  /** Registers a consumer to be asked again, and answers with the way off. */
  subscribe: (resourceId: string, reload: () => void) => () => void;
}>;

/**
 * One inspection per resource, however many controls are waiting on it.
 *
 * A roster stage asks what is inside its data file from five places at once —
 * the picker, and every section that names one of the file's columns — and
 * each of them mounts and re-reads in the same commit. `inspect` is a read the
 * gateway is free to make expensive: a real one fetches the bytes and parses
 * the whole CSV or JSON to answer what attributes the file's people carry, so
 * five callers is five parses of the same file for one answer, every time the
 * editor opens and every time the researcher swaps the file.
 *
 * So the CALL is shared rather than the answer. A question already in flight is
 * joined; one that has settled is asked afresh, because nothing here knows when
 * a host's answer stops being true — a resource can be replaced, promoted or
 * discarded, and a cache would go on describing the file that was there. Each
 * caller keeps its own busy state and its own failure, and reads the shared
 * answer exactly as it read its own.
 *
 * Asking AGAIN is shared too, and has to be: an answer each caller holds
 * separately is one each caller has to be told to replace. `refresh` is what
 * one caller's retry does to all of them, and because they all ask in the same
 * tick their calls join as one — so the retry offered on the picker costs the
 * same single read the first question did, and leaves nothing behind still
 * describing a file the host has since read perfectly well.
 *
 * Safe to share because `inspect` is idempotent and carries nothing — see the
 * gateway's own note on retryable reads. Nothing else here may be shared this
 * way: a call that STAGES or PROMOTES is idempotent only against its
 * caller-supplied request id.
 */
function useSharedInspect(
  gateway: ProvidedResourceGateway | undefined,
): SharedInspection | undefined {
  return useMemo(() => {
    if (gateway === undefined) return undefined;
    const inFlight = new Map<
      string,
      Promise<ResourceResult<ResourceInspection>>
    >();
    const consumers = new Map<string, Set<() => void>>();
    const inspect = (resourceId: string) => {
      const joined = inFlight.get(resourceId);
      if (joined !== undefined) return joined;
      // Dropped as it settles, both ways: a rejection is the caller's to
      // handle — `callGateway` does — and a rejected promise nobody is left
      // holding is an unhandled rejection.
      const asked = Promise.resolve(gateway.inspect(resourceId)).then(
        (result) => {
          inFlight.delete(resourceId);
          return result;
        },
        (error: unknown) => {
          inFlight.delete(resourceId);
          throw error;
        },
      );
      inFlight.set(resourceId, asked);
      return asked;
    };

    const subscribe = (resourceId: string, reload: () => void) => {
      const registered = consumers.get(resourceId) ?? new Set<() => void>();
      registered.add(reload);
      consumers.set(resourceId, registered);
      return () => {
        registered.delete(reload);
        // The set itself goes with the last consumer of that resource: a
        // session that swaps files all afternoon would otherwise keep one
        // empty set per file it has ever held.
        if (registered.size === 0) consumers.delete(resourceId);
      };
    };

    const refresh = (resourceId: string) => {
      const registered = consumers.get(resourceId);
      if (registered === undefined) return;
      // Taken before it is walked: a consumer that goes away — or arrives —
      // while the others are being asked must not decide whether the rest are.
      const asking = Array.from(registered);
      for (const reload of asking) reload();
    };

    return Object.freeze({ inspect, refresh, subscribe });
  }, [gateway]);
}

const ResourceInspectContext = createContext<SharedInspection | undefined>(
  undefined,
);

/**
 * The shared inspection, for the one hook that reads a resource
 * (`useResourceInspection`). Everything else reaches the gateway directly.
 */
export function useResourceInspect(): SharedInspection {
  const inspect = useContext(ResourceInspectContext);
  if (inspect === undefined) {
    throw new Error(
      'useResourceInspect must be used inside a ResourceGatewayProvider with a gateway: this editing session was opened without one, and a resource control cannot read from another session',
    );
  }
  return inspect;
}

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
  const inspect = useSharedInspect(gateway);

  return (
    <ResourceGatewayContext.Provider value={gateway}>
      <ResourceInspectContext value={inspect}>
        {children}
      </ResourceInspectContext>
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
