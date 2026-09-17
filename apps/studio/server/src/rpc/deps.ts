import type pg from 'pg';

import type { AssetStore } from '../assets.ts';
import type { AuthService } from '../auth/service.ts';
import type {
  AuthCapabilities,
  DeploymentStatus,
  InstallationReader,
} from '../domain.ts';
import type { JobClient } from '../jobs/client.ts';
import type { RateLimiter } from '../rate-limit.ts';
import type { SecretsCipher } from '../secrets/cipher.ts';

/**
 * Everything the `/rpc` handlers are wired from, resolved once by
 * `createStudio` and handed to the handler layers as one value (`studio.rpc`).
 *
 * It is the object `createRpcRouter` used to take, minus `protocolBuilder`:
 * the protocol builder's oRPC router keeps its own runtime and is built
 * separately, because the editor still reaches it over the `/ws` bridge until
 * stage 8 (#1930).
 *
 * The optional members are the surfaces a deployment may not have configured.
 * Their absence is a deployment bug rather than an authorization refusal —
 * every procedure that needs one dies rather than declaring an error for it —
 * which is the reading today's `INTERNAL_SERVER_ERROR` rows already had.
 */
export type RpcDeps = {
  readonly auth: AuthService;
  /** What sign-in this instance offers, for `status`. */
  readonly capabilities: AuthCapabilities;
  readonly deployment: DeploymentStatus;
  /** The installation row behind `status.setup` and the instance's name. */
  readonly readInstallation: InstallationReader;
  /** How a command queues the work it causes (#1895); see CreateAppDeps. */
  readonly jobs?: JobClient | undefined;
  readonly pool?: pg.Pool | undefined;
  /** The protocol-builder router's object store; no `/rpc` handler reads it. */
  readonly assetStore?: AssetStore | undefined;
  /**
   * Seals and opens the API-key protocol assets (#1900). Absent only where
   * there is no keyring, which the env layer allows only where there is no
   * database — and every procedure that would seal or open a secret needs a
   * pool too.
   */
  readonly cipher?: SecretsCipher | undefined;
  /** Where per-user and per-team call limits are counted (#1909). */
  readonly limiter?: RateLimiter | undefined;
};
