import csv from 'csvtojson';

import type { Asset } from '@codaco/protocol-validation';
import type { Command } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  resourceFailure,
  resourceOk,
  stagedSecretHandle,
  validateManifestEntry,
  type ManifestApplyOutcome,
  type ProtocolBuilderResourceGateway,
  type ResourceContent,
  type ResourceContentKind,
  type ResourceDescriptor,
  type ResourceFailureReason,
  type ResourceInspection,
  type ResourceKind,
  type ResourceListOptions,
  type ResourcePreview,
  type ResourcePromotion,
  type ResourcePromotionRequest,
  type ResourceResult,
  type StagedSecret,
  type StagedSecretHandle,
  type StageSecretRequest,
  type StageUploadRequest,
} from './gateway.ts';

export type InMemoryResourceSeed =
  | Readonly<{
      kind: ResourceContentKind;
      id: string;
      name: string;
      source: string;
      contentType: string;
      bytes: Uint8Array;
    }>
  | Readonly<{
      kind: 'apikey';
      id: string;
      name: string;
      value: string;
    }>;

export type InMemoryResourceGatewayOperation =
  | 'discard'
  | 'download'
  | 'inspect'
  | 'list'
  | 'promote'
  | 'resolvePreview'
  | 'stageSecret'
  | 'stageUpload';

export type InMemoryResourceFailureOverride = Readonly<{
  reason?: ResourceFailureReason;
  message?: string;
  retryable?: boolean;
}>;

export type InMemoryResourceGatewayOptions = Readonly<{
  /** Resources the protocol already contains when the session opens. */
  committed?: readonly InMemoryResourceSeed[];
  /** Deterministic by default: `staged-resource-1`, `staged-resource-2`, … */
  createResourceId?: () => string;
  /** Largest content the host will accept for one resource. */
  maxByteLength?: number;
  readOnly?: boolean;
}>;

type StoredContent = Readonly<{ bytes: Uint8Array; contentType: string }>;

type StagedEntry = {
  descriptor: ResourceDescriptor;
  /** The `stageRequestKey` this entry was remembered under. */
  requestKey: string;
  content?: StoredContent;
  secret?: Readonly<{ handle: StagedSecretHandle; value: string }>;
};

type CommittedEntry = {
  descriptor: ResourceDescriptor;
  entry: Asset;
  content?: StoredContent;
};

const ASSETS_SECTION = sectionId({ kind: 'assets' });

const DEFAULT_INJECTED_FAILURE = Object.freeze({
  reason: 'unavailable' as ResourceFailureReason,
  message: 'the resource host is temporarily unavailable',
});

/**
 * A deterministic in-memory {@link ProtocolBuilderResourceGateway}: the test
 * double for the Redux-free proof host, the adapter the package's own tests run
 * the shared contract against, and the model an Architect or Studio adapter is
 * checked against.
 *
 * It models one atomic host boundary rather than any real transport. Staged
 * bytes live outside the committed manifest until `promote`, promotion moves
 * each resource into the committed store one at a time — as a real store would
 * accept one write at a time — and any failure, in the gateway's own work or in
 * the caller's manifest apply, undoes every move it already made before
 * reporting a retryable failure.
 *
 * Failure points are injectable so partial-failure rollback and retry are
 * testable without reaching into private state.
 */
export class InMemoryResourceGateway implements ProtocolBuilderResourceGateway {
  private readonly committed = new Map<string, CommittedEntry>();
  private readonly staged = new Map<string, StagedEntry>();
  /**
   * Stage request key → resourceId, so a repeated stage call stages once.
   *
   * Keyed by the operation as well as the id: a request id is unique to the
   * picker that made it, and an upload and a secret can carry the same one.
   */
  private readonly stageRequests = new Map<string, string>();
  /** promotionId → promotion, so a repeated promote promotes once. */
  private readonly promotions = new Map<string, ResourcePromotion>();
  /**
   * promotionId → the promotion still running under it, so a retry that
   * arrives before the first one settles joins it instead of moving the same
   * resources a second time and applying the manifest twice.
   */
  private readonly promotionsInFlight = new Map<
    string,
    Promise<ResourceResult<ResourcePromotion>>
  >();
  private readonly injectedFailures = new Map<
    InMemoryResourceGatewayOperation,
    InMemoryResourceFailureOverride
  >();
  /** previewKey → resourceId, for previews the caller has not released. */
  private readonly openPreviews = new Map<string, string>();
  private readonly createResourceId: () => string;
  private readonly maxByteLength: number;
  private partialPromotionFailurePending = false;
  private nextPreviewKey = 1;
  private nextHandle = 1;
  private readOnly: boolean;

