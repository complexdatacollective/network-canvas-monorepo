import { Schema } from 'effect';

import { DraftId, ProtocolId, StudyId, TeamId } from './ids.ts';
import { NonBlankString, NonNegativeInt } from './primitives.ts';
import { problemFields } from './problem.ts';
import { TeamScoped } from './team.ts';

// The study tier (#1262). A study is the team-scoped object a researcher
// works in; the protocol line it points at describes only the interview.
//
// Input type == output type for every boundary schema here — no transforms,
// coercions, or divergent defaults — so one schema describes both what the
// server accepts and what the client receives. Declared result schemas are
// also the serialization allowlist: fields not named here are stripped before
// they reach the wire.

// Both enums mirror the `studies_state_check` and
// `studies_participation_mode_check` constraints, so a value the database
// refuses cannot reach it, and a value it gains needs a migration this
// boundary is versioned alongside.
export const STUDY_STATES = ['draft', 'live', 'paused', 'closed'] as const;
export const StudyState = Schema.Literals(STUDY_STATES);
export type StudyState = (typeof StudyState)['Type'];

export const STUDY_PARTICIPATION_MODES = ['managed', 'anonymous'] as const;
export const StudyParticipationMode = Schema.Literals(
  STUDY_PARTICIPATION_MODES,
);
export type StudyParticipationMode = (typeof StudyParticipationMode)['Type'];

/**
 * The same bound as `studies_name_nonblank_check`, refused here so a blank
 * name is a field error rather than a constraint violation.
 */
export const StudyName = NonBlankString(320, 'Study name');

/**
 * One study as its team's list reports it. `protocolId` is nullable because
 * the column is: a Draft study may retarget its protocol line, and the
 * schema keeps the pin optional until go-live (#1262).
 *
 * The two counts come from the same row as the study, so the picker can say
 * how much work a study holds without a request per study. They are
 * decoration — a study with neither still lists — and they are not the study
 * sidebar's counts, which are per-destination and answered elsewhere.
 */
export const StudySummary = Schema.Struct({
  id: StudyId,
  name: Schema.String,
  state: StudyState,
  participationMode: StudyParticipationMode,
  protocolId: Schema.NullOr(ProtocolId),
  createdAt: Schema.Date,
  waveCount: NonNegativeInt,
  participantCount: NonNegativeInt,
});

// No teamId, deliberately, and the same rule `AcceptTeamInvitationInput`
// records: a cold direct navigation to `/study/$studyId` carries no team, so
// the server resolves the tenant from the caller's own memberships (app-shell
// design §6.3) rather than trusting one chosen by the browser.
export const StudyGetInput = Schema.Struct({
  studyId: StudyId,
});

export const StudyDetail = Schema.Struct({
  /** The owning team, which only the server could say (§6.3). */
  teamId: TeamId,
  study: StudySummary,
  /**
   * The current editable draft of the study's protocol line, which is what
   * the protocol editor is addressed by. Null when the study has no protocol
   * line yet, or its line has no draft — two states the editor reports
   * differently from a study it cannot reach at all.
   */
  protocolDraftId: Schema.NullOr(DraftId),
});

// Creation mints every identifier client-side for the same reason protocol
// creation does: a retry after a lost response repeats the same request
// rather than leaving a second study behind.
export const CreateStudyInput = Schema.Struct({
  ...TeamScoped.fields,
  name: StudyName,
  studyId: StudyId,
  protocolId: ProtocolId,
  draftId: DraftId,
});

export const CreateStudyResult = Schema.Struct({
  studyId: StudyId,
  protocolId: ProtocolId,
  draftId: DraftId,
});

// The four countable study destinations the app shell's sidebar carries
// (app-shell design §5.5). Deliberately one procedure rather than a count
// field on each destination's own list query: the sidebar needs all four on
// every study screen, including the screens that list none of them, and four
// separately-keyed queries would be four round trips whose answers could
// disagree with each other.
// Study id alone, like `StudyGetInput`: the server resolves the team.
export const StudyCountsInput = Schema.Struct({
  studyId: StudyId,
});

// Plain counts, not a rendered string: `NavItem` formats them in the runtime's
// locale, and it is the one that decides a zero is left off entirely.
export const StudyCounts = Schema.Struct({
  /** Published versions of the study's protocol line; 0 while it has none. */
  versions: NonNegativeInt,
  participants: NonNegativeInt,
  waves: NonNegativeInt,
  sessions: NonNegativeInt,
});
export type StudyCounts = (typeof StudyCounts)['Type'];

/**
 * Why a study command was refused, in the domain's own vocabulary rather than
 * the transport's.
 */
export class StudyCommandError extends Schema.TaggedError<StudyCommandError>()(
  'StudyCommandError',
  {
    ...problemFields('Study command refused', 409),
    code: Schema.Literals(['FORBIDDEN', 'CONFLICT']),
  },
  { httpApiStatus: 409 },
) {}
