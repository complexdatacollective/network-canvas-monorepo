import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork, StageMetadata } from '@codaco/shared-consts';

/**
 * Package-internal asset representation. Has only the fields the interviewer
 * needs at runtime (ID, display name, type, and optionally an inline value
 * for apikey-style assets). URLs are resolved lazily via AssetRequestHandler.
 */
export type ResolvedAsset = {
  assetId: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'network' | 'geojson' | 'apikey';
  value?: string; // populated for apikey assets only
  // Original source filename from the protocol manifest (e.g. `intro.mov`).
  // The display `name` may lack an extension, so MIME-type and CSV/JSON
  // decisions derive from `source` when present, falling back to `name`.
  source?: string;
};

/**
 * Protocol payload: the validated protocol plus per-interview metadata
 * (id, importedAt, hash) the package carries in its store. Always schema 8 —
 * older protocols are migrated to the current version at import time, so
 * downstream code never sees a versioned union.
 *
 * `hash` is the host-computed canonical content hash (codebook + stages),
 * produced by `hashProtocol` from `@codaco/protocol-validation` at protocol
 * import time. Forwarded through analytics events as the `protocol_hash`
 * super property.
 */
export type ProtocolPayload = Omit<CurrentProtocol, 'assetManifest'> & {
  id: string;
  hash: string;
  importedAt: string; // ISO
  assets: ResolvedAsset[];
};

/**
 * Session payload. Matches the persisted session state used by the reducer,
 * but is kept explicit so the public contract does not expose Redux internals.
 */
export type SessionPayload = {
  id: string;
  startTime: string;
  finishTime: string | null;
  exportTime: string | null;
  lastUpdated: string;
  network: NcNetwork;
  promptIndex?: number;
  stageMetadata?: StageMetadata;
  stageRequiresEncryption?: boolean;
};

export type InterviewPayload = {
  session: SessionPayload;
  protocol: ProtocolPayload;
};

export type SyncHandler = (
  interviewId: string,
  session: SessionPayload,
) => Promise<void>;

export type FinishHandler = (
  interviewId: string,
  signal: AbortSignal,
) => Promise<void>;

export type AssetRequestHandler = (assetId: string) => Promise<string>;

/**
 * Participant-facing progress for the step the package is moving to. `progress`
 * is the 0–100 value shown in the interview's own progress bar (see
 * `getInterviewProgress`); `totalSteps` is the true number of steps including
 * the synthetic FinishSession stage the package appends (so it is one greater
 * than the protocol's stage count). Hosts should persist/display these directly
 * rather than re-deriving progress from the bare step index, which requires
 * knowing about the appended finish stage.
 */
export type StepChangeMeta = {
  progress: number;
  totalSteps: number;
};

export type StepChangeHandler = (step: number, meta: StepChangeMeta) => void;

export type InterviewerFlags = {
  isE2E?: boolean;
  isDevelopment?: boolean;
};

/**
 * Host-supplied analytics metadata. Strict typed schema — adding fields
 * requires a package release. The host-app discriminator and installation
 * id are required and become PostHog super properties on every event.
 */
export type InterviewAnalyticsMetadata = {
  installationId: string;
  hostApp: string;
  hostVersion?: string;
};
