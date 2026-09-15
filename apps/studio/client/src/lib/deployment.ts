import { useQuery, type QueryClient } from '@tanstack/react-query';
import { notFound, rootRouteId } from '@tanstack/react-router';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import {
  isSurfaceServed,
  type DeploymentMode,
} from '@codaco/studio-rpc/surfaces';

import { orpc } from './api.ts';

/**
 * The status query, at the freshness §10.4 gives it. One options object for
 * both readers — `/`'s guard and the billing hook below — so a component and a
 * guard cannot end up asking two differently-keyed questions about one
 * immutable fact.
 *
 * What it answers is fixed for the life of the process serving this bundle:
 * the mode is read from the server's environment at start-up and the billing
 * capability from its configuration, so the query is asked once and never goes
 * stale. It is deliberately not a boot snapshot baked into the client — one
 * bundle is served by both topologies, so the answer cannot be compiled in.
 */
const statusQueryOptions = orpc.status.queryOptions({ staleTime: Infinity });

/**
 * Which of the two topologies this deployment serves (§10.4), for a
 * `beforeLoad` that has to have it before it can decide what a route even is —
 * which today is `/` alone. `fetchQuery`, not `ensureQueryData`, for the
 * reason §6.2 records.
 */
export async function fetchDeploymentMode(
  queryClient: QueryClient,
): Promise<DeploymentMode> {
  const status = await queryClient.fetchQuery(statusQueryOptions);
  return status.deployment.mode;
}

/**
 * Whether this instance still has nobody in it (#1909), for `/setup`'s guard —
 * which, like `/`'s, has to have the answer before it can decide what the
 * route is: a real screen while the answer is yes, and a not-found the moment
 * it is no. The same query as the mode above, because it is the same question
 * asked of the same immutable-per-process answer.
 */
export async function fetchSetupRequirement(
  queryClient: QueryClient,
): Promise<boolean> {
  const status = await queryClient.fetchQuery(statusQueryOptions);
  return status.setup.required;
}

/**
 * Re-asks status after first-run setup has changed it. `staleTime: Infinity`
 * is right for an answer fixed for the life of the process serving the bundle,
 * and completing setup is the one moment in that life when it moves:
 * `setup.required` goes false, so `/setup` becomes a not-found rather than a
 * second way in.
 */
export async function invalidateInstanceStatus(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: statusQueryOptions.queryKey,
  });
}

/**
 * The `beforeLoad` a route gets when the classification says it belongs to one
 * topology (§10.4): it renders here, or it does not exist here.
 *
 * This is the only enforcement there is. The server used to refuse a gated
 * page path at the HTTP layer, from the same list, but it serves no page paths
 * at all since #1909 — nginx does, and nginx knows nothing about the mode. So
 * the classification has exactly one reader on the request path now, and
 * leaving it to the screens would mean a self-hosted instance rendering a
 * pricing page and a managed tenant reaching first-run configuration of the
 * whole instance.
 *
 * `notFound()` rather than a redirect, because the honest answer is that the
 * address is not a place here — a redirect would imply the researcher asked
 * for the wrong thing. The root route's `notFoundComponent` is what renders
 * it (`routes/NotFoundScreen.tsx`).
 *
 * Takes the route's own registered path — its `$param` spelling, the one the
 * classification is written in — rather than reading the location, so the
 * route and the list are compared by the same key the route table's test
 * checks for completeness.
 *
 * Structurally typed on `context` alone so a route that has a guard of its own
 * can await this first and then run it.
 */
export function topologyGuard(
  routePath: string,
): (options: { context: { queryClient: QueryClient } }) => Promise<void> {
  return async ({ context }) => {
    const mode = await fetchDeploymentMode(context.queryClient);
    // Addressed to the ROOT route's not-found, not the nearest one: a route
    // that has a not-found of its own (`/setup`, whose "already set up" state
    // is a not-found too) must not render that state for a topology refusal —
    // on the managed service the page is not there at all.
    if (!isSurfaceServed(routePath, mode)) {
      throw notFound({ routeId: rootRouteId });
    }
  };
}

const BILLING_PATH = '/team/$teamId/billing';

const billingUnavailableMessages = defineMessages({
  managedOnly: {
    id: 'studio.deployment.billingManagedOnly',
    defaultMessage: 'Managed deployments only',
    description:
      'Shown on the disabled Billing sidebar row of a self-hosted instance, which does not serve billing at all.',
  },
  notEnabled: {
    id: 'studio.deployment.billingNotEnabled',
    defaultMessage: 'Not enabled on this deployment',
    description:
      'Shown on the disabled Billing sidebar row of a deployment whose billing capability is not configured.',
  },
});

/**
 * Why this deployment does not have Billing, or `undefined` when it has.
 *
 * Being absent is what earns a navigation entry the unavailable treatment: a
 * place that genuinely does not exist here, rather than one that is merely
 * unbuilt — an unbuilt destination stays an ordinary link to a placeholder,
 * because the researcher can usefully see where the work will appear. Billing
 * is the only destination in the manifest that can be absent, and it can be
 * absent for two different reasons, which the researcher is owed the
 * difference between:
 *
 * - the topology does not serve the surface at all. Billing is managed-only
 *   (§10.4) and a self-hosted instance answers the URL with a real 404 at the
 *   HTTP gate, so linking there would send the researcher into it.
 * - the topology serves it and this deployment has not got it. `billing` is a
 *   CAPABILITY and deliberately not implied by `managed` (§10.3, and
 *   `getDeploymentStatus` says so in as many words): the machinery is #1253's
 *   and separately configured, so no deployment reports `true` today.
 *   Classifying on the mode alone marks billing available on the managed
 *   service and points the sidebar and the everything bar at the placeholder,
 *   where §10.3 requires the shell to render its absence instead.
 *
 * `undefined` while the status query is unanswered, which is the same fail-open
 * the classification itself takes in `isSurfaceServed`: "this deployment does
 * not have that" is a stronger claim than linking to it, and an unanswered
 * question is no basis for making it.
 */
export function useBillingUnavailableReason(): MessageDescriptor | undefined {
  const deployment = useQuery(statusQueryOptions).data?.deployment;
  if (deployment === undefined) return undefined;
  if (!isSurfaceServed(BILLING_PATH, deployment.mode)) {
    return billingUnavailableMessages.managedOnly;
  }
  return deployment.billing ? undefined : billingUnavailableMessages.notEnabled;
}
