import type { InferContractRouterOutputs } from '@orpc/contract';

import type { DeploymentMode } from '@codaco/studio-contract/surfaces';
import type { contract } from '@codaco/studio-rpc';

import type { Installation } from './setup/bootstrap.ts';
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
 * Which topology this deployment is, and whether it offers billing. The client
 * reads it to decide what a signed-in researcher may navigate to, and guards
 * its own route tree with the same classification
 * (client/src/lib/deployment.ts). Since #1909 the client is served by nginx
 * rather than by this process, so there is no second, HTTP-layer gate.
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

/**
 * How a surface reads the installation row without knowing where it lives, or
 * whether there is a database at all. `null` is "nothing to read": no
 * database, no installation row, or a read that failed — see `createApp`,
 * which is where the fallback is decided, because `status` must stay
 * answerable while the database is away.
 */
export type InstallationReader = () => Promise<Installation | null>;

/** Until an owner names the instance at first-run setup (#1909). */
const DEFAULT_INSTANCE_NAME = 'Network Canvas Studio';

export function getInstanceStatus(
  auth: AuthCapabilities,
  deployment: DeploymentStatus,
  installation: Installation | null,
): InstanceStatus {
  return {
    name: installation?.name ?? DEFAULT_INSTANCE_NAME,
    version: STUDIO_VERSION,
    auth,
    deployment,
    setup: {
      // An instance that exists and has no owner is the one case `/setup` is
      // for. Nothing to read reports `false` rather than `true`: a deployment
      // with no database, and a database the schema step never ran against,
      // both have no bootstrap token outstanding, so offering the screen would
      // offer a form that cannot be completed.
      required: installation !== null && installation.ownerUserId === null,
    },
  };
}
