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
  requireUnlockOnResume: boolean;
  requireUnlockOnExport: boolean;
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
  requireUnlockOnResume: true,
  requireUnlockOnExport: false,
};
