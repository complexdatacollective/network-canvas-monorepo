import type { CurrentProtocol } from '@codaco/protocol-validation';

import type { SessionState } from '../store/modules/session';

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
 * Session payload. Matches the shape of SessionState (already used by the
 * reducer) — re-exported from a stable public name.
 */
export type SessionPayload = SessionState;

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

export type StepChangeHandler = (step: number) => void;

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
