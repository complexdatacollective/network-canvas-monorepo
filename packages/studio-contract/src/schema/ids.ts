import { Schema } from 'effect';

// The identifiers every Studio surface names things by.
//
// Branding narrows the TypeScript `Type` only: each schema's `Encoded` stays
// `string`, so nothing about the wire changes and no migration is implied. What
// it buys is that a `TeamId` cannot be passed where a `StudyId` is expected,
// which is the mistake these all being `string` today makes easy.
//
// The bounds are the ones today's zod boundary already enforces
// (`packages/studio-rpc/src/schemas.ts`), so the accepted set is unchanged.

/**
 * Better Auth mints organization ids, so the only bound that holds is the
 * column's: 1–255 characters, not a UUID.
 */
export const TeamId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(255),
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

/** Better Auth's user id, bounded by the column rather than by a format. */
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

/**
 * Invitation ids travel in emailed links, so the character set is narrowed to
 * what survives a URL intact — today's `TeamInvitationIdSchema`.
 */
export const TeamInvitationId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(255),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/),
).pipe(Schema.brand('TeamInvitationId'));
export type TeamInvitationId = (typeof TeamInvitationId)['Type'];

/**
 * A participant's session credential (#1899). It is a bearer secret presented
 * in a request header, so the lower bound is a floor on entropy rather than a
 * column bound: anything shorter than 16 characters could not have been minted
 * by the server and is refused before it is looked up.
 */
export const SessionToken = Schema.String.check(
  Schema.isMinLength(16),
  Schema.isMaxLength(255),
).pipe(Schema.brand('SessionToken'));
export type SessionToken = (typeof SessionToken)['Type'];

/** The single-use secret in a participation link, bounded like the above. */
export const LinkToken = Schema.String.check(
  Schema.isMinLength(16),
  Schema.isMaxLength(255),
).pipe(Schema.brand('LinkToken'));
export type LinkToken = (typeof LinkToken)['Type'];
