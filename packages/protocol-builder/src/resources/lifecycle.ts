import type { ProtocolValidationIssue } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  resourceFailure,
  type ManifestApplyRequest,
  type ProtocolBuilderResourceGateway,
  type ResourceDescriptor,
  type ResourceGatewayFailure,
  type ResourceListOptions,
  type ResourcePromotion,
  type ResourcePromotionRequest,
  type ResourceResult,
  type StagedSecret,
  type StagedSecretHandle,
  type StageSecretRequest,
  type StageUploadRequest,
} from './gateway.ts';
import {
  collectStageResourceReferences,
  findDanglingResourceReferences,
  type DanglingResourceReference,
} from './references.ts';

const ASSETS_SECTION = sectionId({ kind: 'assets' });
const STAGE_ORDER_SECTION = sectionId({ kind: 'stageOrder' });

/**
 * The staged resources of one editing session, and the gateway the session
 * hands to its editors.
 *
 * Staging lives for the edit session, so something has to know what is staged:
 * finish promotes exactly the staged resources the draft still references,
 * discards the rest, and validation counts staged ids as resolvable. Editors
 * call the gateway directly — they never report back — so the session learns
 * what is staged by being the gateway they call.
 */
export type StagedResourceTracker = Readonly<{
  /** The session-scoped gateway; the one the shell provides to editors. */
  gateway: ProtocolBuilderResourceGateway;
  /** Descriptors only, in staging order. Never secret material. */
  staged(): readonly ResourceDescriptor[];
  /** The opaque handle for a staged secret, for promotion. */
  secretHandle(resourceId: string): StagedSecretHandle | undefined;
  /**
   * Resources this session promoted whose manifest entry has not reached the
   * session's authoritative sections yet.
   *
   * The promotion committed them, but the host publishes the new revision
   * separately, and in between an editor left open would otherwise start
   * reporting the resource it has just saved as one the protocol does not
   * have. Entries the given manifest already carries are dropped, so this
   * empties itself as the authoritative sections catch up.
   */
  promotedAwaitingManifest(
    manifestSection: SectionDoc | undefined,
  ): readonly ResourceDescriptor[];
}>;

export type StagedResourceTrackerOptions = Readonly<{
  /** The host's gateway. Every call is forwarded to it. */
  gateway: ProtocolBuilderResourceGateway;
  /**
   * Whether the session may still change the protocol. Staging and promotion
   * are refused while it may not; discarding is not, because a session that
   * lost its lease keeps its staged work until the host or researcher drops it.
   */
  isEditable(): boolean;
  /** Called after every change to the staged set. */
  onStagedChanged(): void;
}>;

