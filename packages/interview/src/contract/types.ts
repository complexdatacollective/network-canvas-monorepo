import type {
  CurrentProtocol,
  LocaleMetadata,
  LocaleTag,
} from '@codaco/protocol-validation';
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
 * (id, importedAt, hash) the package carries in its store. Always the current
 * schema version — older protocols are migrated to it at import time, so
 * downstream code never sees a versioned union.
 *
 * `hash` is the host-computed canonical content hash (localization, codebook
 * and stages), produced by `hashProtocol` from `@codaco/protocol-validation`
 * at protocol import time. Forwarded through analytics events as the `protocol_hash`
 * super property.
 */
export type ProtocolPayload = Omit<CurrentProtocol, 'assetManifest'> & {
  id: string;
  hash: string;
  importedAt: string; // ISO
  assets: ResolvedAsset[];
};

/**
 * The session as the engine holds it and hands it to `SyncHandler`. Matches the
 * persisted session state used by the reducer, but is kept explicit so the
 * public contract does not expose Redux internals.
 *
 * The two locale fields are owned by `ProtocolLocaleChangeHandler`, not by the
 * general sync route: a change to either reaches the host only through that
 * handler, and a host persisting a `SyncHandler` snapshot must not write them.
 */
export type SessionSnapshot = {
  id: string;
  startTime: string;
  finishTime: string | null;
  exportTime: string | null;
  lastUpdated: string;
  network: NcNetwork;
  promptIndex?: number;
  stageMetadata?: StageMetadata;
  stageRequiresEncryption?: boolean;
  /**
   * The language the participant chose on a language chooser stage. The only
   * stored value that decides which protocol translation is shown; `null`
   * until a choice is made, and the browser's languages decide until then.
   */
  localePreference: LocaleTag | null;
  /**
   * The protocol translation last shown, recorded for exports only and never
   * used to choose one. `null` until the engine first reports it.
   */
  locale: LocaleTag | null;
};

/**
 * What a host passes to start or resume an interview.
 *
 * `localeOptions` is presentation metadata for every locale the protocol
 * declares, in declaration order (`getLocaleMetadata` from
 * `@codaco/protocol-validation`). The host derives it rather than the engine so
 * a server-rendered host can serialise the exact labels it rendered with:
 * display names vary between JavaScript runtimes, and deriving them again on
 * the client would break hydration. It is never persisted or synchronised.
 */
export type SessionPayload = SessionSnapshot & {
  localeOptions: readonly LocaleMetadata[];
};

export type InterviewPayload = {
  session: SessionPayload;
  protocol: ProtocolPayload;
};

/**
 * Why the engine is asking for this write.
 *
 * `immediate` marks the moments where deferring is not an option: the
 * participant is leaving the interview, finishing it, or the document is being
 * hidden and may never run script again. A host that batches writes must stop
 * batching when it sees this, write the snapshot it was given, and resolve only
 * once that write is durable.
 *
 * Ordinary changes arrive with `immediate: false`. The engine does not batch
 * them — how often a change becomes a write is the host's decision, because
 * only the host knows what a write costs. A local database write can happen on
 * every change; a network request usually should not (see
 * `createDebouncedSyncHandler`).
 */
export type SyncOptions = {
  immediate: boolean;
  /**
   * The document is being hidden or unloaded and may never run script again —
   * so this can be the last write it is able to make, and nothing may be left
   * waiting on anything else to finish first. Always accompanied by
   * `immediate`.
   *
   * A host whose writes leave the page should use a transport that outlives it
   * (`fetch`'s `keepalive`) when it sees this, and must not queue the write
   * behind a request that will die with the document.
   */
  unloading: boolean;
};

export type SyncHandler = (
  interviewId: string,
  session: SessionSnapshot,
  options: SyncOptions,
) => Promise<void>;

export type ProtocolLocaleChange = Readonly<{
  locale: LocaleTag;
  localePreference: LocaleTag | null;
}>;

/**
 * Persists the session's locale fields. Called once when the participant
 * states a preference, and once whenever the language shown differs from the
 * stored `locale` (a resumed interview on a device with different languages).
 * Calls for one interview are made one at a time, in order.
 */
export type ProtocolLocaleChangeHandler = (
  interviewId: string,
  change: ProtocolLocaleChange,
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
  /** Stable custom `app` discriminator retained for historical analytics. */
  hostApp: string;
  /** Human-readable name used by PostHog's built-in App name property. */
  appName?: string;
  hostVersion?: string;
};
