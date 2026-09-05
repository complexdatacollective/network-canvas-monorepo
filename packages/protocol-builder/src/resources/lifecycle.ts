import type { ProtocolValidationIssue } from '@codaco/protocol-validation';
import { canonicalize, type SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  resourceFailure,
  resourceOk,
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
import { callGateway, resultChannelGateway } from './gatewayCall.ts';
import {
  collectStageResourceReferences,
  findDanglingResourceReferences,
  type DanglingResourceReference,
} from './references.ts';

const ASSETS_SECTION = sectionId({ kind: 'assets' });
const STAGE_ORDER_SECTION = sectionId({ kind: 'stageOrder' });

/**
 * The one decision a session's gateway makes that a host's cannot: whether a
 * field may come to name a staged resource right now.
 *
 * **A staged resource stops accepting references from the moment its discard
 * is asked for.** Discarding is asynchronous, so the "is anything else using
 * this?" a picker asks before it discards is a fact about the past: a second
 * field choosing the same resource from the browser while the first field's
 * discard is in flight arrives after that question and before the host has
 * answered, and neither side would ever notice. The discard therefore marks
 * the resource as leaving before it asks the host, and a reference taken while
 * it is leaving is refused — so at every instant exactly one of the two can
 * happen, and a field can never end up naming bytes the host is deleting.
 *
 * The count of references belongs to the form rather than here — a field's
 * value reaches the session only on submit — so the picker still decides
 * whether a discard is allowed at all. This decides only the order.
 */
export type StagedResourceReferenceGuard = Readonly<{
  /**
   * Ok when a field may name this resource; a failure to show the researcher
   * when it may not. Anything this session is not discarding is ok, including
   * every committed resource, which it knows nothing about.
   */
  referenceStaged(resourceId: string): ResourceResult<undefined>;
}>;

/** The host's port plus the staging decisions only a session can make. */
export type SessionResourceGateway = ProtocolBuilderResourceGateway &
  StagedResourceReferenceGuard;

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
  gateway: SessionResourceGateway;
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
   * Ends this session's staging and discards everything it staged, except what
   * a promotion left in doubt.
   *
   * Staging that is still in flight is covered: an upload or a secret that
   * lands after this is discarded at the host instead of being registered,
   * because the call that started it belongs to a session that is over and
   * nothing else would ever drop it.
   *
   * Refused while a finish holds the session, because that finish is mid-way
   * through deciding — and then committing — exactly these resources:
   * discarding them now would leave the committed stage pointing at bytes this
   * session threw away, and would report a cancel that had not happened.
   *
   * A resource whose promotion ended without saying what it did is kept and
   * reported rather than discarded: see {@link StagedResourceCancelReport}.
   */
  cancel(): Promise<ResourceResult<StagedResourceCancelReport>>;
  /**
   * Takes the session for one finish: closes the staging window and returns
   * what the finish has to decide — the same instant, on purpose.
   *
   * A finish promotes or discards exactly the resources it can see when it
   * plans, so an upload or secret still in flight at that point is decided by
   * nothing: keeping it would leave the host holding staging this session has
   * already walked away from and will never look at again. Closing the window
   * here rather than when the finish returns is what makes the plan complete —
   * a result that lands while the promotion is in flight is discarded at the
   * host, exactly as one landing after a cancel is. Staging started after this
   * belongs to the next edit and is kept as usual.
   *
   * The hold is what makes a finish and a cancel one decision rather than two
   * that overlap. Only one of them can be under way, so whichever asks second
   * is refused and told so; the alternative is a cancel that reports success
   * while the finish it raced goes on to commit the very resources the cancel
   * said it had discarded. Refused, too, once the session has cancelled: there
   * is nothing left to commit and the discard may still be running.
   */
  finishing(): ResourceResult<StagedResourceFinishHold>;
}>;

/**
 * What a cancel did about the resources it could not simply discard.
 *
 * A promotion that ends without saying whether it committed leaves its
 * resources in one state the session cannot tell apart from the other: the
 * host may hold them as committed protocol assets, or may hold nothing at all.
 * Discarding them would delete work the protocol has already taken, and
 * reporting them as discarded would be reporting something that did not
 * happen — so the cancel does neither, and says which resources those are. The
 * way to settle it is to finish again: the promotion id is stable, so a host
 * that really did promote hands that promotion back.
 */
