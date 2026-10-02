import { Schema } from 'effect';

import { DEPLOYMENT_MODES } from '../surfaces.ts';

export const SOCIAL_PROVIDERS = ['google', 'microsoft'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const Deployment = Schema.Struct({
  mode: Schema.Literals(DEPLOYMENT_MODES),
  billing: Schema.Boolean,
});

export const AuthCapabilities = Schema.Struct({
  enabled: Schema.Boolean,
  magicLink: Schema.Boolean,
  emailAndPassword: Schema.Boolean,
  socialProviders: Schema.Array(Schema.Literals(SOCIAL_PROVIDERS)),
});

export const InstanceStatus = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  auth: AuthCapabilities,
  deployment: Deployment,
  setup: Schema.Struct({
    required: Schema.Boolean,
  }),
}).annotate({ identifier: 'InstanceStatus' });
export type InstanceStatus = (typeof InstanceStatus)['Type'];

/**
 * Deliberately narrower than `InstanceStatus`: it is what strips `auth`,
 * `deployment` and `setup` from the public `/api/v1` surface.
 */
export const PublicInstanceStatus = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
}).annotate({ identifier: 'Status' });
export type PublicInstanceStatus = (typeof PublicInstanceStatus)['Type'];
