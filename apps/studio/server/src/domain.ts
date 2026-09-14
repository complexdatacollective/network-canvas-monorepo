import type { InferContractRouterOutputs } from '@orpc/contract';

import type { contract } from '@codaco/studio-rpc';
import type { DeploymentMode } from '@codaco/studio-rpc/surfaces';

import { STUDIO_VERSION } from './version.ts';

// The domain layer: one implementation of app behaviour that every surface
// adapter calls into — the internal RPC surface (src/rpc.ts), the public data
// API (src/api.ts), and eventually the sync protocol. Per the surface
// separation decided 2026-08-11 on #1248, the surfaces share this layer and
// nothing else: no surface is generated from another.

export type InstanceStatus = InferContractRouterOutputs<
  typeof contract
>['status'];

/**
 * What sign-in the instance currently offers. `magicLink` is false when no
 * mail can leave the server even though auth is otherwise enabled;
 * `emailAndPassword` tracks `enabled` exactly, since better-auth.ts offers it
 * unconditionally wherever auth itself is configured; `socialProviders` lists
 * the OAuth providers whose credentials are configured (#1255), empty when
 * none are.
 */
export type AuthCapabilities = InstanceStatus['auth'];

/**
 * Which topology this deployment is, and whether it offers billing. The
 * client reads it to decide what a signed-in researcher may navigate to;
 * the HTTP gate in src/client-assets.ts enforces the same classification
 * independently, so a client that ignores this cannot reach the surfaces.
 */
export type DeploymentStatus = InstanceStatus['deployment'];

export function getDeploymentStatus(mode: DeploymentMode): DeploymentStatus {
  return {
    mode,
    // Not implied by `managed`. Billing (#1253) is unimplemented and
    // separately configured, so no deployment offers it yet — and the shell
    // has to render correctly where it is absent, which is what reading a
    // capability rather than inferring one from the mode buys.
    billing: false,
  };
}

export function getInstanceStatus(
  auth: AuthCapabilities,
  deployment: DeploymentStatus,
): InstanceStatus {
  return {
    name: 'Network Canvas Studio',
    version: STUDIO_VERSION,
    auth,
    deployment,
  };
}