export type StagedResourceCancelReport = Readonly<{
  /** Descriptors the cancel deliberately left with the host. Usually empty. */
  keptUnreconciled: readonly ResourceDescriptor[];
}>;

/**
 * One finish's hold on a session's staging, and the resources it decides.
 *
 * {@link settle} must run however the finish ends — including when it throws —
 * or the session can never be cancelled again. Releasing it is safe even for a
 * finish whose promotion was never decided: what a cancel may then discard is
 * fenced by the promotion's own outcome rather than by this hold, which is
 * about one finish being under way at a time.
 */
export type StagedResourceFinishHold = Readonly<{
  /** Descriptors only, as the staging window closed on them. */
  staged: readonly ResourceDescriptor[];
  /** Releases the hold, so a cancel or another finish may take it. */
  settle: () => void;
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
  // Where the host's adapter enters the package, and so the one place its
  // contract is made true: everything below — and every editor handed the
  // gateway this returns — is written for a result, and an adapter that throws
  // instead would escape whichever call it was in rather than be reported.
  const host = resultChannelGateway(options.gateway);
  /** Ids of a promotion that is in flight; they cannot be discarded. */
  const promoting = new Set<string>();
  /**
   * Ids whose promotion ended without saying what it did, against the id of
   * the promotion that left them that way.
   *
   * **A resource a promotion did not decide is never discarded.** A retryable
   * promotion failure is the one answer that means both things at once: the
   * host rolled back and holds the resource still, or the host committed it
   * and lost only its reply. Nothing here can tell those apart, and the two
   * call for opposite actions — so a discard of any kind refuses the resource
   * until something settles it, and a cancel keeps it and says so. Only a
   * promotion answering decisively settles it: `ok` means the host has it, and
   * a refusal under the SAME promotion id means the host never took it, since
   * a host that had would answer that id with the promotion it already made.
   */
  const unreconciled = new Map<string, string>();
  /**
   * Ids a discard is deciding right now. They take no new references: see
   * {@link StagedResourceReferenceGuard} for the rule and what it is for.
   */
  const leaving = new Set<string>();
  /** True once the session cancelled: nothing staged after it is kept. */
  let cancelled = false;
  /**
   * True while a finish holds the session — from the moment it reads its plan
   * to the moment it has promoted, applied, and cleaned up.
   *
   * The whole finish is guarded rather than only its promotion: the inspection
   * that decides whether the resources may be committed at all runs before any
   * promotion starts, and a cancel slipping in there would discard the bytes
   * the finish is about to commit while reporting that the session was
   * cleanly abandoned.
   */
  let finishInFlight = false;
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

  const gateway: SessionResourceGateway = {
    secretStorage: host.secretStorage,
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
        return saveInFlightFailure(resourceId);
      }
      if (unreconciled.has(resourceId)) {
        return promotionUndecidedFailure(resourceId);
      }
      // Marked before the host is asked, and unmarked however it answers: a
      // discard the host refused leaves the resource staged and choosable
      // again, and one it carried out has already been forgotten, so the mark
      // has nothing left to protect either way.
      leaving.add(resourceId);
      try {
        const result = await host.discardStaged(resourceId);
        if (result.status === 'ok') forget([resourceId]);
        return result;
      } finally {
        leaving.delete(resourceId);
      }
    },

    async discardAllStaged(): Promise<ResourceResult<undefined>> {
      if (promoting.size > 0) return saveInFlightFailure();
      // Nothing here can spare one resource from a discard of everything, so
      // an undecided promotion refuses the whole call rather than sweeping the
      // resource it may already have committed away with the rest.
      if (unreconciled.size > 0) return promotionUndecidedFailure();
      const all = [...entries.keys()];
      for (const resourceId of all) leaving.add(resourceId);
      try {
        const result = await host.discardAllStaged();
        if (result.status === 'ok') forgetAllStaged();
        return result;
      } finally {
        for (const resourceId of all) leaving.delete(resourceId);
      }
    },

    async promote(
      request: ResourcePromotionRequest,
    ): Promise<ResourceResult<ResourcePromotion>> {
      if (!options.isEditable()) return readOnlyFailure();
      // Nothing this session staged survives its cancel, so committing any of
      // it afterwards would publish a manifest entry for bytes the host has
      // been told to drop — the exact outcome a successful cancel promised
      // could not happen. Checked here as well as through the finish's hold,
      // because the gateway is handed to editors that call it directly.
      if (cancelled) return sessionCancelledFailure();
      // Held for exactly as long as the promotion is undecided, so a discard
      // arriving from the manifest apply — an editor cancelling mid-save — is
      // refused rather than deleting a resource the apply is committing.
      for (const resourceId of request.resourceIds) promoting.add(resourceId);
      try {
        const result = await host.promote(request);
        // Where the doubt is created and where it is settled, because this is
        // the only place a promotion's outcome is seen. See `unreconciled`.
        if (result.status === 'ok') {
          markPromoted(result.data.promoted.map((descriptor) => descriptor.id));
          for (const resourceId of request.resourceIds) {
            unreconciled.delete(resourceId);
          }
        } else if (result.failure.retryable) {
          for (const resourceId of request.resourceIds) {
            unreconciled.set(resourceId, request.id);
          }
        } else {
          for (const resourceId of request.resourceIds) {
            // Only this promotion's own doubt: a refusal of a promotion the
            // researcher started after editing the draft — a different id —
            // says nothing about whether the earlier one committed.
            if (unreconciled.get(resourceId) === request.id) {
              unreconciled.delete(resourceId);
            }
          }
        }
        return result;
      } finally {
        for (const resourceId of request.resourceIds) {
          promoting.delete(resourceId);
        }
      }
    },

    referenceStaged: (resourceId: string): ResourceResult<undefined> => {
      // A cancelled session has told the host to drop everything it staged,
      // so every staged id in it is on its way out whether or not one
      // particular discard is still running.
      if (cancelled) return sessionCancelledFailure();
      if (leaving.has(resourceId)) return resourceLeavingFailure(resourceId);
      return resourceOk(undefined);
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
    cancel: async (): Promise<ResourceResult<StagedResourceCancelReport>> => {
      // A finish that has started is the one deciding these resources, and it
      // decides them to the end: reporting a clean cancel here would be
      // reporting something the finish is in the middle of undoing.
      if (finishInFlight || promoting.size > 0) return saveInFlightFailure();
      // Set before the discard is awaited: staging that lands while the host
      // is clearing up belongs to a session that is already over.
      cancelled = true;
      stagingWindow += 1;
      const kept = [...entries.values()]
        .filter(
          (entry) => !entry.promoted && unreconciled.has(entry.descriptor.id),
        )
        .map((entry) => entry.descriptor);
      if (kept.length === 0) {
        const result = await host.discardAllStaged();
        if (result.status !== 'ok') return result;
        forgetAllStaged();
        return resourceOk(
          Object.freeze({ keptUnreconciled: Object.freeze([]) }),
        );
      }
      // One at a time, because `discardAllStaged` cannot spare the resources
      // above. Everything else this session staged goes exactly as it would
      // have; a host that refuses one of them is reported as a failed cancel,
      // because that resource really is still there.
      for (const entry of entries.values()) {
        if (entry.promoted || unreconciled.has(entry.descriptor.id)) continue;
        const result = await host.discardStaged(entry.descriptor.id);
        if (result.status !== 'ok') return result;
        forget([entry.descriptor.id]);
      }
      return resourceOk(
        Object.freeze({ keptUnreconciled: Object.freeze(kept) }),
      );
    },
    finishing: (): ResourceResult<StagedResourceFinishHold> => {
      // A cancel sets this before it awaits its discard, so a finish starting
      // while that discard is still running is refused rather than planning to
      // promote resources the host is being told to drop.
      if (cancelled) return sessionCancelledFailure();
      if (finishInFlight || promoting.size > 0) return saveInFlightFailure();
      finishInFlight = true;
      // Read before the bump and returned together with it, so there is no
      // moment in which a caller holds the plan while the window is still open.
      const staged = stagedNow();
      stagingWindow += 1;
      let settled = false;
      return resourceOk(
        Object.freeze({
          staged,
          settle: () => {
            // Idempotent, so a caller that settles on both a normal and an
            // error path cannot release a hold a later finish has taken.
            if (settled) return;
            settled = true;
            finishInFlight = false;
          },
        }),
      );
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
 * Everything one finish would commit, as a string that changes when it does.
 *
 * A promotion key names a specific commit rather than "the finish that is
 * being retried", because that is what an idempotent host replays under it:
 * asked twice under one key, it hands back the promotion it already made and
 * never calls `applyManifest` again. So the key has to cover both halves of
 * what that call would have carried — the stage document being applied, and
 * the staged resources being promoted — and a finish whose content differs
 * from the last attempt's is a different commit that must ask for itself.
 *
 * Only the resources the plan actually promotes are counted, not everything
 * staged: a resource staged between two attempts that the draft does not
 * reference changes nothing about the promotion, and rotating the key for it
 * would throw away the very retry an uncertain first attempt needs.
 *
 * Compared rather than hashed, so two finishes can only share a key by being
 * character-for-character the same commit.
 */
export function promotionContent(
  stageDocument: SectionDoc,
  staged: readonly ResourceDescriptor[],
): string {
  return canonicalize({
    stage: stageDocument,
    promote: planStagedResourceFinish(stageDocument, staged).promote,
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
  /**
   * The draft references staged resources the host will not vouch for, so
   * nothing was promoted, applied, or discarded. Report `issues` to the
   * researcher as the draft's own validation problems.
   */
  | Readonly<{
      status: 'unreadable-resources';
      issues: readonly DanglingResourceReference[];
    }>
  /** The caller's own apply failed; nothing was promoted. Rethrow `error`. */
  | Readonly<{ status: 'apply-failed'; error: unknown }>
  /** The gateway rolled its promotion back; nothing was committed. */
  | Readonly<{ status: 'promotion-failed'; failure: ResourceGatewayFailure }>;

export type StagedResourceFinishOptions = Readonly<{
  gateway: ProtocolBuilderResourceGateway;
  /**
   * The key this finish's content is promoted under: stable across a retry of
   * the identical finish, and never reused for a different one. A gateway
   * returns an already-succeeded promotion without promoting or applying
   * anything again, so a caller that carries one id across two different
   * finishes is told the second one succeeded when none of it was committed.
   * Derive it from {@link promotionContent}, which says what "different" means
   * here.
   */
  promotionId: string;
  /** The draft being finished, including its session-owned id and type. */
  stageDocument: SectionDoc;
  /**
   * Where the stage sits in the canonical protocol, from
   * {@link stageIndexForValidation}, so a resource this finish refuses is
   * reported on the same path the schema would have used for the same field.
   */
  stageIndex: number;
  /**
   * What this finish decides, from {@link StagedResourceTracker.finishing}'s
   * hold. The caller keeps that hold for as long as this call runs, so no
   * cancel can discard these resources while the finish is committing them.
   */
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
 *
 * Nothing is promoted until the host has read every resource being promoted.
 * Staging only says the host is holding bytes; whether they are usable as the
 * kind the manifest is about to claim is something only the host can say, and
 * a committed stage pointing at an unreadable roster is a protocol that fails
 * when the interview loads it — with a manifest entry that looks perfectly
 * valid. So the finish asks, and refuses rather than committing.
 */
export async function finishStagedResources(
  options: StagedResourceFinishOptions,
): Promise<StagedResourceFinishOutcome> {
  const plan = planStagedResourceFinish(options.stageDocument, options.staged);

  const unreadable = await unreadableResourceIssues(options, plan.promote);
  if (unreadable.length > 0) {
    return Object.freeze({
      status: 'unreadable-resources' as const,
      issues: unreadable,
    });
  }

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
  // A gateway that throws is reported as a rolled-back promotion rather than
  // as an exception, because that is the outcome the caller can act on: the
  // promotion id makes finishing again safe, and a gateway that had in fact
  // committed answers the repeat with the same promotion.
  const result = await callGateway(() =>
    options.gateway.promote({
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
    }),
  );

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
 * The resources a finish is about to promote that the host will not vouch for,
 * as validation problems on the fields that name them.
 *
 * Every failed inspection counts, not only `invalid-content`: this is the last
 * moment before the protocol commits to the resource, and a host that cannot
 * answer for it has not said it is usable. A transient failure reads as the
 * host's own message on the field, and finishing again is what repeats the
 * question — which is exactly what the researcher would want to do.
 */
async function unreadableResourceIssues(
  options: StagedResourceFinishOptions,
  promoting: readonly string[],
): Promise<readonly DanglingResourceReference[]> {
  if (promoting.length === 0) return Object.freeze([]);
  const references = collectStageResourceReferences(options.stageDocument);
  const issues: DanglingResourceReference[] = [];

  for (const resourceId of promoting) {
    const inspected = await callGateway(() =>
      options.gateway.inspect(resourceId),
    );
    if (inspected.status === 'ok') continue;
    for (const reference of references) {
      if (reference.resourceId !== resourceId) continue;
      issues.push(
        Object.freeze({
          code: 'custom',
          path: ['stages', options.stageIndex, ...reference.path],
          message: `The resource ("${resourceId}") this stage uses cannot be saved: ${inspected.failure.message}`,
          resourceId,
        }),
      );
    }
  }
  return Object.freeze(issues);
}

/**
 * Drops each abandoned resource, and says which ones the host would not drop:
 * a failure here leaves the resource staged, and a finish that reported only
 * what it managed to discard would look like a clean one.
 *
 * This runs after the stage and its resources have already committed, so a
 * host that throws is reported as a refused discard like any other. Letting
 * the exception out would turn a save that succeeded into a save the
 * researcher is told failed, over bytes nobody wanted.
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
    const result = await callGateway(() => gateway.discardStaged(resourceId));
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
 * A discard, a cancel, or a second finish refused because a save of these
 * resources is already under way. Retryable, and true to what the researcher
 * can do: once the save settles, an unwanted resource can be discarded like
 * any other, and an abandoned stage can be cancelled.
 */
function saveInFlightFailure<T>(resourceId?: string): ResourceResult<T> {
  return resourceFailure(
    'unavailable',
    'these resources are being saved right now, so they cannot be discarded until the save finishes',
    resourceId === undefined ? {} : { resourceId },
  );
}

/**
 * A discard refused because the last promotion of these resources never said
 * what it did, so they may already be part of the protocol.
 *
 * Retryable, and true to the way out: finishing again asks the host under the
 * same promotion id, which is what turns "maybe" into an answer — and once it
 * has answered, the discard the researcher asked for either happens or has
 * nothing left to do.
 */
function promotionUndecidedFailure<T>(resourceId?: string): ResourceResult<T> {
  return resourceFailure(
    'unavailable',
    'the last attempt to save these resources did not say whether it finished, so they cannot be discarded until saving again settles it',
    resourceId === undefined ? {} : { resourceId },
  );
}

/**
 * A save refused because the session was cancelled. Not retryable: the cancel
 * discarded everything this session staged, so repeating the save could only
 * ever commit a stage whose resources are gone.
 */
function sessionCancelledFailure<T>(): ResourceResult<T> {
  return resourceFailure(
    'read-only',
    'this stage was discarded, so its resources can no longer be saved',
  );
}

/**
 * A reference refused because the resource is on its way out of the session.
 *
 * Reported as `not-found` because that is what the id is about to mean, and
 * not retryable: asking again would only be waiting for the discard to finish
 * making it true. The message offers the way out that always exists —
 * something else — rather than describing the race.
 */
function resourceLeavingFailure<T>(resourceId: string): ResourceResult<T> {
  return resourceFailure(
    'not-found',
    'That resource is being discarded, so it cannot be used here. Choose a different one.',
    { resourceId },
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
