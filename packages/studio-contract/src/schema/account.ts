import { Schema } from 'effect';

// The supported-locale list is imported rather than copied: it is the
// contract-level source of truth for what the server will store, and two
// copies could disagree about which tags a build accepts. Today it can only be
// reached through this package's `"."` export, which drags the oRPC contract
// module along with it. That is accepted for this stage; stage 2b moves
// `locales.ts` here and the import becomes a local one.
import { SUPPORTED_STUDIO_LOCALES } from '@codaco/studio-rpc';

import { TeamId } from './ids.ts';

// The account tier: who the caller is, and the one preference they may change
// about themselves.
//
// Input type == output type for every boundary schema here — no transforms,
// coercions, or divergent defaults — so one schema describes both what the
// server emits and what the client receives. A declared result schema is also
// the serialization allowlist: a field not named here never reaches the wire.

const TeamMembershipSummary = Schema.Struct({
  teamId: TeamId,
  /*
    A plain string, NOT `TeamRole`. Better Auth stores a member's roles as one
    comma-separated value, so a legacy row reads "owner,admin" — and the
    literal union would reject it, failing the whole of `me` for that
    researcher rather than the one field. The client splits it; that is what
    `teamRoles` is for.
  */
  role: Schema.String,
});

export const Me = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  emailVerified: Schema.Boolean,
  name: Schema.String,
  /*
    The stored UI-language preference (2026-09-04 localization design §5.2);
    null until the researcher chooses one. A plain string, NOT the
    supported-locale union, for the same reason `role` above is: the supported
    list can narrow between releases, and a stored tag this build no longer
    offers must fall back on the client rather than fail the whole of `me`.
  */
  locale: Schema.NullOr(Schema.String),
  /**
   * Every team the caller belongs to, and their role in it.
   *
   * Here rather than in a procedure of its own because it answers the same
   * question `me` does — who is this, and what may they do — and because
   * nothing else can answer it: Better Auth's `listOrganizations` joins the
   * member table and then returns only the organization, dropping the role.
   * The team NAMES still come from that list; this supplies what it drops.
   */
  teams: Schema.Array(TeamMembershipSummary),
});
export type Me = (typeof Me)['Type'];

/**
 * A non-null preference must be a tag this build supports — unknown tags are
 * a validation error, not a silent store (client and server ship together, so
 * the list is always current). Null clears the preference back to browser
 * negotiation ("Automatic").
 *
 * The literal union, and not a canonicalising transform that would accept
 * spellings like `EN-gb`: BCP 47 tags are case-insensitive, but this is not a
 * public API. It is a contract typed end to end whose only caller is the
 * generated client, which sends tags from its own registry — so the narrow
 * `SupportedStudioLocale | null` input type is worth more than tolerating a
 * spelling no real caller produces. Widening the input to `string` to admit
 * one would give the client back the ability to send anything, and it is the
 * compile-time refusal that keeps the supported list and what can be stored
 * the same question.
 *
 * Where a tag genuinely is uncontrolled the repository is lenient about
 * exactly this: `@codaco/app-i18n`'s `resolveAppLocale` runs
 * `canonicalizeAppLocale` over the browser's requested list, and over the
 * stored preference on its way back out, so a case variant that reached the
 * column some other way still resolves. Lenient where the input is
 * uncontrolled, strict where it is typed — and the design's requirement that
 * this command canonicalise is satisfied for the tags it declares,
 * canonicalisation being the identity on every one of them.
 */
export const UpdateAccountLocaleInput = Schema.Struct({
  locale: Schema.NullOr(Schema.Literals(SUPPORTED_STUDIO_LOCALES)),
});

// A plain string on the way out, like `Me.locale`: what came back from the
// row, not what this build's registry admits.
export const UpdateAccountLocaleResult = Schema.Struct({
  locale: Schema.NullOr(Schema.String),
});
