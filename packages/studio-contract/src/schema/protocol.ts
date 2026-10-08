import { Schema } from 'effect';

import { DraftId, ProtocolId, StageId } from './ids.ts';
import {
  DecimalSequence,
  NonBlankString,
  NonNegativeInt,
  PrivateString,
} from './primitives.ts';
import { problemFields } from './problem.ts';
import { TeamScoped } from './team.ts';

export const ProtocolName = Schema.RedactedFromValue(
  NonBlankString(320, 'Protocol name'),
);

export const ProtocolSummary = Schema.Struct({
  id: ProtocolId,
  draftId: Schema.NullOr(DraftId),
  name: PrivateString,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
});

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

export const SectionDocument = Schema.RedactedFromValue(
  Schema.Record(Schema.String, Schema.Unknown),
);

export const ProtocolDraftInput = Schema.Struct({
  ...TeamScoped.fields,
  protocolId: ProtocolId,
  draftId: DraftId,
});

export const ManifestRevision = Schema.Struct({
  sequence: DecimalSequence,
  hash: Schema.String.check(Schema.isMinLength(1)),
});

export const ProtocolDraft = Schema.Struct({
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
  stageId: Schema.String.check(Schema.isMinLength(1)),
  toIndex: NonNegativeInt,
  expectedRevision: DecimalSequence,
});

export class ProtocolAuthorizationError extends Schema.TaggedError<ProtocolAuthorizationError>()(
  'ProtocolAuthorizationError',
  problemFields('Forbidden', 403),
  { httpApiStatus: 403 },
) {}