export function createStagedResourceTracker(
  options: StagedResourceTrackerOptions,
): StagedResourceTracker {
  type Entry = Readonly<{
    descriptor: ResourceDescriptor;
    handle?: StagedSecretHandle;
    promoted: boolean;
  }>;
  const entries = new Map<string, Entry>();
  const host = options.gateway;

  const remember = (
    descriptor: ResourceDescriptor,
    handle?: StagedSecretHandle,
  ): void => {
    entries.set(descriptor.id, {
      descriptor,
      ...(handle === undefined ? {} : { handle }),
      promoted: false,
    });
    options.onStagedChanged();
  };

  const forget = (resourceIds: Iterable<string>): void => {
    let changed = false;
    for (const resourceId of resourceIds) {
      changed = entries.delete(resourceId) || changed;
    }
    if (changed) options.onStagedChanged();
  };

  // A promoted resource stops being staged but stays known, so it goes on
  // resolving until the host's new revision carries its manifest entry.
  const markPromoted = (resourceIds: Iterable<string>): void => {
    let changed = false;
    for (const resourceId of resourceIds) {
      const entry = entries.get(resourceId);
      if (entry === undefined || entry.promoted) continue;
      entries.set(resourceId, { ...entry, promoted: true });
      changed = true;
    }
    if (changed) options.onStagedChanged();
  };

  const gateway: ProtocolBuilderResourceGateway = {
    list: (listOptions?: ResourceListOptions) => host.list(listOptions),
    inspect: (resourceId: string) => host.inspect(resourceId),
    download: (resourceId: string) => host.download(resourceId),
    resolvePreview: (resourceId: string) => host.resolvePreview(resourceId),

    async stageUpload(
      request: StageUploadRequest,
    ): Promise<ResourceResult<ResourceDescriptor>> {
      if (!options.isEditable()) return readOnlyFailure();
      const result = await host.stageUpload(request);
      if (result.status === 'ok') remember(result.data);
      return result;
    },

    async stageSecret(
      request: StageSecretRequest,
    ): Promise<ResourceResult<StagedSecret>> {
      if (!options.isEditable()) return readOnlyFailure();
      const result = await host.stageSecret(request);
      if (result.status === 'ok') {
        remember(result.data.descriptor, result.data.handle);
      }
      return result;
    },

    async discardStaged(
      resourceId: string,
    ): Promise<ResourceResult<undefined>> {
      const result = await host.discardStaged(resourceId);
      if (result.status === 'ok') forget([resourceId]);
      return result;
    },

    async discardAllStaged(): Promise<ResourceResult<undefined>> {
      const result = await host.discardAllStaged();
      if (result.status === 'ok') {
        forget(
          [...entries.values()]
            .filter((entry) => !entry.promoted)
            .map((entry) => entry.descriptor.id),
        );
      }
      return result;
    },

    async promote(
      request: ResourcePromotionRequest,
    ): Promise<ResourceResult<ResourcePromotion>> {
      if (!options.isEditable()) return readOnlyFailure();
      const result = await host.promote(request);
      if (result.status === 'ok') {
        markPromoted(result.data.promoted.map((descriptor) => descriptor.id));
      }
      return result;
    },
  };

  return Object.freeze({
    gateway,
    staged: () =>
      Object.freeze(
        [...entries.values()]
          .filter((entry) => !entry.promoted)
          .map((entry) => entry.descriptor),
      ),
    secretHandle: (resourceId: string) => entries.get(resourceId)?.handle,
    promotedAwaitingManifest: (manifestSection: SectionDoc | undefined) => {
      const awaiting: ResourceDescriptor[] = [];
      // Deleting the entry the loop is standing on is safe for a Map iterator.
      for (const entry of entries.values()) {
        if (!entry.promoted) continue;
        if (
          manifestSection !== undefined &&
          Object.hasOwn(manifestSection, entry.descriptor.id)
        ) {
          entries.delete(entry.descriptor.id);
          continue;
        }
        awaiting.push(entry.descriptor);
      }
      return Object.freeze(awaiting);
    },
  });
}

/** What finish does with each staged resource, decided from the draft alone. */
export type StagedResourceFinishPlan = Readonly<{
  /** Staged ids the draft still references; promoted with the stage. */
  promote: readonly string[];
  /** Staged ids the draft no longer references; discarded on finish. */
  discard: readonly string[];
}>;

export function planStagedResourceFinish(
  stageDocument: SectionDoc,
  staged: readonly ResourceDescriptor[],
): StagedResourceFinishPlan {
  const referenced = new Set(
    collectStageResourceReferences(stageDocument).map(
      (reference) => reference.resourceId,
    ),
  );
  const promote: string[] = [];
  const discard: string[] = [];
  for (const descriptor of staged) {
    if (referenced.has(descriptor.id)) promote.push(descriptor.id);
    else discard.push(descriptor.id);
  }
  return Object.freeze({
    promote: Object.freeze(promote),
    discard: Object.freeze(discard),
  });
}

export type StagedResourceFinishOutcome =
  | Readonly<{
      status: 'finished';
      promoted: readonly ResourceDescriptor[];
      discarded: readonly string[];
    }>
  /** The caller's own apply failed; nothing was promoted. Rethrow `error`. */
  | Readonly<{ status: 'apply-failed'; error: unknown }>
  /** The gateway rolled its promotion back; nothing was committed. */
  | Readonly<{ status: 'promotion-failed'; failure: ResourceGatewayFailure }>;

