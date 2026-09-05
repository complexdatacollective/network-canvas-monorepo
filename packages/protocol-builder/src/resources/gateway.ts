import { assetSchema, type Asset } from '@codaco/protocol-validation';
import type { Command } from '@codaco/studio-sync/apply';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

/**
 * The editor-facing port for protocol resources (the protocol format's asset
 * manifest entries and their bytes).
 *
 * This is a UI-to-host port, not a storage abstraction: an adapter is expected
 * to sit on the host's existing storage (Architect's IndexedDB and manifest
 * duck, Studio's HTTP/S3 asset path) rather than to introduce a second one.
 * Editor components call only these methods, so nothing in the package reaches
 * for host persistence, browser storage, or an HTTP endpoint.
 *
 * Two rules shape every type here:
 *
 * 1. A resource is referenced from stage fields by its asset id, exactly as the
 *    protocol format does today. A staged resource therefore receives its final
 *    asset id when it is staged, so a draft can reference it before finish; the
 *    reference lives and dies with the draft.
 * 2. Secret material (a Mapbox token, for example) never travels through the
 *    editor. Staging a secret yields a descriptor with the asset id plus an
 *    opaque {@link StagedSecretHandle}; resolving the handle into a manifest
 *    entry is the host adapter's job at promotion time, which is where
 *    Architect writes the protocol format's `apiKey` asset and Studio can keep
 *    the value server-side instead.
 *
 * ## Host adapter notes
 *
 * Things an adapter author needs that the types cannot say, recorded here
 * because each of them is a decision about a specific host rather than about
 * this port:
 *
 * - **Residue is defined per adapter.** `discardAllStaged` must leave no
 *   residue, but what counts as residue depends on how the host stores bytes.
 *   An adapter over a content-addressed store discards the *pins* it took, not
 *   the blocks: two sessions staging the same file share the content, and
 *   deleting it because one of them cancelled would empty the other's staging.
 *   The contract's `stagingResidue` harness control is where an adapter says
 *   what its own residue is.
 * - **Studio has no secret store yet.** `stageSecret`'s editor half is
 *   host-neutral, but its server half is not: Studio has nowhere to put the
 *   value, so a Studio adapter cannot yet resolve a handle at promotion the
 *   way Architect does by writing an `apiKey` asset. Until it has one, a
 *   Studio adapter should fail `stageSecret` with `unsupported-kind` rather
 *   than keep secret material somewhere unintended.
 * - **Studio's delivery serves some kinds as attachments.** `svg`, `mov`,
 *   `m4a`, and `aiff` are served with a download disposition, so a
 *   `resolvePreview` URL for them will not render in an `img`, `video`, or
 *   `audio` element. Previewing those kinds in Studio needs a delivery change
 *   there; it is not something this port or an adapter can work around.
 */
export type ProtocolBuilderResourceGateway = {
  /** Committed manifest resources plus everything staged in this session. */
  list(
    options?: ResourceListOptions,
  ): Promise<ResourceResult<readonly ResourceDescriptor[]>>;
  /**
   * Stages bytes for this editing session and assigns the asset id a stage
   * field may reference immediately. Repeating the call with the same
   * `requestId` returns the same descriptor instead of staging a second copy.
   */
  stageUpload(
    request: StageUploadRequest,
  ): Promise<ResourceResult<ResourceDescriptor>>;
  /**
   * Stages secret material. The value is consumed by the host; the caller
   * receives only the asset id (for the field) and an opaque handle (for
   * promotion). Repeating the call with the same `requestId` re-returns the
   * same staged secret rather than staging a second one.
   */
  stageSecret(
    request: StageSecretRequest,
  ): Promise<ResourceResult<StagedSecret>>;
  /** A URL an editor may render for a committed or staged content resource. */
  resolvePreview(resourceId: string): Promise<ResourceResult<ResourcePreview>>;
  /** Metadata (and cheap derived content facts) for one resource. */
  inspect(resourceId: string): Promise<ResourceResult<ResourceInspection>>;
  /** Raw bytes, for editors that must parse a resource themselves. */
  download(resourceId: string): Promise<ResourceResult<ResourceContent>>;
  /** Drops one staged resource and everything the host holds for it. */
  discardStaged(resourceId: string): Promise<ResourceResult<undefined>>;
  /** Drops every staged resource — the cancel/discard path — leaving no residue. */
  discardAllStaged(): Promise<ResourceResult<undefined>>;
  /**
   * Promotes staged resources and their manifest entries as one operation.
   *
   * The gateway moves the bytes, builds one `assetSchema`-valid manifest entry
   * per resource, and hands them to {@link ResourcePromotionRequest.applyManifest}
   * so the caller can apply them in the same atomic revision as the stage's own
   * edits. If that apply fails — or if any byte fails to move — the gateway
   * rolls its own work back completely and reports a retryable failure, so
   * bytes are never promoted without the matching manifest update. A repeated
   * call with the id of a promotion that already succeeded returns that
   * promotion without promoting or applying anything a second time.
   */
  promote(
    request: ResourcePromotionRequest,
  ): Promise<ResourceResult<ResourcePromotion>>;
};