  constructor(options: InMemoryResourceGatewayOptions = {}) {
    let nextResourceId = 1;
    this.createResourceId =
      options.createResourceId ?? (() => `staged-resource-${nextResourceId++}`);
    this.maxByteLength = options.maxByteLength ?? 8 * 1024 * 1024;
    this.readOnly = options.readOnly ?? false;

    for (const seed of options.committed ?? []) {
      if (this.committed.has(seed.id)) {
        throw new Error(`duplicate committed resource ${seed.id}`);
      }
      this.committed.set(seed.id, committedEntryFromSeed(seed));
    }
  }

  // --- test controls -------------------------------------------------------

  /** Fails the next call to `operation` once, then behaves normally again. */
  failNext(
    operation: InMemoryResourceGatewayOperation,
    override: InMemoryResourceFailureOverride = {},
  ): void {
    this.injectedFailures.set(operation, override);
  }

  /**
   * Fails the next promotion after some, but not all, resources have moved into
   * the committed store — the partial failure whose rollback must be complete.
   */
  failNextPromotionPartially(): void {
    this.partialPromotionFailurePending = true;
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
  }

  /**
   * Stages content the host can hold but cannot name — bytes pasted or dropped
   * with no filename — so a promotion has to refuse it: the manifest records a
   * `source`, and there is none to record.
   */
  stageUnnamedContent(): ResourceDescriptor {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const resourceId = this.claimResourceId();
    const requestKey = stageRequestKey('upload', `unnamed-${resourceId}`);
    const descriptor = Object.freeze({
      id: resourceId,
      kind: 'image' as const,
      name: 'Pasted image',
      status: 'staged' as const,
      byteLength: bytes.byteLength,
      contentType: 'image/png',
    });
    this.staged.set(resourceId, {
      descriptor,
      requestKey,
      content: Object.freeze({
        bytes: Uint8Array.from(bytes),
        contentType: 'image/png',
      }),
    });
    this.stageRequests.set(requestKey, resourceId);
    return descriptor;
  }

  /** The manifest the host would serve right now, keyed by asset id. */
  getCommittedManifest(): Readonly<Record<string, Asset>> {
    const manifest: Record<string, Asset> = {};
    for (const [resourceId, committed] of this.committed) {
      manifest[resourceId] = structuredClone(committed.entry);
    }
    return Object.freeze(manifest);
  }

  /**
   * Everything the host still holds on behalf of staging: staged descriptors,
   * their bytes, secret handles, remembered stage requests, and previews for
   * resources that were never committed. Discarding must empty this.
   */
  getStagingResidue(): readonly string[] {
    const residue: string[] = [];
    for (const [resourceId, staged] of this.staged) {
      residue.push(`staged:${resourceId}`);
      if (staged.content !== undefined) residue.push(`content:${resourceId}`);
      if (staged.secret !== undefined) {
        residue.push(`secret:${staged.secret.handle}`);
      }
    }
    for (const requestKey of this.stageRequests.keys()) {
      residue.push(`request:${requestKey}`);
    }
    for (const [previewKey, resourceId] of this.openPreviews) {
      if (!this.committed.has(resourceId))
        residue.push(`preview:${previewKey}`);
    }
    return Object.freeze(residue.toSorted());
  }

  // --- gateway -------------------------------------------------------------

