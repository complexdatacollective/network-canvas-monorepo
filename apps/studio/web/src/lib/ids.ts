import { notFound } from '@tanstack/react-router';
import { Schema } from 'effect';

import {
  MemberId,
  StudyId,
  TeamId,
  TeamInvitationId,
} from '@codaco/studio-contract/schema/ids';

const isTeamId = Schema.is(TeamId);
const isStudyId = Schema.is(StudyId);

export const parseTeamParams = (params: {
  teamId: string;
}): { teamId: string } => {
  if (!isTeamId(params.teamId)) throw notFound();
  return { teamId: params.teamId };
};

export const parseStudyParams = (params: {
  studyId: string;
}): { studyId: string } => {
  if (!isStudyId(params.studyId)) throw notFound();
  return { studyId: params.studyId };
};

// Unchecked: route params passed params.parse; other values come from the server.

export const toTeamId = (value: string): TeamId =>
  TeamId.make(value, { disableChecks: true });

export const toStudyId = (value: string): StudyId =>
  StudyId.make(value, { disableChecks: true });

export const toMemberId = (value: string): MemberId =>
  MemberId.make(value, { disableChecks: true });

export const toTeamInvitationId = (value: string): TeamInvitationId =>
  TeamInvitationId.make(value, { disableChecks: true });
