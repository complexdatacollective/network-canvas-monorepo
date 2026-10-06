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

/**
 * The one release the instance's owner is told about (#1901). Deliberately
 * narrow: the version, where its notes are, when it came out, and whether
 * upgrading this instance to it changes the database, which is what decides
 * how the upgrade can be undone. The server decides that against the build it
 * runs, because a release that changes nothing itself can still sit after one
 * that did.
 * The question is answered `null` for everyone but the owner, and for an owner
 * whose instance is already on (or ahead of) the newest release.
 */
export const UpdateAvailable = Schema.Struct({
  version: Schema.String,
  releasedAt: Schema.Date,
  notesUrl: Schema.String,
  schemaChange: Schema.Boolean,
}).annotate({ identifier: 'UpdateAvailable' });
export type UpdateAvailable = (typeof UpdateAvailable)['Type'];