  list(
    options: ResourceListOptions = {},
  ): Promise<ResourceResult<readonly ResourceDescriptor[]>> {
    const injected = this.takeInjectedFailure('list');
    if (injected !== undefined) return Promise.resolve(injected);

    const kinds =
      options.kinds === undefined
        ? undefined
        : new Set<ResourceKind>(options.kinds);
    const descriptors = [
      ...[...this.committed.values()].map((entry) => entry.descriptor),
      ...[...this.staged.values()].map((entry) => entry.descriptor),
    ]
      .filter(
        (descriptor) =>
          (options.status === undefined ||
            descriptor.status === options.status) &&
          (kinds === undefined || kinds.has(descriptor.kind)),
      )
      .toSorted((left, right) => (left.id < right.id ? -1 : 1));

    return Promise.resolve(resourceOk(Object.freeze(descriptors)));
  }

  stageUpload(
    request: StageUploadRequest,
  ): Promise<ResourceResult<ResourceDescriptor>> {
    const injected = this.takeInjectedFailure('stageUpload');
    if (injected !== undefined) return Promise.resolve(injected);
    if (this.readOnly) return Promise.resolve(readOnlyFailure());

    if (request.requestId.trim() === '' || request.name.trim() === '') {
      return Promise.resolve(
        resourceFailure(
          'invalid-request',
          'a staged file needs a stable request id and a name',
        ),
      );
    }
    if (
      request.source === '' ||
      request.source === '..' ||
      request.source.includes('/') ||
      request.source.includes('\\')
    ) {
      return Promise.resolve(
        resourceFailure(
          'invalid-request',
          'a staged file needs a filename without path separators',
        ),
      );
    }
    if (request.bytes.byteLength === 0) {
      return Promise.resolve(
        resourceFailure('invalid-content', 'the selected file is empty'),
      );
    }
    if (request.bytes.byteLength > this.maxByteLength) {
      return Promise.resolve(
        resourceFailure(
          'too-large',
          `the selected file is larger than the ${this.maxByteLength} byte limit`,
        ),
      );
    }

    const requestKey = stageRequestKey('upload', request.requestId);
    const existing = this.existingStageRequest(requestKey);
    if (existing !== undefined) {
      return Promise.resolve(resourceOk(existing.descriptor));
    }

    const resourceId = this.claimResourceId();
    const descriptor = Object.freeze({
      id: resourceId,
      kind: request.kind,
      name: request.name,
      status: 'staged' as const,
      source: request.source,
      byteLength: request.bytes.byteLength,
      contentType: request.contentType,
    });
    this.staged.set(resourceId, {
      descriptor,
      requestKey,
      content: Object.freeze({
        bytes: Uint8Array.from(request.bytes),
        contentType: request.contentType,
      }),
    });
    this.stageRequests.set(requestKey, resourceId);
    return Promise.resolve(resourceOk(descriptor));
  }

  stageSecret(
    request: StageSecretRequest,
  ): Promise<ResourceResult<StagedSecret>> {
    const injected = this.takeInjectedFailure('stageSecret');
    if (injected !== undefined) return Promise.resolve(injected);
    if (this.readOnly) return Promise.resolve(readOnlyFailure());

    if (request.requestId.trim() === '' || request.name.trim() === '') {
      return Promise.resolve(
        resourceFailure(
          'invalid-request',
          'a staged secret needs a stable request id and a name',
        ),
      );
    }
    if (request.value === '') {
      return Promise.resolve(
        resourceFailure('invalid-content', 'the secret value is empty'),
      );
    }

    const requestKey = stageRequestKey('secret', request.requestId);
    const existing = this.existingStageRequest(requestKey);
    if (existing?.secret !== undefined) {
      return Promise.resolve(
        resourceOk(
          Object.freeze({
            descriptor: existing.descriptor,
            handle: existing.secret.handle,
          }),
        ),
      );
    }

    const resourceId = this.claimResourceId();
    const descriptor = Object.freeze({
      id: resourceId,
      kind: 'apikey' as const,
      name: request.name,
      status: 'staged' as const,
    });
    // Opaque, and unrelated to the value: nothing about the secret can be
    // recovered from the handle.
    const handle = stagedSecretHandle(`staged-secret-${this.nextHandle++}`);
    this.staged.set(resourceId, {
      descriptor,
      requestKey,
      secret: Object.freeze({ handle, value: request.value }),
    });
    this.stageRequests.set(requestKey, resourceId);
    return Promise.resolve(resourceOk(Object.freeze({ descriptor, handle })));
  }

