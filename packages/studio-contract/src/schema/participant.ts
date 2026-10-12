import { Schema } from 'effect';

import { LinkToken, SessionToken, StudyId } from './ids.ts';
import { DecimalSequence, NonNegativeInt } from './primitives.ts';
import { problemFields } from './problem.ts';

export const PARTICIPANT_SESSION_STATUSES = [
  'in_progress',
  'completed',
  'abandoned',
] as const;
export const ParticipantSessionStatus = Schema.Literals(
  PARTICIPANT_SESSION_STATUSES,
);
export type ParticipantSessionStatus =
  (typeof ParticipantSessionStatus)['Type'];

export const HolderId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128),
);

const NetworkIdentifier = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128),
);

const EntityAttributes = Schema.Record(Schema.String, Schema.Unknown);

const SecureAttributesMeta = Schema.Record(
  Schema.String,
  Schema.Struct({
    iv: Schema.Array(Schema.Number),
    salt: Schema.Array(Schema.Number),
  }),
);

const entityFields = {
  _uid: NetworkIdentifier,
  attributes: EntityAttributes,
  _secureAttributes: Schema.optional(SecureAttributesMeta),
};

export const NetworkEgo = Schema.Struct(entityFields);

export const NetworkNode = Schema.Struct({
  ...entityFields,
  type: NetworkIdentifier,
  stageId: Schema.optional(NetworkIdentifier),
  promptIDs: Schema.optional(Schema.Array(Schema.String)),
});

export const NetworkEdge = Schema.Struct({
  ...entityFields,
  type: NetworkIdentifier,
  from: NetworkIdentifier,
  to: NetworkIdentifier,
});

export const InterviewNetwork = Schema.Struct({
  nodes: Schema.Array(NetworkNode),
  edges: Schema.Array(NetworkEdge),
  ego: NetworkEgo,
});

const StageMetadata = Schema.Record(Schema.String, Schema.Unknown);

export const InterviewSession = Schema.Struct({
  id: Schema.String,
  startTime: Schema.String,
  finishTime: Schema.Null,
  exportTime: Schema.Null,
  lastUpdated: Schema.String,
  network: Schema.RedactedFromValue(InterviewNetwork),
  stageMetadata: Schema.RedactedFromValue(StageMetadata),
});

export const RedeemInput = Schema.Struct({
  linkToken: LinkToken,
});

export const RedeemResult = Schema.Struct({
  sessionToken: SessionToken,
  sessionId: Schema.String,
  anonymous: Schema.Boolean,
});

export const SessionInput = Schema.Struct({
  holderId: HolderId,
});

export const SessionPayload = Schema.Struct({
  studyId: StudyId,
  holderEpoch: NonNegativeInt,
  revision: DecimalSequence,
  stageIndex: NonNegativeInt,
  stageId: Schema.NullOr(NetworkIdentifier),
  session: InterviewSession,
  protocol: Schema.RedactedFromValue(Schema.Unknown),
  analytics: Schema.Boolean,
});

export const MAX_ANALYTICS_EVENTS = 100;

export const MAX_ANALYTICS_PROPERTIES_BYTES = 4096;

const utf8 = new TextEncoder();

export const analyticsPropertiesBytes = (properties: unknown): number =>
  utf8.encode(JSON.stringify(properties) ?? '').byteLength;

export const AnalyticsEvent = Schema.Struct({
  event: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  properties: Schema.Record(
    Schema.String.check(Schema.isMaxLength(200)),
    Schema.Unknown,
  ).check(
    Schema.makeFilter<Readonly<Record<string, unknown>>>(
      (properties) =>
        analyticsPropertiesBytes(properties) <=
          MAX_ANALYTICS_PROPERTIES_BYTES ||
        `must serialize to at most ${MAX_ANALYTICS_PROPERTIES_BYTES} UTF-8 bytes`,
    ),
  ),
  timestamp: Schema.String.check(Schema.isMaxLength(64)),
});

export const AnalyticsInput = Schema.Struct({
  events: Schema.Array(AnalyticsEvent).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(MAX_ANALYTICS_EVENTS),
  ),
});

export const SyncInput = Schema.Struct({
  holderEpoch: NonNegativeInt,
  revision: DecimalSequence,
  stageIndex: NonNegativeInt,
  stageId: Schema.NullOr(NetworkIdentifier),
  network: Schema.RedactedFromValue(InterviewNetwork),
  stageMetadata: Schema.RedactedFromValue(StageMetadata),
});

/**
 * `applied` is false when the presented revision was not past the stored one,
 * so the snapshot was not written: `revision` is then the stored revision,
 * which another page sharing this holder (a reloaded tab's last save from the
 * page before) may have written with the same number.
 */
export const SyncResult = Schema.Struct({
  revision: DecimalSequence,
  applied: Schema.Boolean,
});

export const FinishInput = Schema.Struct({
  holderEpoch: NonNegativeInt,
  revision: DecimalSequence,
});

export const FinishResult = Schema.Struct({
  state: Schema.Literal('completed'),
});

export class SessionEnded extends Schema.TaggedError<SessionEnded>()(
  'SessionEnded',
  {
    ...problemFields('Session ended', 410),
    state: Schema.Literals(['completed', 'abandoned']),
  },
  { httpApiStatus: 410 },
) {}

export class SessionTakenOver extends Schema.TaggedError<SessionTakenOver>()(
  'SessionTakenOver',
  {
    ...problemFields('Session taken over', 409),
    holderEpoch: NonNegativeInt,
  },
  { httpApiStatus: 409 },
) {}

export class SessionOutOfDate extends Schema.TaggedError<SessionOutOfDate>()(
  'SessionOutOfDate',
  {
    ...problemFields('Session out of date', 409),
    revision: DecimalSequence,
  },
  { httpApiStatus: 409 },
) {}

export class LinkUnavailable extends Schema.TaggedError<LinkUnavailable>()(
  'LinkUnavailable',
  {
    ...problemFields('Link unavailable', 410),
    state: Schema.Literals([
      'not_open',
      'expired',
      'revoked',
      'paused',
      'closed',
      'finished',
    ]),
  },
  { httpApiStatus: 410 },
) {}
