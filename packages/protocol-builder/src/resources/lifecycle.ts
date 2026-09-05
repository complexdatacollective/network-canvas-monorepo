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
  /**
   * Ends this session's staging and discards everything it staged.
   *
   * Staging that is still in flight is covered: an upload or a secret that
   * lands after this is discarded at the host instead of being registered,
   * because the call that started it belongs to a session that is over and
   * nothing else would ever drop it.
   *
   * Refused while a promotion is in flight, because that promotion's manifest
   * apply is mid-way through committing exactly these resources: discarding
   * them now would leave the committed stage pointing at bytes this session
   * threw away.
   */
  cancel(): Promise<ResourceResult<undefined>>;
  /**
   * Closes this session's staging window and returns what the finish that is
   * starting has to decide — the same instant, on purpose.
   *
   * A finish promotes or discards exactly the resources it can see when it
   * plans, so an upload or secret still in flight at that point is decided by
   * nothing: keeping it would leave the host holding staging this session has
   * already walked away from and will never look at again. Closing the window
   * here rather than when the finish returns is what makes the plan complete —
   * a result that lands while the promotion is in flight is discarded at the
   * host, exactly as one landing after a cancel is. Staging started after this
   * belongs to the next edit and is kept as usual.
   */
  finishing(): readonly ResourceDescriptor[];
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
  /** Ids of a promotion that is in flight; they cannot be discarded. */
  const promoting = new Set<string>();
  /** True once the session cancelled: nothing staged after it is kept. */
  let cancelled = false;
  /**
   * Bumped whenever this session stops staging (a cancel, or a finish that has
   * already chosen what it promotes). A staging call captures it before its
   * await, so a result that lands into a later window can be told apart from
   * one the session is still waiting for.
   */
  let stagingWindow = 0;

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

  /**
   * Registers what the host staged, unless this session stopped staging while
   * the call was in flight. Nothing else would ever drop such a resource — the
   * finish that ran promoted the resources it knew about, and a cancelled
   * session discards once — so it is dropped at the host here.
   *
   * Returns the failure the staging call must report, or `undefined` when the
   * resource was kept. A host that refused the drop is reported as it
   * answered: the resource really is still there, so saying it was not kept
   * would be untrue, and a retryable failure is what the picker can act on.
   *
   * A refused drop is also tracked, because the host is still holding it and
   * nothing else knows its id: the editor was handed a failure rather than a
   * descriptor, so a session that dropped it here would leave the host with a
   * resource no later cancel, finish, or host cleanup could name.
   */
  const keepStagedResult = async (
    stagedDuring: number,
    subject: 'file' | 'secret',
    descriptor: ResourceDescriptor,
    handle?: StagedSecretHandle,
  ): Promise<ResourceResult<never> | undefined> => {
    if (!cancelled && stagedDuring === stagingWindow) {
      remember(descriptor, handle);
      return undefined;
    }
    const discarded = await host.discardStaged(descriptor.id);
    if (discarded.status === 'ok') {
      return stagingEndedFailure(descriptor.id, subject);
    }
    remember(descriptor, handle);
    return discarded;
  };

  const forget = (resourceIds: Iterable<string>): void => {
    let changed = false;
    for (const resourceId of resourceIds) {
      changed = entries.delete(resourceId) || changed;
    }
    if (changed) options.onStagedChanged();
  };

  // A promoted resource is no longer staging, so a discard-everything leaves it
  // alone: it is committed, and the session goes on resolving it until the
  // host's revision carries its manifest entry.
  const forgetAllStaged = (): void => {
    forget(
      [...entries.values()]
        .filter((entry) => !entry.promoted)
        .map((entry) => entry.descriptor.id),
    );
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
      const stagedDuring = stagingWindow;
      const result = await host.stageUpload(request);
      if (result.status !== 'ok') return result;
      return (
        (await keepStagedResult(stagedDuring, 'file', result.data)) ?? result
      );
    },

    async stageSecret(
      request: StageSecretRequest,
    ): Promise<ResourceResult<StagedSecret>> {
      if (!options.isEditable()) return readOnlyFailure();
      const stagedDuring = stagingWindow;
      const result = await host.stageSecret(request);
      if (result.status !== 'ok') return result;
      return (
        (await keepStagedResult(
          stagedDuring,
          'secret',
          result.data.descriptor,
          result.data.handle,
        )) ?? result
      );
    },

    async discardStaged(
      resourceId: string,
    ): Promise<ResourceResult<undefined>> {
      if (promoting.has(resourceId)) {
        return promotionInFlightFailure(resourceId);
      }
      const result = await host.discardStaged(resourceId);
      if (result.status === 'ok') forget([resourceId]);
      return result;
    },

    async discardAllStaged(): Promise<ResourceResult<undefined>> {
      if (promoting.size > 0) return promotionInFlightFailure();
      const result = await host.discardAllStaged();
      if (result.status === 'ok') forgetAllStaged();
      return result;
    },

    async promote(
      request: ResourcePromotionRequest,
    ): Promise<ResourceResult<ResourcePromotion>> {
      if (!options.isEditable()) return readOnlyFailure();
      // Held for exactly as long as the promotion is undecided, so a discard
      // arriving from the manifest apply — an editor cancelling mid-save — is
      // refused rather than deleting a resource the apply is committing.
      for (const resourceId of request.resourceIds) promoting.add(resourceId);
      try {
        const result = await host.promote(request);
        if (result.status === 'ok') {
          markPromoted(result.data.promoted.map((descriptor) => descriptor.id));
        }
        return result;
      } finally {
        for (const resourceId of request.resourceIds) {
          promoting.delete(resourceId);
        }
      }
    },
  };

  const stagedNow = (): readonly ResourceDescriptor[] =>
    Object.freeze(
      [...entries.values()]
        .filter((entry) => !entry.promoted)
        .map((entry) => entry.descriptor),
    );

  return Object.freeze({
    gateway,
    cancel: async (): Promise<ResourceResult<undefined>> => {
      if (promoting.size > 0) return promotionInFlightFailure();
      // Set before the discard is awaited: staging that lands while the host
      // is clearing up belongs to a session that is already over.
      cancelled = true;
      stagingWindow += 1;
      const result = await host.discardAllStaged();
      if (result.status === 'ok') forgetAllStaged();
      return result;
    },
    finishing: () => {
      // Read before the bump and returned together with it, so there is no
      // moment in which a caller holds the plan while the window is still open.
      const staged = stagedNow();
      stagingWindow += 1;
      return staged;
    },
    staged: stagedNow,
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

/**
 * A staged resource the finish walked away from and could not drop.
 *
 * The stage itself is committed, so this is not a failed finish — but the host
 * is still holding the bytes or the secret, and the resource is still staged
 * here. Reported so the host can retry or clear it up rather than being told
 * a cleanup happened that did not.
 */
export type StagedResourceDiscardFailure = Readonly<{
  resourceId: string;
  failure: ResourceGatewayFailure;
}>;

export type StagedResourceFinishOutcome =
  | Readonly<{
      status: 'finished';
      promoted: readonly ResourceDescriptor[];
      discarded: readonly string[];
      /** Abandoned resources the host would not drop. Usually empty. */
      discardFailures: readonly StagedResourceDiscardFailure[];
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
    const cleanup = await discardEach(options.gateway, plan.discard);
    return Object.freeze({
      status: 'finished' as const,
      promoted: Object.freeze([]),
      ...cleanup,
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
  const cleanup = await discardEach(options.gateway, plan.discard);
  return Object.freeze({
    status: 'finished' as const,
    promoted: result.data.promoted,
    ...cleanup,
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

/**
 * Drops each abandoned resource, and says which ones the host would not drop:
 * a failure here leaves the resource staged, and a finish that reported only
 * what it managed to discard would look like a clean one.
 */
async function discardEach(
  gateway: ProtocolBuilderResourceGateway,
  resourceIds: readonly string[],
): Promise<
  Readonly<{
    discarded: readonly string[];
    discardFailures: readonly StagedResourceDiscardFailure[];
  }>
> {
  const discarded: string[] = [];
  const discardFailures: StagedResourceDiscardFailure[] = [];
  for (const resourceId of resourceIds) {
    const result = await gateway.discardStaged(resourceId);
    if (result.status === 'ok') discarded.push(resourceId);
    else
      discardFailures.push(
        Object.freeze({ resourceId, failure: result.failure }),
      );
  }
  return Object.freeze({
    discarded: Object.freeze(discarded),
    discardFailures: Object.freeze(discardFailures),
  });
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

/**
 * A discard refused because the resources are mid-promotion. Retryable, and
 * true to what the researcher can do: once the save settles, an unwanted
 * resource can be discarded like any other.
 */
function promotionInFlightFailure<T>(resourceId?: string): ResourceResult<T> {
  return resourceFailure(
    'unavailable',
    'these resources are being saved right now, so they cannot be discarded until the save finishes',
    resourceId === undefined ? {} : { resourceId },
  );
}

/**
 * What a staging call gets when its own session stopped staging before the
 * result arrived: the resource was discarded at the host, so the id it names
 * really does resolve to nothing.
 */
function stagingEndedFailure<T>(
  resourceId: string,
  subject: 'file' | 'secret',
): ResourceResult<T> {
  return resourceFailure(
    'not-found',
    `this editing session ended before the ${subject} finished staging, so it was not kept`,
    { resourceId },
  );
}