  resolvePreview(resourceId: string): Promise<ResourceResult<ResourcePreview>> {
    const injected = this.takeInjectedFailure('resolvePreview');
    if (injected !== undefined) return Promise.resolve(injected);

    const found = this.find(resourceId);
    if (found === undefined) {
      return Promise.resolve(notFoundFailure(resourceId));
    }
    if (found.descriptor.kind === 'apikey' || found.content === undefined) {
      return Promise.resolve(
        resourceFailure(
          'unsupported-kind',
          'secret material cannot be previewed',
          { resourceId },
        ),
      );
    }

    const previewKey = `preview-${this.nextPreviewKey++}`;
    this.openPreviews.set(previewKey, resourceId);
    const content = found.content;
    return Promise.resolve(
      resourceOk(
        Object.freeze({
          resourceId,
          url: `data:${content.contentType};base64,${toBase64(content.bytes)}`,
          release: () => {
            this.openPreviews.delete(previewKey);
          },
        }),
      ),
    );
  }

  async inspect(
    resourceId: string,
  ): Promise<ResourceResult<ResourceInspection>> {
    const injected = this.takeInjectedFailure('inspect');
    if (injected !== undefined) return injected;

    const found = this.find(resourceId);
    if (found === undefined) return notFoundFailure(resourceId);
    if (found.descriptor.kind !== 'network' || found.content === undefined) {
      return resourceOk(Object.freeze({ descriptor: found.descriptor }));
    }

    const network = await parseRoster(found.descriptor, found.content);
    if (network === undefined) {
      return resourceFailure(
        'invalid-content',
        'the selected file is not a readable network',
        { resourceId },
      );
    }
    return resourceOk(
      Object.freeze({
        descriptor: found.descriptor,
        counts: network.counts,
        variableNames: network.variableNames,
      }),
    );
  }

  download(resourceId: string): Promise<ResourceResult<ResourceContent>> {
    const injected = this.takeInjectedFailure('download');
    if (injected !== undefined) return Promise.resolve(injected);

    const found = this.find(resourceId);
    if (found === undefined) {
      return Promise.resolve(notFoundFailure(resourceId));
    }
    if (found.descriptor.kind === 'apikey' || found.content === undefined) {
      return Promise.resolve(
        resourceFailure(
          'unsupported-kind',
          'secret material cannot be downloaded',
          { resourceId },
        ),
      );
    }
    return Promise.resolve(
      resourceOk(
        Object.freeze({
          resourceId,
          contentType: found.content.contentType,
          bytes: Uint8Array.from(found.content.bytes),
        }),
      ),
    );
  }

  discardStaged(resourceId: string): Promise<ResourceResult<undefined>> {
    const injected = this.takeInjectedFailure('discard');
    if (injected !== undefined) return Promise.resolve(injected);

    const staged = this.staged.get(resourceId);
    if (staged === undefined) {
      return Promise.resolve(notFoundFailure(resourceId));
    }
    this.releaseStaged(staged);
    this.releasePreviewsFor(resourceId);
    return Promise.resolve(resourceOk(undefined));
  }

  discardAllStaged(): Promise<ResourceResult<undefined>> {
    const injected = this.takeInjectedFailure('discard');
    if (injected !== undefined) return Promise.resolve(injected);

    // Deleting the entry the loop is standing on is safe for a Map iterator.
    for (const staged of this.staged.values()) {
      this.releaseStaged(staged);
      this.releasePreviewsFor(staged.descriptor.id);
    }
    return Promise.resolve(resourceOk(undefined));
  }

  promote(
    request: ResourcePromotionRequest,
  ): Promise<ResourceResult<ResourcePromotion>> {
    const injected = this.takeInjectedFailure('promote');
    if (injected !== undefined) return Promise.resolve(injected);
    if (this.readOnly) return Promise.resolve(readOnlyFailure());

    const completed = this.promotions.get(request.id);
    if (completed !== undefined) return Promise.resolve(resourceOk(completed));

    // A promotion id is one intent, whether its retry arrives after the first
    // attempt settled or while it is still running. Two attempts moving the
    // same resources would apply the manifest twice, and the one that failed
    // would roll back over what the one that succeeded had just committed.
    const running = this.promotionsInFlight.get(request.id);
    if (running !== undefined) return running;

    // Registered before anything is awaited, so a call made in the same turn
    // as this one finds it.
    const started = this.runPromotion(request).finally(() => {
      this.promotionsInFlight.delete(request.id);
    });
    this.promotionsInFlight.set(request.id, started);
    return started;
  }

