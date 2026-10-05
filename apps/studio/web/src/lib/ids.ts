import {
  MemberId,
  StudyId,
  TeamId,
  TeamInvitationId,
} from '@codaco/studio-contract/schema/ids';

// Branded without re-running the schema's checks, deliberately: the payload
// schema checks it when the call carrying it is encoded.

export const toTeamId = (value: string): TeamId =>
  TeamId.make(value, { disableChecks: true });

export const toStudyId = (value: string): StudyId =>
  StudyId.make(value, { disableChecks: true });

export const toMemberId = (value: string): MemberId =>
  MemberId.make(value, { disableChecks: true });

export const toTeamInvitationId = (value: string): TeamInvitationId =>
  TeamInvitationId.make(value, { disableChecks: true });
