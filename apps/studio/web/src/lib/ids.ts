import {
  MemberId,
  StudyId,
  TeamId,
  TeamInvitationId,
} from '@codaco/studio-contract/schema/ids';

// Identifiers the app holds as plain strings, as the contract's branded ids.
//
// A brand is a compile-time claim about WHICH identifier a string is, and every
// rpc payload is typed by it, so a `TeamId` can no longer be passed where a
// `StudyId` belongs. The values below arrive from a URL segment or from Better
// Auth, neither of which has made that claim, so it is made here — in one
// place, rather than at each of the dozen call sites that need it.
//
// **Branded without re-running the schema's checks, deliberately.** The value
// is not being trusted: the payload schema checks it when the call carrying it
// is encoded, which is where a malformed identifier is refused today as well —
// the screen reports a study or a team it could not read. Checking it here
// instead would move that refusal into a render, where the only thing a failed
// check can do is throw, and a bookmarked `/study/not-a-uuid` would blank the
// header on every route rather than say the study cannot be opened.
//
// A value the app MINTS is a different case and does not come through here:
// `StudyId.make(createUuid())` checks it, because a freshly minted identifier
// that the schema refuses is a defect rather than a refusal.

export const toTeamId = (value: string): TeamId =>
  TeamId.make(value, { disableChecks: true });

export const toStudyId = (value: string): StudyId =>
  StudyId.make(value, { disableChecks: true });

export const toMemberId = (value: string): MemberId =>
  MemberId.make(value, { disableChecks: true });

export const toTeamInvitationId = (value: string): TeamInvitationId =>
  TeamInvitationId.make(value, { disableChecks: true });