  // --- internals -----------------------------------------------------------

  private async runPromotion(
    request: ResourcePromotionRequest,
  ): Promise<ResourceResult<ResourcePromotion>> {
    const resolved = this.resolvePromotionItems(request);
    if (resolved.status === 'failed') return resolved;
    const items = resolved.data;

    const commands: Command[] = [];
    const promoted: ResourceDescriptor[] = [];
    const entries: Asset[] = [];
    for (const staged of items) {
      const validated = validateManifestEntry(
        staged.descriptor.id,
        manifestEntryFor(staged),
      );
      if (validated.status === 'failed') {
        return resourceFailure(
          validated.failure.reason,
          validated.failure.message,
          {
            retryable: validated.failure.retryable,
            resourceId: staged.descriptor.id,
          },
        );
      }
      entries.push(validated.data);
      commands.push({
        op: 'set',
        key: staged.descriptor.id,
        value: validated.data,
      });
      promoted.push(
        Object.freeze({ ...staged.descriptor, status: 'committed' as const }),
      );
    }

    // Move the bytes one resource at a time, as a real store would accept one
    // write at a time, and undo every completed move if any step fails.
    const moved: string[] = [];
    const rollback = () => {
      for (const resourceId of moved) this.committed.delete(resourceId);
    };
    const failAt = items.length > 1 ? 1 : 0;
    for (const [index, staged] of items.entries()) {
      if (this.partialPromotionFailurePending && index === failAt) {
        this.partialPromotionFailurePending = false;
        rollback();
        return resourceFailure(
          'promotion-failed',
          'the resources could not be stored; nothing was changed',
          { resourceId: staged.descriptor.id },
        );
      }
      const entry = entries[index];
      const descriptor = promoted[index];
      if (entry === undefined || descriptor === undefined) {
        rollback();
        return resourceFailure(
          'promotion-failed',
          'the resources could not be stored; nothing was changed',
          { resourceId: staged.descriptor.id },
        );
      }
      this.committed.set(staged.descriptor.id, {
        descriptor,
        entry,
        ...(staged.content === undefined ? {} : { content: staged.content }),
      });
      moved.push(staged.descriptor.id);
    }

    let outcome: ManifestApplyOutcome;
    try {
      outcome = await request.applyManifest(
        Object.freeze({
          promotionId: request.id,
          sectionId: ASSETS_SECTION,
          commands: Object.freeze(commands),
          promoted: Object.freeze(promoted),
        }),
      );
    } catch (error: unknown) {
      rollback();
      return resourceFailure(
        'promotion-failed',
        error instanceof Error && error.message !== ''
          ? error.message
          : 'the asset manifest could not be updated',
      );
    }

    if (outcome.status === 'failed') {
      rollback();
      return resourceFailure('promotion-failed', outcome.message, {
        retryable: outcome.retryable,
      });
    }

    for (const staged of items) this.releaseStaged(staged);
    const promotion = Object.freeze({
      id: request.id,
      promoted: Object.freeze(promoted),
    });
    this.promotions.set(request.id, promotion);
    return resourceOk(promotion);
  }