export type StagedResourceFinishOptions = Readonly<{
  gateway: ProtocolBuilderResourceGateway;
  /**
   * Stable across a retried finish, and NOT reused once a finish has
   * succeeded: a gateway returns an already-succeeded promotion without
   * promoting or applying anything again.
   */
  promotionId: string;
  /** The draft being finished, including its session-owned id and type. */
  stageDocument: SectionDoc;
  staged: readonly ResourceDescriptor[];
  secretHandle(resourceId: string): StagedSecretHandle | undefined;
  /**
   * Applies the stage's own edits atomically. When resources are promoted it
   * is called with their manifest commands, which must be applied in the same
   * revision; it must throw if that apply does not succeed, so the gateway
   * rolls the bytes back instead of leaving them without their manifest.
   */
  applyStage(manifest?: ManifestApplyRequest): Promise<void>;
}>;

/**
 * The finish half of the staging lifetime: promote what the draft still
 * references, apply the stage and the manifest as one revision, then drop the
 * staged resources the draft walked away from.
 *
 * Bytes and manifest travel together because the manifest apply happens
 * *inside* the promotion: a gateway that cannot complete the caller's apply
 * undoes its own moves and reports a retryable failure, leaving staging intact
 * for a retry.
 */
export async function finishStagedResources(
  options: StagedResourceFinishOptions,
): Promise<StagedResourceFinishOutcome> {
  const plan = planStagedResourceFinish(options.stageDocument, options.staged);

  if (plan.promote.length === 0) {
    try {
      await options.applyStage();
    } catch (error: unknown) {
      return Object.freeze({ status: 'apply-failed' as const, error });
    }
    return Object.freeze({
      status: 'finished' as const,
      promoted: Object.freeze([]),
      discarded: await discardEach(options.gateway, plan.discard),
    });
  }

  const secretHandles = plan.promote.flatMap((resourceId) => {
    const handle = options.secretHandle(resourceId);
    return handle === undefined ? [] : [handle];
  });

  let applyError: Readonly<{ error: unknown }> | undefined;
  const result = await options.gateway.promote({
    id: options.promotionId,
    resourceIds: plan.promote,
    ...(secretHandles.length === 0 ? {} : { secretHandles }),
    applyManifest: async (manifest: ManifestApplyRequest) => {
      try {
        await options.applyStage(manifest);
        return Object.freeze({ status: 'applied' as const });
      } catch (error: unknown) {
        applyError = Object.freeze({ error });
        return Object.freeze({
          status: 'failed' as const,
          retryable: true,
          // Deliberately generic: the caller's own error is reported by the
          // caller, and this message reaches the gateway's failure path.
          message: 'the stage could not be saved with its resources',
        });
      }
    },
  });

  if (applyError !== undefined) {
    return Object.freeze({
      status: 'apply-failed' as const,
      error: applyError.error,
    });
  }
  if (result.status === 'failed') {
    return Object.freeze({
      status: 'promotion-failed' as const,
      failure: result.failure,
    });
  }
  return Object.freeze({
    status: 'finished' as const,
    promoted: result.data.promoted,
    discarded: await discardEach(options.gateway, plan.discard),
  });
}

/**
 * The `assets` section a draft is validated against: the committed manifest
 * plus one provisional entry per staged resource.
 *
 * The canonical protocol schema resolves every resource reference against the
 * manifest, so without these a draft would be invalid for exactly as long as
 * its resource is staged — which is the whole edit session. The entries are
 * what promotion will write, with one exception: a staged secret's value is
 * not the editor's to know, so its provisional entry carries the opaque handle
 * instead, and the host substitutes the real value at promotion.
 *
 * A staged content resource with no filename gets no entry: the manifest
 * cannot record it, so the draft that references it is genuinely not
 * committable, and the schema says so.
 */
