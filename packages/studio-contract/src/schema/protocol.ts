import { Schema } from 'effect';

import { DraftId, ProtocolId, StageId } from './ids.ts';
import {
  DecimalSequence,
  NonBlankString,
  NonNegativeInt,
} from './primitives.ts';
import { problemFields } from './problem.ts';
import { TeamScoped } from './team.ts';

// The protocol tier: a protocol line, the draft currently being edited on it,
// and the two stage edits the editor issues against that draft.
//
// Input type == output type for every boundary schema here — no transforms,
// coercions, or divergent defaults — so one schema describes both what the
// server accepts and what the client receives. Declared result schemas are
// also the serialization allowlist: fields not named here are stripped before
// they reach the wire.

/**
 * The same bound the protocol name column carries, refused here so a blank
 * name is a field error rather than a constraint violation.
 */
export const ProtocolName = NonBlankString(320, 'Protocol name');

export const ProtocolSummary = Schema.Struct({
  id: ProtocolId,
  draftId: Schema.NullOr(DraftId),
  name: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
});

// Creation mints every identifier client-side so that a retry after a lost
// response repeats the same request rather than leaving a second protocol
// behind.
export const CreateProtocolInput = Schema.Struct({
  ...TeamScoped.fields,
  name: ProtocolName,
  protocolId: ProtocolId,
  draftId: DraftId,
});

export const CreateProtocolResult = Schema.Struct({
  protocolId: ProtocolId,
  draftId: DraftId,
});

/**
 * One section of a draft's manifest, opaque to this contract: the protocol
 * document's shape is the interview schema's business, not the transport's.
 */
export const SectionDocument = Schema.Record(Schema.String, Schema.Unknown);

export const ProtocolDraftInput = Schema.Struct({
  ...TeamScoped.fields,
  protocolId: ProtocolId,
  draftId: DraftId,
});

export const ManifestRevision = Schema.Struct({
  /**
   * A PostgreSQL `bigint` on the wire: base-10 digits in a string, which the
   * server hands straight to a `::bigint` cast rather than risking a
   * JavaScript number that cannot hold it.
   */
  sequence: DecimalSequence,
  hash: Schema.String.check(Schema.isMinLength(1)),
});

export const ProtocolDraft = Schema.Struct({
  /**
   * The draft's own id is required here, unlike on `ProtocolSummary`, because
   * a draft document could not have been fetched without one.
   */
  protocol: Schema.Struct({
    ...ProtocolSummary.fields,
    draftId: DraftId,
  }),
  revision: ManifestRevision,
  sections: Schema.Record(Schema.String, SectionDocument),
});

export const AddInformationStageInput = Schema.Struct({
  ...ProtocolDraftInput.fields,
  stageId: StageId,
});

export const MoveStageInput = Schema.Struct({
  ...ProtocolDraftInput.fields,
  /**
   * A moved stage is addressed by whatever id the manifest already carries for
   * it, which is not guaranteed to be a UUID — unlike the id a newly added
   * stage is minted with.
   */
  stageId: Schema.String.check(Schema.isMinLength(1)),
  toIndex: NonNegativeInt,
  /**
   * The revision the client believes it is editing, carried as a decimal
   * `bigint` string for the same reason `ManifestRevision.sequence` is. A
   * move against a stale revision is refused rather than applied to a manifest
   * the client has not seen.
   */
  expectedRevision: DecimalSequence,
});

/**
 * A protocol the caller may not reach. Like the shared `Forbidden`, it carries
 * no reason beyond `detail`: a machine-readable one would let a caller tell
 * "exists, not yours" from "does not exist" by reading the field.
 */
export class ProtocolAuthorizationError extends Schema.TaggedError<ProtocolAuthorizationError>()(
  'ProtocolAuthorizationError',
  problemFields('Forbidden', 403),
  { httpApiStatus: 403 },
) {}
