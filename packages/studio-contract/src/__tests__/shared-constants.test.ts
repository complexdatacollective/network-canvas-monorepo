import { describe, expect, it } from 'vitest';

import {
  AUDIT_CATEGORIES as RPC_AUDIT_CATEGORIES,
  AUDIT_OUTCOMES as RPC_AUDIT_OUTCOMES,
  AuditActorKindSchema,
  SOCIAL_PROVIDERS as RPC_SOCIAL_PROVIDERS,
  STUDY_PARTICIPATION_MODES as RPC_STUDY_PARTICIPATION_MODES,
  STUDY_STATES as RPC_STUDY_STATES,
  TEAM_ROLES as RPC_TEAM_ROLES,
} from '@codaco/studio-rpc';

import {
  AUDIT_ACTOR_KINDS,
  AUDIT_CATEGORIES,
  AUDIT_OUTCOMES,
} from '../schema/audit.ts';
import { SOCIAL_PROVIDERS } from '../schema/status.ts';
import { STUDY_PARTICIPATION_MODES, STUDY_STATES } from '../schema/study.ts';
import { TEAM_ROLES } from '../schema/team.ts';

// The enum tuples are translated into this package because it REPLACES
// `packages/studio-rpc/src/schemas.ts`; until stage 2b deletes that file the
// two copies both exist, and the server still validates against the zod one.
// This pins them equal for the interim so neither can drift on its own.
describe('the enum tuples shared with today’s zod schemas', () => {
  it.each([
    ['SOCIAL_PROVIDERS', SOCIAL_PROVIDERS, RPC_SOCIAL_PROVIDERS],
    ['TEAM_ROLES', TEAM_ROLES, RPC_TEAM_ROLES],
    ['STUDY_STATES', STUDY_STATES, RPC_STUDY_STATES],
    [
      'STUDY_PARTICIPATION_MODES',
      STUDY_PARTICIPATION_MODES,
      RPC_STUDY_PARTICIPATION_MODES,
    ],
    ['AUDIT_CATEGORIES', AUDIT_CATEGORIES, RPC_AUDIT_CATEGORIES],
    ['AUDIT_OUTCOMES', AUDIT_OUTCOMES, RPC_AUDIT_OUTCOMES],
    ['AUDIT_ACTOR_KINDS', AUDIT_ACTOR_KINDS, AuditActorKindSchema.options],
  ] as const)(
    'keeps %s identical to @codaco/studio-rpc’s',
    (_, ours, theirs) => {
      expect([...ours]).toEqual([...theirs]);
    },
  );
});