export function assetsSectionForValidation(
  committed: SectionDoc | undefined,
  staged: readonly ResourceDescriptor[],
  secretHandle: (resourceId: string) => StagedSecretHandle | undefined,
): SectionDoc {
  const section: SectionDoc = { ...committed };
  for (const descriptor of staged) {
    if (descriptor.kind === 'apikey') {
      const handle = secretHandle(descriptor.id);
      if (handle === undefined) continue;
      section[descriptor.id] = {
        type: 'apikey',
        id: descriptor.id,
        name: descriptor.name,
        value: handle,
      };
      continue;
    }
    if (descriptor.source === undefined) continue;
    section[descriptor.id] = {
      type: descriptor.kind,
      id: descriptor.id,
      name: descriptor.name,
      source: descriptor.source,
    };
  }
  return section;
}

/**
 * Where the edited stage sits in the canonical protocol, so a resource problem
 * lands on the same path the schema would have used and is attributed to the
 * stage that owns it. A stage the order does not list yet is treated as
 * appended, which is where a host assembling a candidate puts it.
 */
export function stageIndexForValidation(
  protocolSections: Readonly<Record<string, SectionDoc>>,
  stageId: string,
): number {
  const order = protocolSections[STAGE_ORDER_SECTION]?.stages;
  if (!Array.isArray(order)) return 0;
  const index = order.indexOf(stageId);
  return index === -1 ? order.length : index;
}

export type DraftResourceIssueOptions = Readonly<{
  stageDocument: SectionDoc;
  /** Authoritative sections; the committed manifest is read from them. */
  protocolSections: Readonly<Record<string, SectionDoc>>;
  stagedResourceIds: Iterable<string>;
  stageIndex: number;
}>;

/**
 * Resource problems in the draft, on canonical protocol paths: a field naming
 * a resource that is neither committed nor staged, or one whose committed
 * manifest entry the schema rejects.
 *
 * Reported with the draft's other validation rather than thrown, because a
 * researcher reaches this state by ordinary editing — discarding a resource
 * something still uses, or opening a protocol whose manifest lost an entry.
 */
export function draftResourceIssues(
  options: DraftResourceIssueOptions,
): readonly DanglingResourceReference[] {
  const manifestSection = options.protocolSections[ASSETS_SECTION];
  return findDanglingResourceReferences({
    stageDocument: options.stageDocument,
    ...(manifestSection === undefined ? {} : { manifestSection }),
    stagedResourceIds: options.stagedResourceIds,
    pathPrefix: ['stages', options.stageIndex],
  });
}

/**
 * The draft's validation problems, with a resource problem dropped wherever
 * the schema already reported one for the same field: two messages about one
 * value read as two faults, and the schema's is the one naming the rule.
 */
export function mergeDraftValidationIssues(
  schemaIssues: readonly ProtocolValidationIssue[],
  resourceIssues: readonly ProtocolValidationIssue[],
): readonly ProtocolValidationIssue[] {
  const covered = new Set(schemaIssues.map((issue) => pathKey(issue.path)));
  return Object.freeze([
    ...schemaIssues,
    ...resourceIssues.filter((issue) => !covered.has(pathKey(issue.path))),
  ]);
}

async function discardEach(
  gateway: ProtocolBuilderResourceGateway,
  resourceIds: readonly string[],
): Promise<readonly string[]> {
  const discarded: string[] = [];
  for (const resourceId of resourceIds) {
    const result = await gateway.discardStaged(resourceId);
    if (result.status === 'ok') discarded.push(resourceId);
  }
  return Object.freeze(discarded);
}

function pathKey(path: readonly (string | number)[]): string {
  return JSON.stringify(path);
}

function readOnlyFailure<T>(): ResourceResult<T> {
  return resourceFailure(
    'read-only',
    'this protocol is open for viewing only, so its resources cannot change',
  );
}
