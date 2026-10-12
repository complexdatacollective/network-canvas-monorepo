import { Schema } from 'effect';

import { SUPPORTED_STUDIO_LOCALES } from '../locales.ts';
import { TeamId } from './ids.ts';
import { PrivateString } from './primitives.ts';

const TeamMembershipSummary = Schema.Struct({
  teamId: TeamId,
  /*
    A plain string, NOT `TeamRole`: Better Auth stores a member's roles as one
    comma-separated value, so a legacy row reads "owner,admin".
  */
  role: Schema.String,
});

export const Me = Schema.Struct({
  userId: Schema.String,
  email: PrivateString,
  emailVerified: Schema.Boolean,
  name: PrivateString,
  /*
    A plain string, NOT the supported-locale union: a stored tag this build no
    longer offers must fall back on the client rather than fail the whole of `me`.
  */
  locale: Schema.NullOr(Schema.String),
  teams: Schema.Array(TeamMembershipSummary),
});
export type Me = (typeof Me)['Type'];

export const UpdateAccountLocaleInput = Schema.Struct({
  locale: Schema.NullOr(Schema.Literals(SUPPORTED_STUDIO_LOCALES)),
});

export const UpdateAccountLocaleResult = Schema.Struct({
  locale: Schema.NullOr(Schema.String),
});
