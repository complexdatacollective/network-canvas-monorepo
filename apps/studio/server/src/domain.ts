import type { InferContractRouterOutputs } from '@orpc/contract';

import type { contract } from '@codaco/studio-rpc';

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
 * `socialProviders` lists the OAuth providers whose credentials are
 * configured (#1255), empty when none are.
 */
export type AuthCapabilities = InstanceStatus['auth'];

export function getInstanceStatus(auth: AuthCapabilities): InstanceStatus {
  return {
    name: 'Network Canvas Studio',
    version: STUDIO_VERSION,
    auth,
  };
}
