import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

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

export type StoredProtocol = {
  id: string;
  hash: string;
  name: string;
  schemaVersion: number;
  lastModified?: string;
  importedAt: string;
  description?: string;
  codebook: CurrentProtocol['codebook'];
  protocol: CurrentProtocol;
};

export type StoredSession = {
  id: string;
  protocolHash: string;
  protocolName: string;
  caseId: string;
  startedAt: string;
  lastUpdatedAt: string;
  finishedAt: string | null;
  exportedAt: string | null;
  currentStep: number;
  network: NcNetwork;
  stageMetadata?: Record<string, unknown>;
  // Optional so pre-existing rows (undefined) read as not synthetic.
  isSynthetic?: boolean;
};

export type SessionStatusKind = 'in-progress' | 'complete' | 'exported';

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
};
