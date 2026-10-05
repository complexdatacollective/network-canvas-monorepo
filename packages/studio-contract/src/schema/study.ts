import { Schema } from 'effect';

import { DraftId, ProtocolId, StudyId, TeamId } from './ids.ts';
import { NonBlankString, NonNegativeInt } from './primitives.ts';
import { problemFields } from './problem.ts';
import { TeamScoped } from './team.ts';

export const STUDY_STATES = ['draft', 'live', 'paused', 'closed'] as const;
export const StudyState = Schema.Literals(STUDY_STATES);
export type StudyState = (typeof StudyState)['Type'];

export const STUDY_PARTICIPATION_MODES = ['managed', 'anonymous'] as const;
export const StudyParticipationMode = Schema.Literals(
  STUDY_PARTICIPATION_MODES,
);
export type StudyParticipationMode = (typeof StudyParticipationMode)['Type'];

export const StudyName = NonBlankString(320, 'Study name');

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

export const StudyGetInput = Schema.Struct({
  studyId: StudyId,
});

export const StudyDetail = Schema.Struct({
  teamId: TeamId,
  study: StudySummary,
  protocolDraftId: Schema.NullOr(DraftId),
});

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

export const StudyCountsInput = Schema.Struct({
  studyId: StudyId,
});

export const StudyCounts = Schema.Struct({
  versions: NonNegativeInt,
  participants: NonNegativeInt,
  waves: NonNegativeInt,
  sessions: NonNegativeInt,
});
export type StudyCounts = (typeof StudyCounts)['Type'];

export class StudyCommandError extends Schema.TaggedError<StudyCommandError>()(
  'StudyCommandError',
  {
    ...problemFields('Study command refused', 409),
    code: Schema.Literals(['FORBIDDEN', 'CONFLICT']),
  },
  { httpApiStatus: 409 },
) {}
