// Which URL paths each deployment topology serves. Studio ships one artifact
// that answers as two products: the managed service, where marketing, pricing,
// legal, the sign-up funnel and billing live, and a self-hosted instance,
// where first-run setup lives and none of the commercial surfaces do.
//
// The classification lives here — in the one package both deployables import —
// so the server's HTTP gate (apps/studio/server/src/client-assets.ts) and the
// client's route classification cannot drift, and no client→server import is
// created to share it.
//
// Paths are written in the client router's own spelling (`$param`, not
// `:param`), because the classification is compared against the route tree;
// the server translates them for its router at the one place it registers
// them.

export const DEPLOYMENT_MODES = ['managed', 'self-hosted'] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

/** Served by the managed service only; 404 on a self-hosted instance. */
export const MANAGED_ONLY_PATHS = [
  '/pricing',
  '/legal/$document',
  '/sign-up',
  '/sign-up/team',
  '/sign-up/plan',
  '/sign-up/checkout',
  '/sign-up/complete',
  '/team/$teamId/billing',
] as const;

/**
 * Served by a self-hosted instance only; 404 on the managed service, or a
 * managed tenant could reach first-run configuration of the whole instance.
 */
export const SELF_HOST_ONLY_PATHS = ['/setup'] as const;

/**
 * Served by both topologies — every route that is neither commercial nor
 * first-run. `/` is deliberately here: a self-hoster's origin root is the URL
 * they hand their researchers, so 404ing it would make the instance dead at
 * the address people actually type. Under `self-hosted` it is a redirect-only
 * route; under `managed` it renders marketing.
 *
 * The list is exhaustive over the route table rather than implicit, so a route
 * added later is classified deliberately instead of defaulting to "both". The
 * client's route-tree test is what enforces that, by passing every path in the
 * built router to `unclassifiedSurfacePaths`; entries here for routes that do
 * not exist yet are the design's route table, declared ahead of them.
 */
export const BOTH_PATHS = [
  '/',
  '/sign-in',
  '/no-team',
  '/invitations/$invitationId',

  // Participant branch — no chrome, no session.
  '/enter/$token',
  '/enter/$token/consent',
  '/enter/$token/interview',
  '/enter/$token/complete',

  // App, platform level.
  '/account',
  '/account/language',
  '/account/sign-in-methods',
  '/account/tokens',
  '/gallery',
  '/gallery/$templateId',
  '/templates',

  // App, team level.
  '/team/$teamId',
  '/team/$teamId/members',
  '/team/$teamId/roles',
  '/team/$teamId/activity',
  '/team/$teamId/settings',
  '/team/$teamId/settings/api',
  '/team/$teamId/settings/webhooks',
  '/team/$teamId/settings/messaging',

  // App, study level.
  '/study/$studyId',
  '/study/$studyId/editor',
  '/study/$studyId/editor/codebook',
  '/study/$studyId/editor/stages/$stageId',
  '/study/$studyId/editor/assets',
  '/study/$studyId/editor/translations',
  '/study/$studyId/editor/preview',
  '/study/$studyId/versions',
  '/study/$studyId/participants',
  '/study/$studyId/waves',
  '/study/$studyId/sessions',
  '/study/$studyId/sessions/$sessionId',
  '/study/$studyId/schedule',
  '/study/$studyId/recruitment',
  '/study/$studyId/settings',
  '/study/$studyId/export',
] as const;

export type SurfaceAvailability = 'managed-only' | 'self-host-only' | 'both';

/** Every classified path, in declaration order. */
export const SURFACE_PATHS: readonly string[] = [
  ...MANAGED_ONLY_PATHS,
  ...SELF_HOST_ONLY_PATHS,
  ...BOTH_PATHS,
];

const AVAILABILITY_BY_PATH: ReadonlyMap<string, SurfaceAvailability> = new Map<
  string,
  SurfaceAvailability
>([
  ...MANAGED_ONLY_PATHS.map(
    (path) => [path, 'managed-only'] as [string, SurfaceAvailability],
  ),
  ...SELF_HOST_ONLY_PATHS.map(
    (path) => [path, 'self-host-only'] as [string, SurfaceAvailability],
  ),
  ...BOTH_PATHS.map((path) => [path, 'both'] as [string, SurfaceAvailability]),
]);

/** `undefined` for a path no list names — see `unclassifiedSurfacePaths`. */
export function classifySurfacePath(
  path: string,
): SurfaceAvailability | undefined {
  return AVAILABILITY_BY_PATH.get(path);
}

/**
 * Whether `path` is served by a deployment running in `mode`.
 *
 * An unclassified path answers `true`, which is what keeps this predicate and
 * the server's gate the same rule: the gate 404s exactly the paths a list
 * names for the other topology, and nothing else. "Both" is the residual
 * class, so a path that no list names cannot be distinguished from one the
 * `BOTH_PATHS` list would have carried — `unclassifiedSurfacePaths` is what
 * keeps that residual from hiding a route nobody classified.
 */
export function isSurfaceServed(path: string, mode: DeploymentMode): boolean {
  const availability = classifySurfacePath(path);
  if (availability === 'managed-only') return mode === 'managed';
  if (availability === 'self-host-only') return mode === 'self-hosted';
  return true;
}

/**
 * The paths a deployment in `mode` must refuse. Derived from the same
 * classification the predicate reads, so the gate cannot answer differently
 * from `isSurfaceServed`.
 */
export function gatedSurfacePaths(mode: DeploymentMode): readonly string[] {
  return SURFACE_PATHS.filter((path) => !isSurfaceServed(path, mode));
}

/**
 * The subset of `paths` that no list names. The client's route-tree test feeds
 * it every path in the built router and requires an empty result, so a route
 * added without a topology decision fails that test instead of silently
 * becoming "both".
 */
export function unclassifiedSurfacePaths(paths: Iterable<string>): string[] {
  return [...paths].filter((path) => classifySurfacePath(path) === undefined);
}