/** Manifest asset types whose content is bytes the host stores. */
export type ResourceContentKind =
  | 'audio'
  | 'geojson'
  | 'image'
  | 'network'
  | 'video';

/** Every manifest asset type an editor can reference, secrets included. */
export type ResourceKind = ResourceContentKind | 'apikey';

/** Whether a resource is already in the protocol or only staged for this edit. */
export type ResourceStatus = 'committed' | 'staged';

/**
 * What an editor may know about a resource. Deliberately host-neutral: no
 * storage key, bucket, database, path, or URL of the host's own appears here,
 * and no secret material ever does.
 */
export type ResourceDescriptor = Readonly<{
  /** Manifest asset id. Stage fields reference exactly this string. */
  id: string;
  kind: ResourceKind;
  /** Researcher-facing name, as the manifest records it. */
  name: string;
  status: ResourceStatus;
  /** Manifest `source` filename; absent for secrets. */
  source?: string;
  /** Size of the stored content in bytes; absent for secrets. */
  byteLength?: number;
  /** IANA media type of the stored content; absent for secrets. */
  contentType?: string;
}>;

declare const stagedSecretHandleBrand: unique symbol;

/**
 * An opaque capability naming one staged secret. It is not the secret, is not
 * derived from it, and carries no host storage detail; it exists so the editing
 * session can ask the host to resolve the secret at promotion without ever
 * holding the value itself.
 */
export type StagedSecretHandle = string & {
  readonly [stagedSecretHandleBrand]: true;
};

/** Adapters construct handles through this single branding site. */
export function stagedSecretHandle(value: string): StagedSecretHandle {
  if (value === '') throw new Error('a staged secret handle must be non-empty');
  // The sole constructor for the branded string, mirroring the section-id
  // taxonomy's approach.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as StagedSecretHandle;
}

export type StagedSecret = Readonly<{
  /** Carries the asset id a stage field references; never the value. */
  descriptor: ResourceDescriptor;
  handle: StagedSecretHandle;
}>;

export type ResourceListOptions = Readonly<{
  kinds?: readonly ResourceKind[];
  status?: ResourceStatus;
}>;

/**
 * The largest file an editor will read into memory to stage it.
 *
 * A limit the editor knows, not only one the host enforces: `stageUpload`
 * takes bytes, so a control that waits for the host to refuse has already read
 * the whole file to learn it was too big — and the file a researcher picks by
 * mistake is exactly the one large enough to matter. A host may still refuse
 * something smaller, and that refusal is reported as any other is.
 */
export const RESOURCE_UPLOAD_MAX_BYTE_LENGTH = 8 * 1024 * 1024;

export type StageUploadRequest = Readonly<{
  /** Stable across an uncertain retry so a host stages the file once. */
  requestId: string;
  kind: ResourceContentKind;
  name: string;
  /** Filename the manifest will record; no path separators or `..`. */
  source: string;
  contentType: string;
  bytes: Uint8Array;
}>;

export type StageSecretRequest = Readonly<{
  /** Stable across an uncertain retry so a host stages the secret once. */
  requestId: string;
  name: string;
  /**
   * The secret itself. The host consumes it: it is never returned by any
   * gateway method, never placed on a descriptor, form draft, snapshot, or
   * failure, and never logged.
   */
  value: string;
}>;

export type ResourcePreview = Readonly<{
  resourceId: string;
  /** URL the editor may hand to an `img`, `video`, or `audio` element. */
  url: string;
  /** Epoch milliseconds after which `url` may stop resolving. */
  expiresAt?: number;
  /** Call when the preview stops being rendered, so the host can release it. */
  release(): void;
}>;

export type ResourceInspection = Readonly<{
  descriptor: ResourceDescriptor;
  /** Attribute names in a `network` roster, when the host parsed them. */
  variableNames?: readonly string[];
  /** Entity counts for a `network` resource. */
  counts?: Readonly<{ nodes: number; edges: number }>;
  /** Pixel dimensions for an `image` resource. */
  dimensions?: Readonly<{ width: number; height: number }>;
  /** Playback duration for `audio` and `video` resources. */
  durationSeconds?: number;
}>;

export type ResourceContent = Readonly<{
  resourceId: string;
  contentType: string;
  bytes: Uint8Array;
}>;

/**
 * The manifest half of a promotion, handed to the caller so it travels in the
 * same atomic apply as the stage's own edits (the `CompoundEditRequest` /
 * `FinishRequest` path).
 */
