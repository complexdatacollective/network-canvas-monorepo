import { Schema } from 'effect';

import { DEPLOYMENT_MODES } from '@codaco/studio-rpc/surfaces';

// What an instance says about itself before anyone has signed in.
//
// Input type == output type for every boundary schema here: no transforms, no
// coercions, no defaults, so one schema describes both what the server emits
// and what a client receives. A declared output schema is also the
// serialization allowlist — a field not named here never reaches the wire.

export const SOCIAL_PROVIDERS = ['google', 'microsoft'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const Deployment = Schema.Struct({
  /** Which topology this deployment serves; see `@codaco/studio-rpc/surfaces`. */
  mode: Schema.Literals(DEPLOYMENT_MODES),
  /**
   * Whether the deployment offers billing. Not implied by `managed`: billing
   * (#1253) is separate configuration, and the shell has to render correctly
   * where it is absent.
   */
  billing: Schema.Boolean,
});

export const AuthCapabilities = Schema.Struct({
  enabled: Schema.Boolean,
  magicLink: Schema.Boolean,
  emailAndPassword: Schema.Boolean,
  socialProviders: Schema.Array(Schema.Literals(SOCIAL_PROVIDERS)),
});

/**
 * The full status document, served on the rpc plane.
 */
export const InstanceStatus = Schema.Struct({
  /**
   * What this instance calls itself: the name its owner gave it at first-run
   * setup, or the product name until one is given (#1909).
   */
  name: Schema.String,
  version: Schema.String,
  auth: AuthCapabilities,
  deployment: Deployment,
  /**
   * First-run bootstrap (#1909). `required` is true exactly while this
   * instance has no owner — which is what `/setup` is for, and what makes the
   * route a real screen rather than a not-found. Public, like the rest of
   * status: whether an instance has been set up is not a secret, and the token
   * that completes setup never leaves the operator's terminal.
   */
  setup: Schema.Struct({
    required: Schema.Boolean,
  }),
}).annotate({ identifier: 'InstanceStatus' });
export type InstanceStatus = (typeof InstanceStatus)['Type'];

/**
 * The status document published at `GET /api/v1/status`.
 *
 * The two schemas differ deliberately. `/api/v1` is a surface third parties
 * build against, so it carries only what an instance is willing to promise
 * indefinitely; being a narrower schema is what strips `auth`, `deployment`
 * and `setup` from it, rather than a handler remembering to delete them.
 */
export const PublicInstanceStatus = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
}).annotate({ identifier: 'Status' });
export type PublicInstanceStatus = (typeof PublicInstanceStatus)['Type'];
