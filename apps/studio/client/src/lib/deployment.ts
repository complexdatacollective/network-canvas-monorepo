import { useQuery } from '@tanstack/react-query';

import {
  isSurfaceServed,
  type DeploymentMode,
} from '@codaco/studio-rpc/surfaces';

import { orpc } from './api.ts';

/**
 * Which of the two topologies this deployment serves (§10.4), or `undefined`
 * until the status query has answered.
 *
 * The mode is fixed for the life of the process serving this bundle — it is
 * read from the server's environment at start-up — so the query is asked once
 * and never goes stale. It is deliberately not a boot snapshot baked into the
 * client: one bundle is served by both topologies, so the answer cannot be
 * compiled in.
 */
function useDeploymentMode(): DeploymentMode | undefined {
  const status = useQuery(orpc.status.queryOptions({ staleTime: Infinity }));
  return status.data?.deployment.mode;
}

/**
 * Whether `path` — a route path in the client router's own spelling — names a
 * destination this deployment does not have at all.
 *
 * This is the only thing that earns a navigation entry the unavailable
 * treatment: a place that genuinely does not exist here, like billing on a
 * self-hosted instance. A destination that is merely unbuilt is an ordinary
 * link to a placeholder, because the researcher can usefully see where the
 * work will appear.
 *
 * Answers `false` while the mode is unknown. Saying "this deployment does not
 * have that" is a stronger claim than linking to it, and an unanswered
 * question is no basis for making it; the classification itself already
 * fails open, in `isSurfaceServed`.
 */
export function useSurfaceUnavailable(path: string): boolean {
  const mode = useDeploymentMode();
  return mode !== undefined && !isSurfaceServed(path, mode);
}
