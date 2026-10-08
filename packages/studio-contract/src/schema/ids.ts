import { Schema } from 'effect';

const TEAM_ID_MAX_LENGTH = 255;

export const PRESENTED_TOKEN_SECRET_LENGTH = 43;

const PRESENTED_TOKEN_MAX_LENGTH =
  TEAM_ID_MAX_LENGTH + 1 + PRESENTED_TOKEN_SECRET_LENGTH;

export const TeamId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(TEAM_ID_MAX_LENGTH),
).pipe(Schema.brand('TeamId'));
export type TeamId = (typeof TeamId)['Type'];

export const StudyId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand('StudyId'),
);
export type StudyId = (typeof StudyId)['Type'];

export const ProtocolId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand('ProtocolId'),
);
export type ProtocolId = (typeof ProtocolId)['Type'];

export const DraftId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand('DraftId'),
);
export type DraftId = (typeof DraftId)['Type'];

export const StageId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand('StageId'),
);
export type StageId = (typeof StageId)['Type'];

export const AuditEventId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand('AuditEventId'),
);
export type AuditEventId = (typeof AuditEventId)['Type'];

export const UserId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(255),
).pipe(Schema.brand('UserId'));
export type UserId = (typeof UserId)['Type'];

export const MemberId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(255),
).pipe(Schema.brand('MemberId'));
export type MemberId = (typeof MemberId)['Type'];

export const TeamInvitationId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(255),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/),
).pipe(Schema.brand('TeamInvitationId'));
export type TeamInvitationId = (typeof TeamInvitationId)['Type'];

export const SessionToken = Schema.RedactedFromValue(
  Schema.String.check(
    Schema.isMinLength(16),
    Schema.isMaxLength(PRESENTED_TOKEN_MAX_LENGTH),
  ).pipe(Schema.brand('SessionToken')),
);
export type SessionToken = (typeof SessionToken)['Type'];

export const LinkToken = Schema.RedactedFromValue(
  Schema.String.check(
    Schema.isMinLength(16),
    Schema.isMaxLength(PRESENTED_TOKEN_MAX_LENGTH),
  ).pipe(Schema.brand('LinkToken')),
);
export type LinkToken = (typeof LinkToken)['Type'];