  private resolvePromotionItems(
    request: ResourcePromotionRequest,
  ): ResourceResult<readonly StagedEntry[]> {
    if (request.id.trim() === '') {
      return resourceFailure(
        'invalid-request',
        'a promotion requires a stable request id',
      );
    }
    if (request.resourceIds.length === 0) {
      return resourceFailure(
        'invalid-request',
        'a promotion must name at least one staged resource',
      );
    }
    if (new Set(request.resourceIds).size !== request.resourceIds.length) {
      return resourceFailure(
        'invalid-request',
        'a promotion may name each resource only once',
      );
    }

    const handles = new Set<StagedSecretHandle>(request.secretHandles ?? []);
    const items: StagedEntry[] = [];
    for (const resourceId of request.resourceIds) {
      const staged = this.staged.get(resourceId);
      if (staged === undefined) {
        return this.committed.has(resourceId)
          ? resourceFailure(
              'invalid-request',
              'that resource is already part of the protocol',
              { resourceId },
            )
          : notFoundFailure(resourceId);
      }
      if (staged.secret !== undefined && !handles.has(staged.secret.handle)) {
        return resourceFailure(
          'invalid-request',
          'a staged secret can only be promoted with its staged handle',
          { resourceId },
        );
      }
      items.push(staged);
    }
    return resourceOk(Object.freeze(items));
  }

  private existingStageRequest(requestKey: string): StagedEntry | undefined {
    const resourceId = this.stageRequests.get(requestKey);
    return resourceId === undefined ? undefined : this.staged.get(resourceId);
  }

  private claimResourceId(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const resourceId = this.createResourceId();
      if (
        resourceId !== '' &&
        !this.committed.has(resourceId) &&
        !this.staged.has(resourceId)
      ) {
        return resourceId;
      }
    }
    throw new Error('could not allocate an unused resource id');
  }

  private find(
    resourceId: string,
  ):
    | Readonly<{ descriptor: ResourceDescriptor; content?: StoredContent }>
    | undefined {
    return this.staged.get(resourceId) ?? this.committed.get(resourceId);
  }

  private releaseStaged(staged: StagedEntry): void {
    this.staged.delete(staged.descriptor.id);
    this.stageRequests.delete(staged.requestKey);
    staged.content = undefined;
    staged.secret = undefined;
  }

  private releasePreviewsFor(resourceId: string): void {
    for (const [previewKey, previewResourceId] of this.openPreviews) {
      if (previewResourceId === resourceId)
        this.openPreviews.delete(previewKey);
    }
  }

  private takeInjectedFailure(
    operation: InMemoryResourceGatewayOperation,
  ): ResourceResult<never> | undefined {
    const override = this.injectedFailures.get(operation);
    if (override === undefined) return undefined;
    this.injectedFailures.delete(operation);
    const reason = override.reason ?? DEFAULT_INJECTED_FAILURE.reason;
    return resourceFailure<never>(
      reason,
      override.message ?? DEFAULT_INJECTED_FAILURE.message,
      override.retryable === undefined ? {} : { retryable: override.retryable },
    );
  }
}

/**
 * The key one staging request is remembered under. Callers are told only that
 * a request id must be stable, not that it must be unique across the pickers
 * an editor happens to be showing, so the operation is part of the key.
 */
function stageRequestKey(
  operation: 'secret' | 'upload',
  requestId: string,
): string {
  return `${operation}:${requestId}`;
}

function committedEntryFromSeed(seed: InMemoryResourceSeed): CommittedEntry {
  if (seed.kind === 'apikey') {
    return {
      descriptor: Object.freeze({
        id: seed.id,
        kind: 'apikey' as const,
        name: seed.name,
        status: 'committed' as const,
      }),
      entry: {
        type: 'apikey',
        id: seed.id,
        name: seed.name,
        value: seed.value,
      },
    };
  }
  return {
    descriptor: Object.freeze({
      id: seed.id,
      kind: seed.kind,
      name: seed.name,
      status: 'committed' as const,
      source: seed.source,
      byteLength: seed.bytes.byteLength,
      contentType: seed.contentType,
    }),
    entry: {
      type: seed.kind,
      id: seed.id,
      name: seed.name,
      source: seed.source,
    },
    content: Object.freeze({
      bytes: Uint8Array.from(seed.bytes),
      contentType: seed.contentType,
    }),
  };
}

/**
 * The manifest entry this host writes for a staged resource. Resolving the
 * staged secret happens here and nowhere else: Architect's protocol format
 * stores the token as an `apiKey` asset, and a Studio adapter would substitute
 * a server-side reference at exactly this point instead.
 */
