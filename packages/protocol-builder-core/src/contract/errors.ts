import { Schema } from 'effect';

import {
  PresenceSchema,
  ProtocolIdSchema,
  ResourceGatewayFailureSchema,
  SectionHolderSchema,
  SectionIdSchema,
  SectionIssueSchema,
  SectionReferenceSchema,
} from './schemas.ts';

export class ProtocolNotFound extends Schema.TaggedError<ProtocolNotFound>()(
  'ProtocolNotFound',
  { protocolId: ProtocolIdSchema },
) {
  override get message(): string {
    return 'no such protocol';
  }
}

export class SectionNotFound extends Schema.TaggedError<SectionNotFound>()(
  'SectionNotFound',
  { sectionId: SectionIdSchema },
) {
  override get message(): string {
    return 'no such section';
  }
}

export class NotLockHolder extends Schema.TaggedError<NotLockHolder>()(
  'NotLockHolder',
  {
    sectionId: SectionIdSchema,
    holder: Schema.optionalKey(PresenceSchema),
  },
) {
  override get message(): string {
    return 'the section is not locked by this caller';
  }
}

/**
 * The staged resources a write asked to promote could not be committed, so
 * neither they nor the section were written: the write that names them is the
 * only place the two become one revision, and half of it is not an outcome a
 * host offers.
 *
 * `sectionId` is absent when a `Create` is refused, because the host mints an
 * id only for a section it is going to write.
 */
export class PromotionFailed extends Schema.TaggedError<PromotionFailed>()(
  'PromotionFailed',
  {
    sectionId: Schema.optionalKey(SectionIdSchema),
    failure: ResourceGatewayFailureSchema,
  },
) {
  override get message(): string {
    return 'the resources this write promotes could not be committed';
  }
}

export class SectionExists extends Schema.TaggedError<SectionExists>()(
  'SectionExists',
  { sectionId: SectionIdSchema },
) {
  override get message(): string {
    return 'the protocol already has this section';
  }
}

export class InvalidShape extends Schema.TaggedError<InvalidShape>()(
  'InvalidShape',
  {
    sectionId: SectionIdSchema,
    issues: Schema.Array(SectionIssueSchema),
  },
) {
  override get message(): string {
    return 'the document is not shaped like this section';
  }
}

/**
 * A change spanning sections cannot be made because one of them is held.
 * "Another editor" includes another editor of this session: a stage editor
 * holding its own draft would submit the change away again.
 */
export class SectionsLocked extends Schema.TaggedError<SectionsLocked>()(
  'SectionsLocked',
  { blocked: Schema.Array(SectionHolderSchema) },
) {
  override get message(): string {
    return 'another editor holds a section this change has to write';
  }
}

/**
 * What the change would remove is still named where the host will not take the
 * reference out, so making it would leave the protocol naming something that
 * no longer exists.
 *
 * Two things put a reference here. A refactor CANNOT remove one — a stage's own
 * subject, a quick-add attribute — because there is no list entry to drop that
 * leaves a stage the researcher would recognise. A `Delete` WILL not: a stage
 * another stage jumps to, or describes the people of, is a decision somebody
 * made about that other stage, and rewriting it as a side effect of removing
 * this one is not a deletion anybody asked for.
 *
 * Either way, the references are what the dialog tells the researcher is using
 * the thing they asked to remove.
 */
export class ReferencesRemain extends Schema.TaggedError<ReferencesRemain>()(
  'ReferencesRemain',
  { remaining: Schema.Array(SectionReferenceSchema) },
) {
  override get message(): string {
    return 'the change would leave references this host cannot remove';
  }
}

export const ProtocolError = Schema.Union([ProtocolNotFound, SectionNotFound]);

export const RefactorError = Schema.Union([
  ProtocolNotFound,
  SectionNotFound,
  SectionsLocked,
  ReferencesRemain,
]);

export const WriteError = Schema.Union([
  ProtocolNotFound,
  SectionNotFound,
  NotLockHolder,
  SectionsLocked,
  InvalidShape,
  PromotionFailed,
]);