export type ManifestApplyRequest = Readonly<{
  promotionId: string;
  /** The singleton `assets` section these commands target. */
  sectionId: ProtocolSectionId;
  /** One `set` command per promoted resource, keyed by asset id. */
  commands: readonly Command[];
  /** The same resources, as they will appear once committed. */
  promoted: readonly ResourceDescriptor[];
}>;

export type ManifestApplyOutcome =
  | Readonly<{ status: 'applied' }>
  | Readonly<{
      status: 'failed';
      /** Whether repeating the identical promotion may still succeed. */
      retryable: boolean;
      /** Researcher-facing reason; must not name host storage internals. */
      message: string;
    }>;

export type ResourcePromotionRequest = Readonly<{
  /** Stable across an uncertain retry so a host promotes the intent once. */
  id: string;
  /** Staged resources the finished draft still references. */
  resourceIds: readonly string[];
  /** Handles for every staged secret named in `resourceIds`. */
  secretHandles?: readonly StagedSecretHandle[];
  applyManifest(
    request: ManifestApplyRequest,
  ): Promise<ManifestApplyOutcome> | ManifestApplyOutcome;
}>;

export type ResourcePromotion = Readonly<{
  id: string;
  /** The promoted resources, now committed. */
  promoted: readonly ResourceDescriptor[];
}>;

/**
 * Why a gateway call failed, in editor terms.
 *
 * Every reason describes the researcher's situation rather than the host's
 * storage: there is no reason for "S3 put failed", "IndexedDB blocked", or an
 * HTTP status, and adapters must map those onto `unavailable` (transient) or
 * `promotion-failed` (a promotion that was rolled back).
 */
export type ResourceFailureReason =
  /** The bytes are not usable as the kind they claim to be. */
  | 'invalid-content'
  /** The caller supplied an unusable request. */
  | 'invalid-request'
  /** No committed or staged resource has that id. */
  | 'not-found'
  /** The promotion was rolled back; nothing was committed. */
  | 'promotion-failed'
  /** The session cannot change resources while it is read-only. */
  | 'read-only'
  /** The content exceeds what the host will store for one resource. */
  | 'too-large'
  /** The host is temporarily unreachable; the same call may work later. */
  | 'unavailable'
  /** The operation is not meaningful for this resource kind. */
  | 'unsupported-kind';

export type ResourceGatewayFailure = Readonly<{
  reason: ResourceFailureReason;
  /** Safe to show a researcher; never names host storage internals. */
  message: string;
  /** True only when repeating the identical call may still succeed. */
  retryable: boolean;
  /** The resource the failure concerns, when it names one. */
  resourceId?: string;
}>;

export type ResourceResult<T> =
  | Readonly<{ status: 'ok'; data: T }>
  | Readonly<{ status: 'failed'; failure: ResourceGatewayFailure }>;

/**
 * Reasons that are retryable by default: exactly the ones describing a
 * transient host condition rather than a decision about the request. Every
 * operation that can report them is idempotent — `list`, `inspect`,
 * `resolvePreview`, `download`, and `discard*` are reads or removals, while
 * `stageUpload`, `stageSecret`, and `promote` are made idempotent by their
 * caller-supplied stable ids.
 */
const RETRYABLE_REASONS: ReadonlySet<ResourceFailureReason> =
  new Set<ResourceFailureReason>(['promotion-failed', 'unavailable']);

export function isRetryableByDefault(reason: ResourceFailureReason): boolean {
  return RETRYABLE_REASONS.has(reason);
}

export function resourceOk<T>(data: T): ResourceResult<T> {
  return Object.freeze({ status: 'ok', data });
}

export function resourceFailure<T>(
  reason: ResourceFailureReason,
  message: string,
  options?: Readonly<{ retryable?: boolean; resourceId?: string }>,
): ResourceResult<T> {
  return Object.freeze({
    status: 'failed',
    failure: Object.freeze({
      reason,
      message,
      retryable: options?.retryable ?? isRetryableByDefault(reason),
      ...(options?.resourceId === undefined
        ? {}
        : { resourceId: options.resourceId }),
    }),
  });
}

/**
 * Validates one manifest entry a host proposes for a promoted resource, so no
 * adapter can promote bytes behind an entry the protocol schema rejects.
 *
 * Only the schema's own message is reported — never the entry — because an
 * `apiKey` entry holds secret material.
 */
export function validateManifestEntry(
  resourceId: string,
  entry: unknown,
): ResourceResult<Asset> {
  const result = assetSchema.safeParse(entry);
  if (result.success) return resourceOk(result.data);
  return resourceFailure(
    'invalid-content',
    `asset ${resourceId}: ${result.error.issues[0]?.message ?? 'asset validation failed'}`,
    { resourceId },
  );
}