function manifestEntryFor(staged: StagedEntry): unknown {
  if (staged.secret !== undefined) {
    return {
      type: 'apikey',
      id: staged.descriptor.id,
      name: staged.descriptor.name,
      value: staged.secret.value,
    };
  }
  return {
    type: staged.descriptor.kind,
    id: staged.descriptor.id,
    name: staged.descriptor.name,
    source: staged.descriptor.source,
  };
}

type RosterFacts = Readonly<{
  counts: Readonly<{ nodes: number; edges: number }>;
  variableNames: readonly string[];
}>;

/**
 * The facts a researcher picks a roster on, read from the file the same way
 * Architect reads it: which format the resource is in is decided by its
 * filename, exactly as Architect's own `networkReader` switches on the
 * extension, and the media type answers only for a resource whose name says
 * nothing.
 */
function parseRoster(
  descriptor: ResourceDescriptor,
  content: StoredContent,
): Promise<RosterFacts | undefined> {
  const text = new TextDecoder().decode(content.bytes);
  return isCsvRoster(descriptor, content)
    ? parseCsvRoster(text)
    : Promise.resolve(parseJsonRoster(text));
}

function isCsvRoster(
  descriptor: ResourceDescriptor,
  content: StoredContent,
): boolean {
  const source = descriptor.source?.toLowerCase() ?? '';
  if (source.endsWith('.csv')) return true;
  if (source.endsWith('.json')) return false;
  return content.contentType.split(';')[0]?.trim().toLowerCase() === 'text/csv';
}

/**
 * A CSV roster is one node per row, its columns that node's attributes, and no
 * edges — Architect's own reading of the same file, through the same parser.
 * `checkColumn` comes with it: a row carrying more or fewer values than the
 * header names is content the researcher has to fix, not a row to silently
 * keep half of.
 */
async function parseCsvRoster(text: string): Promise<RosterFacts | undefined> {
  const converter = csv({ checkColumn: true });
  // A mismatched row is reported as an event and the row is dropped: the parse
  // still settles, with a roster quietly shorter than the file. Listening is
  // also what keeps the failure from surfacing as an unhandled stream error.
  let malformed = false;
  converter.on('error', () => {
    malformed = true;
  });

  let rows: unknown;
  try {
    rows = await converter.fromString(text);
  } catch {
    return undefined;
  }
  if (malformed || !Array.isArray(rows)) return undefined;
  const parsedRows: readonly unknown[] = rows;
  const attributes = parsedRows.filter(isAttributeRecord);
  if (attributes.length !== parsedRows.length) return undefined;

  return Object.freeze({
    counts: Object.freeze({ nodes: attributes.length, edges: 0 }),
    variableNames: attributeNames(attributes),
  });
}

function parseJsonRoster(text: string): RosterFacts | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isAttributeRecord(parsed)) return undefined;
  const nodes: readonly unknown[] | undefined = Array.isArray(parsed.nodes)
    ? parsed.nodes
    : undefined;
  const edges: readonly unknown[] = Array.isArray(parsed.edges)
    ? parsed.edges
    : [];
  if (nodes === undefined) return undefined;

  return Object.freeze({
    counts: Object.freeze({ nodes: nodes.length, edges: edges.length }),
    variableNames: attributeNames(
      nodes.flatMap((node) => {
        if (!isAttributeRecord(node)) return [];
        const attributes: unknown = node.attributes;
        return isAttributeRecord(attributes) ? [attributes] : [];
      }),
    ),
  });
}

/**
 * Sorted rather than in the order the file happens to list them, because this
 * is what a summary shows a researcher comparing two similarly named rosters,
 * and a row that names its columns in a different order is the same roster.
 */
function attributeNames(
  attributes: readonly Readonly<Record<string, unknown>>[],
): readonly string[] {
  const names = new Set<string>();
  for (const record of attributes) {
    for (const name of Object.keys(record)) names.add(name);
  }
  return Object.freeze([...names].toSorted());
}

function isAttributeRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function notFoundFailure<T>(resourceId: string): ResourceResult<T> {
  return resourceFailure('not-found', 'that resource is no longer available', {
    resourceId,
  });
}

function readOnlyFailure<T>(): ResourceResult<T> {
  return resourceFailure(
    'read-only',
    'this protocol is open for viewing only, so its resources cannot change',
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
