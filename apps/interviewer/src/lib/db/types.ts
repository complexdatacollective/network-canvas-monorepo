import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import type {
  CurrentProtocol,
  FinishOutcome,
  Protocol,
} from '@codaco/protocol-validation';
import type { NcNetwork, StageMetadata } from '@codaco/shared-consts';

export type StoredAssetType =
  | 'image'
  | 'video'
  | 'audio'
  | 'network'
  | 'geojson'
  | 'apikey';

export type StoredAsset = {
  id: string;
  protocolHash: string;
  assetId: string;
  name: string;
  type: StoredAssetType;
  data: Blob | string;
};

/**
 * A protocol document at schema 8. Stored and run unchanged: its interviews
 * run in the Interviewer 8 bundled at `/v8/`, which reads the same rows.
 */
export type Schema8Protocol = Protocol<8>;

type StoredProtocolFields = {
  id: string;
  hash: string;
  name: string;
  lastModified?: string;
  importedAt: string;
  description?: string;
};

/** A protocol this app's interview engine runs. */
export type StoredCurrentProtocol = StoredProtocolFields & {
  schemaVersion: CurrentProtocol['schemaVersion'];
  codebook: CurrentProtocol['codebook'];
  protocol: CurrentProtocol;
};

/**
 * A schema 8 protocol, in exactly the row Interviewer 8 writes (see
 * `protocols.ts`). Interviewer 8 at `/v8/` runs its interviews.
 */
export type StoredSchema8Protocol = StoredProtocolFields & {
  schemaVersion: Schema8Protocol['schemaVersion'];
  codebook: Schema8Protocol['codebook'];
  protocol: Schema8Protocol;
};

/**
 * Every protocol lives in one table, whatever its schema, told apart by
 * `schemaVersion`.
 */
export type StoredProtocol = StoredCurrentProtocol | StoredSchema8Protocol;

const SCHEMA_8: Schema8Protocol['schemaVersion'] = 8;

/** Whether `protocol` runs in this app's own interview engine. */
export const isCurrentProtocol = <T extends { schemaVersion: number }>(
  protocol: T,
): protocol is Extract<
  T,
  { schemaVersion: CurrentProtocol['schemaVersion'] }
> => protocol.schemaVersion === COMPATIBLE_PROTOCOL_SCHEMA_VERSION;

/** Whether `protocol` is a schema 8 protocol, run by Interviewer 8. */
export const isSchema8Protocol = <T extends { schemaVersion: number }>(
  protocol: T,
): protocol is Extract<
  T,
  { schemaVersion: Schema8Protocol['schemaVersion'] }
> => protocol.schemaVersion === SCHEMA_8;

export type StoredSession = {
  id: string;
  protocolHash: string;
  protocolName: string;
  caseId: string;
  startedAt: string;
  lastUpdatedAt: string;
  finishedAt: string | null;
  // The finish stage the participant finished at, and that stage's outcome.
  // Written only by `markSessionFinished` and cleared by
  // `markSessionUnfinished`, always together with `finishedAt`. Optional so a
  // session finished before finish stages were recorded reads as unknown
  // (`undefined` or `null`); such sessions are never backfilled. Both are
  // encrypted with the network: the outcome follows from the participant's
  // answers.
  finishStageId?: string | null;
  finishOutcome?: FinishOutcome | null;
  exportedAt: string | null;
  currentStep: number;
  // Participant-facing progress (0–100) reported by @codaco/interview via
  // onStepChange. Optional so pre-existing rows (undefined) read as 0 until the
  // session is next advanced. The interview engine owns this value; the host
  // must not re-derive it.
  progress?: number;
  // A one-visit override set when marking an interview unfinished cannot find
  // an authored stage that is currently available. Navigation clears it.
  resumeStageOverrideIndex?: number;
  network: NcNetwork;
  stageMetadata?: StageMetadata;
  // Optional so pre-existing rows (undefined) read as not synthetic.
  isSynthetic?: boolean;
};

export type SessionStatusKind = 'in-progress' | 'complete';

// Stripped-down session metadata used by everything except the interview
// engine and the export pipeline. Excludes the heavy `network` blob and
// adds the two server-computed fields the table needs.
export type StoredSessionLite = {
  id: string;
  protocolHash: string;
  protocolName: string;
  caseId: string;
  startedAt: string;
  lastUpdatedAt: string;
  finishedAt: string | null;
  exportedAt: string | null;
  currentStep: number;
  isSynthetic?: boolean;
  statusKind: SessionStatusKind;
  progressPercent: number;
};

export type SessionSortColumn =
  | 'caseId'
  | 'protocolName'
  | 'startedAt'
  | 'updatedAt'
  | 'progress'
  // Sorts by completion state (in-progress < complete < exported). Supported by
  // the query backend; not yet surfaced as a sortable column in the dashboard.
  | 'status'
  | 'exportedAt';

export type SessionQueryParams = {
  // Administration display ordering; authored text and stored IDs stay literal.
  // Callers without app context get deterministic English ordering.
  locale?: string;
  search?: string;
  caseId?: string;
  protocolNames?: string[];
  startedRange?: { from: string; to: string };
  updatedRange?: { from: string; to: string };
  statuses?: SessionStatusKind[];
  exported?: boolean;
  sort: { column: SessionSortColumn; direction: 'asc' | 'desc' };
  page: number;
  pageSize: number;
};

export type SessionStatusCounts = {
  all: number;
  inProgress: number;
  complete: number;
};

export type SessionQueryResult = {
  rows: StoredSessionLite[];
  totalCount: number;
  statusCounts: SessionStatusCounts;
};

export type IdleTimeoutMinutes = 1 | 5 | 15 | 30 | 60;

export type StoredSettings = {
  id: 'device';
  exportGraphML: boolean;
  exportCSV: boolean;
  useScreenLayoutCoordinates: boolean;
  screenLayoutHeight: number;
  screenLayoutWidth: number;
  dismissedUpdates: string[];
  lastActiveProtocolHash?: string;
  lastActiveSessionId?: string;
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnEnter: boolean;
  requireUnlockOnExit: boolean;
  requireUnlockOnExport: boolean;
  sampleProtocolDismissed: boolean;
  // Opt-out analytics. Defaults to true; when false, no anonymous usage or
  // error telemetry is sent. Never carries participant data or a user
  // identifier — only the per-device installation id (see installationId.ts).
  analyticsEnabled: boolean;
  allowStageNavigation: boolean;
};

export type ProtocolWithCounts = StoredProtocol & {
  sessionCount: number;
};

export const DEFAULT_SETTINGS: StoredSettings = {
  id: 'device',
  exportGraphML: true,
  exportCSV: true,
  useScreenLayoutCoordinates: false,
  screenLayoutHeight: 1080,
  screenLayoutWidth: 1920,
  dismissedUpdates: [],
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
  sampleProtocolDismissed: false,
  analyticsEnabled: true,
  allowStageNavigation: true,
};
