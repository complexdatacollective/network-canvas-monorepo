import { v4 as uuid } from 'uuid';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  CurrentProtocolSchema,
  isExclusiveVariantContainer,
  type CurrentProtocol,
  type ProtocolValidationIssue,
  type StageType,
} from '@codaco/protocol-validation';
import {
  applyCommands,
  canonicalize,
  commandTarget,
  contentHash,
  type Command,
  type SectionDoc,
  targetRoot,
} from '@codaco/studio-sync/apply';
import {
  type ProtocolSectionId,
  parseSectionId,
  sectionId,
} from '@codaco/studio-sync/taxonomy';

import { compoundRequestMessages } from './compound-edit/compoundRequestMessages.ts';
import {
  commandForListChange,
  isDictionary,
  MAX_COMMAND_PATH_SEGMENTS,
  rebaseCommands,
} from './listCommands.ts';
import {
  protocolContextFromSections,
  type ProtocolBuilderProtocolContext,
} from './protocol-context.ts';
import type {
  ManifestApplyRequest,
  ProtocolBuilderResourceGateway,
  ResourceDescriptor,
  ResourceGatewayFailure,
  ResourceResult,
} from './resources/gateway.ts';
import {
  assetsSectionForValidation,
  createStagedResourceTracker,
  draftResourceIssues,
  finishStagedResources,
  mergeDraftValidationIssues,
  promotionContent,
  stageIndexForValidation,
  type SessionResourceGateway,
  type StagedResourceCancelReport,
  type StagedResourceDiscardFailure,
  type StagedResourceFinishOutcome,
  type StagedResourceTracker,
} from './resources/lifecycle.ts';
import { collectStageResourceReferences } from './resources/references.ts';
import { isStageType } from './stage-types.ts';
import {
  attributeValidationIssues,
  type AttributedProtocolValidationIssue,
} from './validationAttribution.ts';

/**
 * Why a compound edit did not happen, in the researcher's own words.
 *
 * A `CompoundEditResult`'s `message` is a plain string because a HOST supplies
 * one too — `onCompoundEdit` is the host's, and its refusals are written and
 * translated by whoever wrote it. So the messages this package produces are
 * encoded into that string with `createMessageError` and decoded where they
 * are rendered (`formatMessageError(text, intl) ?? text`), which leaves a
 * host's plain string working exactly as before.
 */
const messages = defineMessages({
  compoundPendingCommands: {
    id: 'protocolBuilder.session.compoundPendingCommands',
    defaultMessage:
      'save the current stage changes before editing related sections',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: the step has unsaved changes.',
  },
  compoundStaleStage: {
    id: 'protocolBuilder.session.compoundStaleStage',
    defaultMessage:
      'the authoritative stage changed while this change was being made, so nothing local was altered',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: the shared copy of the step moved on while the researcher was working. "stage" is one step of an interview.',
  },
  compoundSentChangesStale: {
    id: 'protocolBuilder.session.compoundSentChangesStale',
    defaultMessage:
      'the stage changes already sent no longer apply to this session’s base, so nothing local was altered',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: earlier changes already sent no longer fit the step this session started from. "stage" is one step of an interview.',
  },
  compoundStageAlreadyApplied: {
    id: 'protocolBuilder.session.compoundStageAlreadyApplied',
    defaultMessage:
      'the stage changes this compound edit asks for have already been made',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: the step already carries everything the edit asked for. "stage" is one step of an interview.',
  },
  compoundUnavailable: {
    id: 'protocolBuilder.session.compoundUnavailable',
    defaultMessage: 'compound editing is unavailable',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: this host does not offer it.',
  },
  compoundInFlight: {
    id: 'protocolBuilder.session.compoundInFlight',
    defaultMessage: 'another compound edit is still in progress',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: one is already running.',
  },
  compoundHostError: {
    id: 'protocolBuilder.session.compoundHostError',
    defaultMessage: 'the compound edit failed',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen, when the host gave no reason of its own.',
  },
  compoundLeaseLost: {
    id: 'protocolBuilder.session.compoundLeaseLost',
    defaultMessage:
      'editing access was lost before the compound edit completed',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: this researcher stopped being the one editing it partway through.',
  },
  compoundStaleEpoch: {
    id: 'protocolBuilder.session.compoundStaleEpoch',
    defaultMessage:
      'editing authority changed before the compound edit completed',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: someone else took over editing the step partway through.',
  },
  compoundConflictingRevision: {
    id: 'protocolBuilder.session.compoundConflictingRevision',
    defaultMessage:
      'the compound result conflicts with the loaded authoritative revision',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: what came back cannot be reconciled with the version of the protocol on screen.',
  },
  compoundNewerRevision: {
    id: 'protocolBuilder.session.compoundNewerRevision',
    defaultMessage: 'a newer authoritative protocol revision is already loaded',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: a later version of the protocol is already on screen.',
  },
  compoundIdentityChanged: {
    id: 'protocolBuilder.session.compoundIdentityChanged',
    defaultMessage:
      'the authoritative response changed the edited stage identity',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: the answer came back naming a different step. "stage" is one step of an interview.',
  },
  compoundInvalidStage: {
    id: 'protocolBuilder.session.compoundInvalidStage',
    defaultMessage:
      'the authoritative response contains an invalid edited stage',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: the step that came back could not be read. "stage" is one step of an interview.',
  },
  compoundMissingStage: {
    id: 'protocolBuilder.session.compoundMissingStage',
    defaultMessage:
      'the authoritative response omitted the current edited stage from its full protocol snapshot',
    description:
      'Why an edit that would change the codebook alongside the interview step being edited did not happen: the step being edited was missing from the answer. "stage" is one step of an interview.',
  },
});

export type StageIdentity = Readonly<{ id: string; type: StageType }>;
export type StageFormDraft = Readonly<SectionDoc>;

/**
 * A stage this session is CREATING rather than opening.
 *
 * Present only while the interview does not contain the stage yet, which is the
 * one fact several parts of an editor need and none of them can work out for
 * themselves: a new stage is the only one whose name may be proposed, and the
 * only one whose place among the other stages is not in the stage order.
 *
 * The identity is settled before any of that — `createStageIdentity` fixes the
 * id when the session opens, so a create session edits one stage under one id
 * from its first keystroke — and `position` is where the host will insert it,
 * counting from zero. Only the host knows that, so it says so when it opens
 * the session.
 */
export type StageCreation = Readonly<{ position: number }>;

export type ManifestRevision = Readonly<{
  sequence: bigint;
  hash: string;
}>;

export type ProtocolBuilderPresence = Readonly<{
  sessionId: string;
  userId: string;
  displayName: string;
  sectionId: ProtocolSectionId;
  mode: 'editing' | 'viewing';
}>;

export type ChangeAttribution = Readonly<{
  sessionId: string;
  displayName: string;
  revision: ManifestRevision;
}>;

export type ProtocolBuilderAccess =
  | Readonly<{
      mode: 'editable';
      leaseOwner: string;
      leaseEpoch: bigint;
    }>
  | Readonly<{
      mode: 'readOnly';
      reason: 'spectator' | 'lease-lost' | 'permission';
      holder?: ProtocolBuilderPresence;
    }>;

export type PendingCommandBatch = Readonly<{
  id: number;
  commands: readonly Command[];
}>;

export type ProtocolBuilderHistory = Readonly<{
  canUndo: boolean;
  canRedo: boolean;
  generation: number;
  fencedAtRevision?: ManifestRevision;
}>;

export type ProtocolBuilderValidation =
  | Readonly<{ status: 'pending'; issues: readonly [] }>
  | Readonly<{ status: 'valid'; issues: readonly [] }>
  | Readonly<{
      status: 'invalid';
      issues: readonly AttributedProtocolValidationIssue[];
    }>;

export type ProtocolBuilderSnapshot = Readonly<{
  editedSection: Readonly<{
    sectionId: ProtocolSectionId;
    identity: StageIdentity;
    fields: StageFormDraft;
    /** Absent for a stage the interview already contains. */
    creation?: StageCreation;
  }>;
  protocolSections: Readonly<Record<string, SectionDoc>>;
  protocolContext: ProtocolBuilderProtocolContext;
  manifestRevision: ManifestRevision;
  access: ProtocolBuilderAccess;
  presence: readonly ProtocolBuilderPresence[];
  attribution: Readonly<Record<string, ChangeAttribution>>;
  /**
   * Every local batch the authoritative protocol has not acknowledged yet,
   * including the batches a live-applying host has not been given: a batch
   * that references a resource staged in this session waits here until finish
   * carries it and the manifest to the host together.
   */
  pendingCommands: readonly PendingCommandBatch[];
  history: ProtocolBuilderHistory;
  validation: ProtocolBuilderValidation;
  validatedProtocol: CurrentProtocol | null;
  /**
   * Resources staged in this session and not yet promoted or discarded.
   *
   * Descriptors only, exactly as the gateway hands them out: a staged secret
   * appears here as its name and id, never as its value.
   */
  stagedResources: readonly ResourceDescriptor[];
}>;

export type CompoundSectionEdit =
  | Readonly<{
      kind: 'update';
      sectionId: ProtocolSectionId;
      /** Content hash of the authoritative section the commands were built from. */
      expectedContentHash: string;
      commands: readonly Command[];
    }>
  | Readonly<{
      kind: 'create';
      sectionId: ProtocolSectionId;
      document: SectionDoc;
    }>
  | Readonly<{
      kind: 'remove';
      sectionId: ProtocolSectionId;
      /** Content hash of the authoritative section approved for removal. */
      expectedContentHash: string;
    }>;

export type CompoundEditRequest = Readonly<{
  /** Stable across an uncertain retry so a host can apply the intent once. */
  id: string;
  description: string;
  edits: readonly CompoundSectionEdit[];
}>;

export type CompoundEditSubmission = CompoundEditRequest &
  Readonly<{
    /** Authority captured before the asynchronous host call begins. */
    authority: Readonly<{
      sectionId: ProtocolSectionId;
      leaseOwner: string;
      leaseEpoch: bigint;
    }>;
  }>;

export type CompoundEditFailureReason =
  | 'compound-in-flight'
  | 'host-error'
  | 'invalid-request'
  | 'invalid-response'
  | 'lease-lost'
  | 'pending-commands'
  | 'stale-base'
  | 'stale-epoch'
  | 'stale-result'
  | 'unavailable';

export type CompoundEditResult =
  | Readonly<{ status: 'applied'; update: AuthoritativeUpdate }>
  | Readonly<{
      status: 'blocked';
      blockedSections: readonly Readonly<{
        sectionId: ProtocolSectionId;
        holder?: ProtocolBuilderPresence;
      }>[];
    }>
  | Readonly<{
      status: 'failed';
      reason: CompoundEditFailureReason;
      sectionId?: ProtocolSectionId;
      holder?: ProtocolBuilderPresence;
      message: string;
    }>;

export type ProtocolCandidateContext = Readonly<{
  stageDocument: SectionDoc;
  /**
   * The authoritative sections, with one provisional `assets` entry per
   * resource staged in this session. The canonical schema resolves every
   * resource reference against the manifest, so a draft that uses a staged
   * resource is validated as the protocol will be once it is promoted.
   */
  protocolSections: Readonly<Record<string, SectionDoc>>;
}>;

export type FinishRequest = Readonly<{
  stageDocument: SectionDoc;
  validatedProtocol: CurrentProtocol;
  pendingCommands: readonly PendingCommandBatch[];
  /**
   * Manifest commands for the staged resources this finish promotes, when it
   * promotes any. They must be applied in the SAME atomic revision as
   * `pendingCommands`: their bytes are already moved, and a host that commits
   * the stage without them commits references to resources the protocol does
   * not have. An `onFinish` that cannot apply both must throw, which rolls the
   * promotion back and leaves the staging intact for a retry.
   */
  resourceManifest?: ManifestApplyRequest;
}>;

export type ProtocolBuilderSession = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ProtocolBuilderSnapshot;
  getServerSnapshot(): ProtocolBuilderSnapshot;
  dispatch(commands: readonly Command[]): void;
  undo(): void;
  redo(): void;
  validate(): Promise<ProtocolBuilderValidation>;
  requestCompoundEdit(
    request: CompoundEditRequest,
  ): Promise<CompoundEditResult>;
  finish(): Promise<void>;
  /**
   * Ends the session without finishing: everything staged in it is discarded,
   * along with the pending batches that were withheld from a live-applying
   * host because they referenced that staging. Ok when the session has no
   * gateway — there is nothing to discard. Refused while a finish is
   * committing those very resources, because that promotion decides them.
   *
   * An upload or a secret still in flight is waited for rather than raced: it
   * is staging this cancel has decided against, and the answer has to be true
   * of it too.
   *
   * A resource whose promotion ended without saying what it did is kept
   * rather than discarded, and named in the report: see
   * {@link StagedResourceCancelReport}.
   */
  cancel(): Promise<ResourceResult<StagedResourceCancelReport>>;
  /**
   * The session-scoped resource gateway, or `undefined` when the host opened
   * the session without one. The shell provides it to editors; nothing else
   * in the package reaches host storage.
   */
  getResourceGateway(): SessionResourceGateway | undefined;
};

export type ProtocolBuilderSessionOptions = Readonly<{
  identity: StageIdentity;
  fields: StageFormDraft;
  /**
   * Supplied when the host opens the session to CREATE this stage, and left out
   * when it opens one the interview already contains. See {@link StageCreation}.
   */
  creation?: StageCreation;
  protocolSections: Readonly<Record<string, SectionDoc>>;
  manifestRevision: ManifestRevision;
  access: ProtocolBuilderAccess;
  presence?: readonly ProtocolBuilderPresence[];
  attribution?: Readonly<Record<string, ChangeAttribution>>;
  /**
   * The host's resource port. Supplied when the session opens, so staging
   * lives exactly as long as the edit session: finish promotes what the draft
   * still references, and cancel discards everything.
   */
  resourceGateway?: ProtocolBuilderResourceGateway;
  buildCandidate(context: ProtocolCandidateContext): unknown;
  /**
   * Each local batch, as it is made, for a host that applies edits live rather
   * than only at finish.
   *
   * **A batch handed over here is the host's.** Supplying this says the host
   * applies what it is given, in the order it is given it, and before it
   * answers anything else this session asks of it; a host that would rather
   * take the whole stage at finish does not supply it and receives the pending
   * batches there instead. Nothing else can tell the two apart in time to
   * matter: the acknowledgement a live-applying host owes arrives a round trip
   * later, and a compound edit made inside that window has to say which
   * document the host will apply it to — see {@link deliveredPrefixLength} and
   * `planPendingCommands`. Guessing that from the stage the session had last
   * been told about folded batches the host was already holding into a request
   * it then refused as stale.
   *
   * A batch that puts a resource this session has staged into the draft is
   * withheld: its bytes are not in the protocol until finish promotes them, so
   * a host applying it live would commit a reference to a resource the
   * protocol does not have. That batch and every batch after it stay pending
   * — visible in {@link ProtocolBuilderSnapshot.pendingCommands}, so nothing
   * looks saved that is not — and reach the host in the finish apply, in
   * order, alongside the manifest commands from the same promotion. A cancel
   * drops them with the staging that made them unsendable. Batches naming only
   * committed resources are unaffected.
   */
  onCommands?(batch: PendingCommandBatch): void;
  onCompoundEdit?(
    request: CompoundEditSubmission,
  ): Promise<CompoundEditResult> | CompoundEditResult;
  onFinish?(request: FinishRequest): Promise<void> | void;
  /**
   * Staged resources a finish committed the stage without being able to drop.
   *
   * The save succeeded, so this is not a failed finish — but the host is still
   * holding bytes or a secret the draft walked away from, and the session goes
   * on listing them in {@link ProtocolBuilderSnapshot.stagedResources} so the
   * next cleanup can still reach them. Reported because the alternative is a
   * finish that claims a cleanup it did not manage.
   */
  onResourceCleanupFailed?(
    failures: readonly StagedResourceDiscardFailure[],
  ): void;
}>;

export type AuthoritativeUpdate = Readonly<{
  protocolSections: Readonly<Record<string, SectionDoc>>;
  manifestRevision: ManifestRevision;
  presence?: readonly ProtocolBuilderPresence[];
  attribution?: Readonly<Record<string, ChangeAttribution>>;
}>;

export class SessionReadOnlyError extends Error {
  constructor() {
    super('the protocol-builder session is read-only');
  }
}

export class StageIdentityCommandError extends Error {
  constructor(key: string) {
    super(`stage identity field ${key} is owned by the session`);
  }
}

export class InvalidProtocolDraftError extends Error {
  readonly issues: readonly ProtocolValidationIssue[];

  constructor(issues: readonly ProtocolValidationIssue[]) {
    super('the protocol draft is not valid');
    this.issues = issues;
  }
}

/**
 * A finish that could not commit its resources: the promotion was rolled back,
 * or the session would not let this finish start at all because a cancel or
 * another finish already had it. Nothing was committed and nothing was
 * discarded either way, so the same finish can be tried again whenever the
 * failure says it is retryable.
 */
export class ResourcePromotionError extends Error {
  readonly failure: ResourceGatewayFailure;

  constructor(failure: ResourceGatewayFailure) {
    super(failure.message);
    this.failure = failure;
  }
}

export class AuthoritativeConflictError extends Error {
  constructor() {
    super('cannot replace the edited section while local commands are pending');
  }
}

export function createStageIdentity(
  type: StageType,
  createId: () => string = () => uuid({}),
): StageIdentity {
  const id = createId();
  if (id === '') throw new Error('stage identity must be non-empty');
  return Object.freeze({ id, type });
}

export function stageDraftFromDocument(document: SectionDoc): Readonly<{
  identity: StageIdentity;
  fields: StageFormDraft;
}> {
  const { id, type, ...fields } = document;
  if (typeof id !== 'string' || id === '' || !isStageType(type)) {
    throw new Error('stage document has no valid session-owned identity');
  }
  return Object.freeze({
    identity: Object.freeze({ id, type }),
    fields: freezeDoc(fields),
  });
}

export function stageDocument(
  identity: StageIdentity,
  fields: StageFormDraft,
): SectionDoc {
  assertNoIdentityFields(fields);
  return { id: identity.id, type: identity.type, ...cloneDoc(fields) };
}

/**
 * The commands that turn one draft into another.
 *
 * Addressed at the deepest place the difference actually is, rather than at the
 * top-level key above it. Two things follow from that, and both are the whole
 * reason a command may address a nested path at all:
 *
 * - a difference that IS a list — one row inserted, removed or moved, wherever
 *   the stage keeps that list — is said as the row operation it is, so undo,
 *   redo and every other route through this diff stays as mergeable as the
 *   list editor's own commit was. A change the vocabulary cannot express falls
 *   back to a `set` at the list's own path;
 * - a change to one member of a nested object is a `set` at that member, so a
 *   sibling nobody touched is not rewritten. Writing `nodeConfig` whole to
 *   record a new `nodeConfig.type` is exactly the merge-blind write nested
 *   addressing exists to avoid.
 *
 * A container the draft did not have before is diffed against an EMPTY one,
 * for the second of those reasons. Said as one `set` of the whole object, it
 * is a merge-blind write like any other: only a list-valued `set` is merged on
 * the way out, so a sibling a collaborator wrote under the same container
 * while this draft was being made — two researchers switching one capability
 * on within a round trip of each other, each configuring the part of it they
 * came for — is written straight back out of existence. An empty container is
 * the exception, because it has no leaf to be said at: what an empty object
 * means is a question about the document's schema, and the draft holding the
 * container is the whole of the difference.
 *
 * The other direction is deliberately NOT symmetrical: a container the draft
 * REMOVED is one `unset` of the container, which takes with it whatever the
 * arrival wrote inside it. Switching a capability off is a decision about the
 * capability rather than about the fields configured under it, and this is the
 * merge rule the lists already follow — a row the edit removed goes, whatever
 * the arrival did to it.
 *
 * And a container the schema allows only ONE SHAPE of is written whole, in
 * either direction. A sociogram's `background` is an image or a number of
 * concentric circles and never both, so a `set` of `background.image` replayed
 * after a collaborator switched the stage to circles leaves both members set —
 * a draft `imageOrCirclesBackgroundSchema` refuses, which the researcher
 * cannot save and neither of them asked for. Depth is what makes that hybrid,
 * so depth is what stops: the variant is the unit the two sides are deciding
 * between, the whole of it travels, and a collaborator's switch conflicts with
 * it at the container, where the later write wins entire. That is the same
 * answer the `unset` above gives, and the losing side's switch is at least a
 * decision one of them made rather than a shape neither of them chose.
 *
 * Refusing such a write at the REBASE instead — dropping the leaf command when
 * the arrival has changed the variant — would answer only for this session's
 * own replay, and it would have to answer by discarding the researcher's edit
 * after the fact. Saying it at the diff answers wherever the batch is
 * replayed, because the command that could make the hybrid is never minted:
 * undo and redo compose their commands here too, and so does every other
 * client.
 *
 * Which containers those are is read off the protocol schemas themselves — see
 * `isExclusiveVariantContainer` in `@codaco/protocol-validation` — so a stage
 * type that gains a variant is answered without anybody here remembering.
 *
 * A one-segment path is still spelled as the bare key it always was
 * (`commandTarget`), so everything a top-level field emits is unchanged on the
 * wire and in the command log.
 */
export function commandsFromDraftChange(
  previous: StageFormDraft,
  next: StageFormDraft,
): Command[] {
  assertNoIdentityFields(previous);
  assertNoIdentityFields(next);
  const commands: Command[] = [];
  collectDraftCommands([], previous, next, commands);
  return commands;
}

/** What a container the draft is creating is diffed against. */
const EMPTY_CONTAINER: SectionDoc = Object.freeze({});

function collectDraftCommands(
  path: readonly string[],
  previous: SectionDoc,
  next: SectionDoc,
  commands: Command[],
): void {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  for (const key of [...keys].toSorted()) {
    const here = [...path, key];
    const before = previous[key];
    const after = next[key];
    if (after === undefined) {
      if (Object.hasOwn(previous, key) && before !== undefined) {
        commands.push({ op: 'unset', key: commandTarget(here) });
      }
      continue;
    }
    if (
      Object.hasOwn(previous, key) &&
      canonicalize(before) === canonicalize(after)
    ) {
      continue;
    }
    // The dictionary this key held, as the diff reads it: the one that was
    // there, or an empty one when the draft is CREATING the container. See
    // `commandsFromDraftChange` for why a created container is walked at all.
    const container = isDictionary(before)
      ? before
      : before === undefined
        ? EMPTY_CONTAINER
        : undefined;
    if (
      container !== undefined &&
      isDictionary(after) &&
      here.length < MAX_COMMAND_PATH_SEGMENTS &&
      !isExclusiveVariantContainer(here)
    ) {
      const said = commands.length;
      collectDraftCommands(here, container, after, commands);
      // A container the draft created with nothing inside it to say — `{}`, or
      // one holding only undefined members — is a difference all the same, and
      // the container itself is the only place left to say it.
      if (commands.length > said || container !== EMPTY_CONTAINER) continue;
    }
    if (Array.isArray(before) && Array.isArray(after)) {
      commands.push(commandForListChange(commandTarget(here), before, after));
      continue;
    }
    commands.push({
      op: 'set',
      key: commandTarget(here),
      value: cloneValue(after),
    });
  }
}

export class ProtocolBuilderSessionStore implements ProtocolBuilderSession {
  private readonly listeners = new Set<() => void>();
  private readonly options: ProtocolBuilderSessionOptions;
  private snapshot: ProtocolBuilderSnapshot;
  private baseFields: SectionDoc;
  private readonly undoStack: SectionDoc[] = [];
  private readonly redoStack: SectionDoc[] = [];
  private historyGeneration = 0;
  private fencedAtRevision: ManifestRevision | undefined;
  private nextBatchId = 1;
  private validationVersion = 0;
  private compoundEditInFlight = false;
  private readonly resources: StagedResourceTracker | undefined;
  /**
   * The key the current finish's content is promoted under, and the content it
   * was minted for.
   *
   * A promotion key names one commit — this stage document, promoting these
   * staged resources — and not "the finish this session is retrying". An
   * idempotent host asked twice under one key hands back the promotion it
   * already made without applying anything again, so a key carried across a
   * changed draft or a swapped resource would report the second finish as done
   * while none of it reached the protocol. It is therefore held only for as
   * long as the content is: a retry of the identical finish reuses it, and any
   * other finish mints its own. Cleared on success as well, so a finish that
   * has been committed can never be replayed under the key that committed it.
   *
   * **A key is never rotated away from while something is still waiting on
   * it.** A promotion that ended without saying what it did can only ever be
   * answered under the key it was made with, so a rotation before that answer
   * arrives strands its resources for good: nothing may discard them, because
   * the protocol may already have them, and nothing may promote them, because
   * a host holding them refuses a second key for the same bytes. So the
   * session settles the outstanding key before it mints another — see
   * {@link promotionForFinish} — and only then is this slot the one commit it
   * describes.
   *
   * `carriedThroughBatchId` is the other half of that commit: the last pending
   * batch the finish that minted this key handed to the host, applied inside
   * the very promotion the key names. If settling proves the host holds the
   * promotion, it holds those batches too — see
   * {@link retirePendingCommandsThrough}. It is fixed when the key is minted
   * and never raised on a retry, because a retry under a key the host has
   * already completed is answered without applying anything: the batches the
   * FIRST attempt carried are the only ones any answer can vouch for.
   */
  private promotion:
    | Readonly<{ id: string; content: string; carriedThroughBatchId: number }>
    | undefined;
  /**
   * The first batch withheld from `onCommands` because it references a staged
   * resource. Every later batch is withheld with it, so a live-applying host
   * only ever holds a prefix of this session's batches and an acknowledgement
   * cannot drop a batch it never received.
   */
  private withheldFromBatchId: number | undefined;

  constructor(options: ProtocolBuilderSessionOptions) {
    assertNoIdentityFields(options.fields);
    this.options = options;
    this.baseFields = cloneDoc(options.fields);
    this.resources =
      options.resourceGateway === undefined
        ? undefined
        : createStagedResourceTracker({
            gateway: options.resourceGateway,
            isEditable: () => this.snapshot.access.mode === 'editable',
            // Staging changes what the draft may legally reference, so the
            // draft is revalidated: discarding a resource something still uses
            // is a problem the researcher must see immediately, and staging
            // one is what clears it.
            onStagedChanged: () => {
              this.replaceSnapshot({
                validation: pendingValidation(),
                validatedProtocol: null,
              });
              void this.runValidation();
            },
          });
    this.snapshot = this.makeSnapshot({
      fields: options.fields,
      protocolSections: options.protocolSections,
      manifestRevision: options.manifestRevision,
      access: options.access,
      presence: options.presence ?? [],
      attribution: options.attribution ?? {},
      pendingCommands: [],
      validation: pendingValidation(),
      validatedProtocol: null,
    });
    void this.runValidation();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ProtocolBuilderSnapshot => this.snapshot;

  getServerSnapshot = (): ProtocolBuilderSnapshot => this.snapshot;

  dispatch(commands: readonly Command[]): void {
    this.assertEditable();
    this.assertCommandsDoNotOwnIdentity(commands);
    this.applyLocalCommands(commands, true);
  }

  undo(): void {
    this.assertEditable();
    const target = this.undoStack.pop();
    if (target === undefined) return;
    this.redoStack.push(cloneDoc(this.snapshot.editedSection.fields));
    this.applyLocalCommands(
      commandsFromDraftChange(this.snapshot.editedSection.fields, target),
      false,
    );
  }

  redo(): void {
    this.assertEditable();
    const target = this.redoStack.pop();
    if (target === undefined) return;
    this.undoStack.push(cloneDoc(this.snapshot.editedSection.fields));
    this.applyLocalCommands(
      commandsFromDraftChange(this.snapshot.editedSection.fields, target),
      false,
    );
  }

  validate(): Promise<ProtocolBuilderValidation> {
    this.replaceSnapshot({
      validation: pendingValidation(),
      validatedProtocol: null,
    });
    return this.runValidation();
  }

  async requestCompoundEdit(
    request: CompoundEditRequest,
  ): Promise<CompoundEditResult> {
    this.assertEditable();
    const invalidRequest = validateCompoundEditRequest(request);
    if (invalidRequest !== null) return invalidRequest;
    if (this.options.onCompoundEdit === undefined) {
      return compoundFailure(
        'unavailable',
        createMessageError(messages.compoundUnavailable),
      );
    }
    if (this.compoundEditInFlight) {
      return compoundFailure(
        'compound-in-flight',
        createMessageError(messages.compoundInFlight),
      );
    }

    const planned = this.planPendingCommands(request);
    if (planned.status === 'refused') return planned.failure;

    const access = this.snapshot.access;
    if (access.mode !== 'editable') {
      throw new SessionReadOnlyError();
    }
    const authority = Object.freeze({
      sectionId: this.snapshot.editedSection.sectionId,
      leaseOwner: access.leaseOwner,
      leaseEpoch: access.leaseEpoch,
    });
    const submission: CompoundEditSubmission = Object.freeze({
      ...request,
      edits: planned.edits,
      authority,
    });

    this.compoundEditInFlight = true;
    try {
      let result: CompoundEditResult;
      try {
        result = await this.options.onCompoundEdit(submission);
      } catch (error: unknown) {
        return compoundFailure(
          'host-error',
          error instanceof Error
            ? error.message
            : createMessageError(messages.compoundHostError),
        );
      }
      if (result.status !== 'applied') return result;

      const currentAccess = this.snapshot.access;
      if (currentAccess.mode !== 'editable') {
        return compoundFailure(
          'lease-lost',
          createMessageError(messages.compoundLeaseLost),
        );
      }
      if (
        currentAccess.leaseOwner !== authority.leaseOwner ||
        currentAccess.leaseEpoch !== authority.leaseEpoch
      ) {
        return compoundFailure(
          'stale-epoch',
          createMessageError(messages.compoundStaleEpoch),
        );
      }
      const resultRevisionOrder = revisionOrder(
        result.update.manifestRevision,
        this.snapshot.manifestRevision,
      );
      if (
        resultRevisionOrder === 'older' ||
        resultRevisionOrder === 'conflicting'
      ) {
        return compoundFailure(
          'stale-result',
          resultRevisionOrder === 'conflicting'
            ? createMessageError(messages.compoundConflictingRevision)
            : createMessageError(messages.compoundNewerRevision),
        );
      }

      const stageSectionId = this.snapshot.editedSection.sectionId;
      const updatedStageDocument =
        result.update.protocolSections[stageSectionId];
      /**
       * A stage being CREATED is not in the protocol the host answers with,
       * because it is not in the protocol at all until this session finishes.
       * So its absence is the only correct answer to a create session's
       * request, and refusing it would refuse every codebook edit a new
       * stage's editor makes — after the host has already applied it.
       *
       * The host says nothing about this stage, so nothing about it moves:
       * the base stands, the draft stands, the history stands, and only the
       * sections and the revision the host DID decide are adopted below.
       */
      const stageAbsentByCreation =
        updatedStageDocument === undefined &&
        this.options.creation !== undefined;
      let fields: typeof this.snapshot.editedSection.fields;
      if (updatedStageDocument !== undefined) {
        try {
          const updatedStage = stageDraftFromDocument(updatedStageDocument);
          if (
            updatedStage.identity.id !==
              this.snapshot.editedSection.identity.id ||
            updatedStage.identity.type !==
              this.snapshot.editedSection.identity.type
          ) {
            return compoundFailure(
              'invalid-response',
              createMessageError(messages.compoundIdentityChanged),
              stageSectionId,
            );
          }
          fields = updatedStage.fields;
        } catch {
          return compoundFailure(
            'invalid-response',
            createMessageError(messages.compoundInvalidStage),
            stageSectionId,
          );
        }
      } else if (stageAbsentByCreation) {
        // Read from `this.baseFields` rather than from the draft: the draft is
        // the base plus the batches still pending, and adopting it as the base
        // would either swallow those batches or replay them onto a document
        // that already holds them.
        fields = cloneDoc(this.baseFields);
      } else {
        return compoundFailure(
          'invalid-response',
          createMessageError(messages.compoundMissingStage),
          stageSectionId,
        );
      }

      // The folded batches are in the authoritative stage the host answered
      // with, so they are acknowledged rather than replayed onto it: replaying
      // a `set` would be harmless, but replaying an `insertItem` would add the
      // row twice, and leaving them pending would send them to the host again
      // at finish.
      let pendingCommands = this.snapshot.pendingCommands.filter(
        (batch) => batch.id > planned.throughBatchId,
      );
      // How many of those the host was HANDED before this request went out.
      // A batch given to `onCommands` is the host's — applied in the order it
      // was given, and before the host answers anything else this session asks
      // of it (see the option) — so its being in the answer is not something to
      // read off the answer at all. The reading below decides only the batches
      // delivery cannot order: the ones made while this request was in flight.
      const deliveredBefore = pendingCommands.filter(
        (batch) => batch.id <= planned.deliveredThroughBatchId,
      ).length;
      // Whether this apply moved the ground the batches still pending stand on.
      let rebased: boolean;
      if (stageAbsentByCreation) {
        // The host was not holding this stage and did not decide anything
        // about it, so there is no new ground: `fields` is the base it already
        // was, and the pending batches still stand on it.
        rebased = false;
      } else if (planned.throughBatchId >= 0) {
        // This request carried the researcher's batches, so the stage it
        // answers with is the new base and anything still pending was made
        // after it — during the round trip — and has to be replayed onto it.
        rebased = true;
      } else if (planned.stageEdited) {
        // The request itself decided what this stage becomes, and carried none
        // of the researcher's batches: the host already had every one it has
        // been given. So the stage it answers with is this session's base plus
        // however many of those it had applied by the time it answered, plus
        // the request's own commands — and the ones that reading accounts for
        // are the host's now, acknowledged by content exactly as the
        // codebook-only path below acknowledges them. Rebasing them onto an
        // answer that already holds them would apply an `insertItem` twice.
        const canonicalStage = canonicalize(fields);
        const stageCommands = planned.stageCommands ?? [];
        const accounted = this.deliveredPrefixLength(
          pendingCommands,
          (candidate) => {
            try {
              return (
                canonicalize(applyCommands(candidate, [...stageCommands])) ===
                canonicalStage
              );
            } catch {
              // The request's own commands do not apply to that document, so
              // it is not the one the host applied them to.
              return false;
            }
          },
          deliveredBefore,
        );
        // `null` is a stage a collaborator also moved, which says nothing
        // about the batches this session handed over BEFORE the request: the
        // host applied those whoever else touched the stage afterwards, so
        // they are retired and only what was made during the round trip is
        // rebased onto the answer.
        pendingCommands = pendingCommands.slice(accounted ?? deliveredBefore);
        // The draft has to pick up the request's own decision either way, so
        // the history is fenced only if the stage actually moved — and always
        // when it moved somewhere this session cannot account for, because the
        // batches left pending are then standing on new ground.
        rebased =
          accounted === null ||
          canonicalize(fields) !== canonicalize(this.baseFields);
      } else if (pendingCommands.length === 0) {
        // No unsaved work at stake: the authoritative stage is simply adopted,
        // and the history is fenced only if it actually moved.
        rebased = canonicalize(fields) !== canonicalize(this.baseFields);
      } else {
        // A codebook-only request asked the host to leave this stage alone, so
        // the stage it answers with is this session's own base plus however
        // many of the delivered batches the host has already applied to it:
        // none for a session that hands the host nothing until finish, all of
        // them for one that hands over every batch as it is made, and a
        // leading run when a batch was made while this request was in flight —
        // which is the one thing delivery alone cannot say. That prefix is
        // the host's now — acknowledged by content, because the deferred
        // acknowledgement naming it will arrive against a revision this apply
        // has already superseded — and the rest stay pending. The draft on
        // screen is base + prefix + the rest whichever host this is, so
        // nothing is replayed and no undo is thrown away for a change that did
        // not touch the stage.
        const canonicalStage = canonicalize(fields);
        const accounted = this.deliveredPrefixLength(
          pendingCommands,
          (candidate) => canonicalize(candidate) === canonicalStage,
          deliveredBefore,
        );
        pendingCommands = pendingCommands.slice(accounted ?? deliveredBefore);
        if (accounted === null) {
          // The stage came back as neither: a collaborator moved it while this
          // request was in flight. Adopted and rebased onto, exactly as
          // `acknowledge` treats a foreign arrival — because there is nothing
          // left to refuse. This request said nothing about the stage, so
          // nothing about the stage could be checked before it was sent (the
          // fold's own stale base is refused in `planPendingCommands`, before
          // the host is asked); by the time the answer says the stage moved,
          // the host has APPLIED the codebook change and is answering with its
          // own stage beside it. Reporting a refusal there left the section on
          // the host and this session on the revision before it, with no way
          // back — a retry under a new request id collides with the section
          // that now exists, and one under the same id replays the host's
          // cached result into the same refusal.
          //
          // The batches this session HANDED OVER before the request are the
          // host's all the same — that is what `onCommands` means, and a
          // collaborator's edit to the same stage says nothing about it — so
          // they are retired above and are in the answer being adopted here.
          // Keeping them pending replayed them onto a stage already holding
          // them: the researcher's row a second time in the draft, and a
          // finish that writes the duplicate to the host. Only the batches
          // made while the request was in flight are still this session's, and
          // those are rebased onto the answer rather than lost.
          rebased = true;
        } else {
          rebased = false;
        }
      }
      let reconciledFields: StageFormDraft = this.snapshot.editedSection.fields;
      if (rebased) {
        // Read before the base moves: what each pending batch MEANT is a fact
        // about the document it was made on. See `rebasePending`.
        const outstanding = new Set(pendingCommands.map((batch) => batch.id));
        const rebase = this.rebasePending(cloneDoc(fields), (batch) =>
          outstanding.has(batch.id),
        );
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.historyGeneration += 1;
        this.fencedAtRevision = result.update.manifestRevision;
        this.undoStack.push(...rebase.steps);
        pendingCommands = rebase.batches;
        reconciledFields = rebase.fields;
      }
      this.baseFields = cloneDoc(fields);
      this.releaseWithheldFrom(pendingCommands);
      this.replaceSnapshot({
        fields: reconciledFields,
        protocolSections: result.update.protocolSections,
        manifestRevision: result.update.manifestRevision,
        presence: result.update.presence ?? this.snapshot.presence,
        attribution: result.update.attribution ?? this.snapshot.attribution,
        pendingCommands,
        validation: pendingValidation(),
        validatedProtocol: null,
      });
      void this.runValidation();
      return result;
    } finally {
      this.compoundEditInFlight = false;
    }
  }

  /**
   * Validates, then commits the stage and its resources as one revision.
   *
   * The order is forced by what each step needs from the last: canonical
   * validation decides whether there is anything to commit at all (a draft
   * naming a resource that is neither committed nor staged is invalid here,
   * not at the host); the promotion then moves the bytes of exactly the staged
   * resources the validated draft references, and applies the stage inside
   * that promotion so the manifest entries and the stage's own commands reach
   * the host as one atomic apply. Staged resources the draft walked away from
   * are discarded only once that apply has succeeded.
   *
   * That apply is also where the batches withheld from a live-applying host
   * are released: they reference resources whose manifest entries are in the
   * very same apply, so this is the first moment they are safe to send.
   *
   * A finish that succeeds also retires the batches the host now holds, the
   * same way an acknowledgement of them would. Nothing else will: the host's
   * own acknowledgement is optional and may never come, and `insertItem`,
   * `removeItem` and `moveItem` are index-based, so a batch left pending is a
   * command the next finish replays against a document that has already moved.
   */
  async finish(): Promise<void> {
    this.assertEditable();
    const validation = await this.validate();
    const validatedProtocol = this.snapshot.validatedProtocol;
    if (validation.status !== 'valid' || validatedProtocol === null) {
      throw new InvalidProtocolDraftError(validation.issues);
    }

    const document = stageDocument(
      this.snapshot.editedSection.identity,
      this.snapshot.editedSection.fields,
    );
    // The batches this apply carries are fixed before it starts and not
    // re-read while it runs: an edit made mid-apply is not among them.
    const applyStageCarrying =
      (pendingCommands: readonly PendingCommandBatch[]) =>
      async (resourceManifest?: ManifestApplyRequest): Promise<void> => {
        await this.options.onFinish?.({
          stageDocument: document,
          validatedProtocol,
          pendingCommands,
          ...(resourceManifest === undefined ? {} : { resourceManifest }),
        });
      };

    const resources = this.resources;
    if (resources === undefined) {
      const pendingCommands = this.snapshot.pendingCommands;
      await applyStageCarrying(pendingCommands)();
      this.retirePendingCommandsThrough(pendingCommands.at(-1)?.id ?? 0);
      return;
    }

    // Takes the session for this finish, and closes the staging window as it
    // reads it: an upload or secret that lands while this promotion is in
    // flight is one this finish already decided against, and no later one
    // would ever look at it. A cancel — or another finish — that arrives from
    // here on is refused until the hold is released, so the two can never both
    // report success over the same resources.
    const hold = resources.finishing();
    if (hold.status === 'failed') {
      throw new ResourcePromotionError(hold.failure);
    }

    let outcome: StagedResourceFinishOutcome;
    let carriedThroughBatchId = 0;
    // What the attempt that made the promotion this finish is asking under
    // carried, which is what the host holds if it answers out of its promotion
    // cache instead of applying anything here.
    let promotedThroughBatchId = 0;
    try {
      // Decided after the hold, because the hold is what fixes the staged set
      // this finish promotes: content read before it could still change.
      const promotion = await this.promotionForFinish(
        resources,
        document,
        hold.data.staged,
      );
      promotedThroughBatchId = promotion.carriedThroughBatchId;
      // Read after that settling, not before it: settling a promotion the host
      // turns out to hold retires the batches its apply already committed, and
      // this apply must not carry them again.
      const pendingCommands = this.snapshot.pendingCommands;
      carriedThroughBatchId = pendingCommands.at(-1)?.id ?? 0;
      outcome = await finishStagedResources({
        gateway: resources.gateway,
        promotionId: promotion.id,
        stageDocument: document,
        stageIndex: stageIndexForValidation(
          this.snapshot.protocolSections,
          this.snapshot.editedSection.identity.id,
        ),
        staged: promotion.staged,
        secretHandle: (resourceId) => resources.secretHandle(resourceId),
        applyStage: applyStageCarrying(pendingCommands),
      });
    } finally {
      // Released before anything below can throw: a hold left standing would
      // refuse every later cancel, stranding the session's staged resources.
      // Safe even when the promotion below was never decided: what a cancel
      // may discard is fenced by that promotion's own outcome, inside the
      // tracker, rather than by how long this finish holds the session.
      hold.data.settle();
    }

    if (outcome.status === 'unreadable-resources') {
      // The draft is invalid for the same reason a dangling reference makes it
      // invalid — a field naming a resource the protocol cannot use — so it is
      // reported the same way, on the field's own path.
      throw new InvalidProtocolDraftError(
        attributeValidationIssues(
          outcome.issues,
          this.snapshot.protocolSections,
          this.snapshot.attribution,
          this.snapshot.manifestRevision,
        ),
      );
    }
    if (outcome.status === 'apply-failed') throw outcome.error;
    if (outcome.status === 'promotion-failed') {
      throw new ResourcePromotionError(outcome.failure);
    }
    this.promotion = undefined;
    // Only the batches the host actually received are retired and released. An
    // edit made while the apply was in flight is not among them, and letting a
    // later batch overtake it would leave the host holding a gap an
    // acknowledgement would close over the missing edit. When the gateway
    // answered out of its promotion cache, this apply carried nothing at all
    // and the host holds what the attempt that made that promotion carried.
    this.retirePendingCommandsThrough(
      outcome.applied ? carriedThroughBatchId : promotedThroughBatchId,
    );
    if (outcome.discardFailures.length > 0) {
      try {
        this.options.onResourceCleanupFailed?.(outcome.discardFailures);
      } catch {
        // Everything this finish decided has already happened: the bytes are
        // promoted, the stage is applied, and the withheld batches are away.
        // This is a report about the one thing that did not — a best-effort
        // cleanup — and letting it out would tell the researcher a save that
        // succeeded had failed, and invite them to repeat a finish that has
        // nothing left to do. Nothing is lost by stopping here either: the
        // resources the host would not drop are still in `stagedResources`,
        // for the next cleanup or a cancel to reach.
      }
    }
  }

  /**
   * The key this finish promotes under, and the staged resources it promotes.
   *
   * A retry of the identical finish keeps the key it already has: repeating
   * that promotion is what settles it, whether the host answers with the
   * promotion it made or with a refusal saying it never made one.
   *
   * A finish that would commit anything else has to mint its own key — and
   * cannot simply take one, because the outstanding key is the only thing a
   * resource left in doubt can be answered under. So the doubt is settled
   * first, under the key that created it and without committing anything, and
   * whatever that settling committed leaves the staged set: those resources
   * are the protocol's now, and a host asked to promote them again refuses.
   *
   * Settling decides the batches as well as the resources. The manifest apply
   * of a promotion is where the stage's own commands were applied, so a
   * settling that proves the host holds the promotion proves it holds them;
   * they are retired here rather than sent again by the finish below, which
   * would replay index-based commands against a document that has already
   * moved. A settling that proves the host never took the promotion leaves
   * them exactly where they are, because nothing they said ever arrived.
   */
  private async promotionForFinish(
    resources: StagedResourceTracker,
    document: SectionDoc,
    staged: readonly ResourceDescriptor[],
  ): Promise<
    Readonly<{
      id: string;
      staged: readonly ResourceDescriptor[];
      /**
       * The batches the attempt that made this key carried. A host answering
       * under a key it has already completed applies nothing, so this — not
       * what the finish asking is about to hand to its own apply — is what
       * that answer proves the host holds.
       */
      carriedThroughBatchId: number;
    }>
  > {
    if (this.promotion?.content === promotionContent(document, staged)) {
      return Object.freeze({
        id: this.promotion.id,
        staged,
        carriedThroughBatchId: this.promotion.carriedThroughBatchId,
      });
    }

    const outstanding = this.promotion;
    const settled = await resources.reconcileUndecidedPromotions();
    if (settled.status === 'failed') {
      throw new ResourcePromotionError(settled.failure);
    }
    if (
      outstanding !== undefined &&
      settled.data.committed.includes(outstanding.id)
    ) {
      this.retirePendingCommandsThrough(outstanding.carriedThroughBatchId);
    }
    const stillStaged = new Set(
      resources.staged().map((descriptor) => descriptor.id),
    );
    const promoting = staged.filter((descriptor) =>
      stillStaged.has(descriptor.id),
    );
    this.promotion = Object.freeze({
      id: uuid({}),
      content: promotionContent(document, promoting),
      carriedThroughBatchId: this.snapshot.pendingCommands.at(-1)?.id ?? 0,
    });
    return Object.freeze({
      id: this.promotion.id,
      staged: promoting,
      carriedThroughBatchId: this.promotion.carriedThroughBatchId,
    });
  }

  /**
   * Drops the batches an apply has committed.
   *
   * The same delivered-prefix reconciliation {@link acknowledge} performs, for
   * the applies no acknowledgement is coming for. A finish's apply is one:
   * the host's own acknowledgement of that revision is optional, it may never
   * be sent, and when the finish was told its promotion had failed it belongs
   * to a finish this session gave up on. Leaving them pending is what makes
   * the next finish send them a second time, and `insertItem`, `removeItem`
   * and `moveItem` are index-based: replayed against the document they have
   * already moved, they duplicate an item or reorder the wrong one, and the
   * finish that does it reports success.
   *
   * The draft is untouched. What the batches say is already in it, and moving
   * them into the base is exactly what the host did with them — so the fields
   * the researcher is looking at, and the validation of them, are unchanged.
   */
  private retirePendingCommandsThrough(throughBatchId: number): void {
    // The host has everything through here, so the hold moves past it whether
    // or not any batch is still pending to be retired: a finish whose batches
    // an acknowledgement already dropped has still delivered them.
    this.releaseWithheldThrough(throughBatchId);
    const retired = this.snapshot.pendingCommands.filter(
      (batch) => batch.id <= throughBatchId,
    );
    if (retired.length === 0) return;
    this.baseFields = retired.reduce<SectionDoc>(
      (doc, batch) => applyCommands(doc, [...batch.commands]),
      cloneDoc(this.baseFields),
    );
    this.replaceSnapshot({
      pendingCommands: this.snapshot.pendingCommands.filter(
        (batch) => batch.id > throughBatchId,
      ),
    });
  }

  /**
   * Ends the edit and discards what it staged, except anything a promotion
   * left undecided — see {@link StagedResourceCancelReport}.
   */
  async cancel(): Promise<ResourceResult<StagedResourceCancelReport>> {
    const resources = this.resources;
    if (resources === undefined) {
      return Object.freeze({
        status: 'ok',
        data: Object.freeze({ keptUnreconciled: Object.freeze([]) }),
      });
    }
    const result = await resources.cancel();
    if (result.status === 'ok') this.dropWithheldCommands();
    return result;
  }

  getResourceGateway(): SessionResourceGateway | undefined {
    return this.resources?.gateway;
  }

  receiveAuthoritativeUpdate(update: AuthoritativeUpdate): void {
    if (
      !acceptsAuthoritativeRevision(
        update.manifestRevision,
        this.snapshot.manifestRevision,
      )
    ) {
      return;
    }
    this.replaceSnapshot({
      protocolSections: update.protocolSections,
      manifestRevision: update.manifestRevision,
      presence: update.presence ?? this.snapshot.presence,
      attribution: update.attribution ?? this.snapshot.attribution,
      validation: pendingValidation(),
      validatedProtocol: null,
    });
    void this.runValidation();
  }

  acknowledge(
    params: Readonly<{
      fields: StageFormDraft;
      throughBatchId: number;
      manifestRevision: ManifestRevision;
      attribution?: Readonly<Record<string, ChangeAttribution>>;
    }>,
  ): void {
    if (
      !acceptsAuthoritativeRevision(
        params.manifestRevision,
        this.snapshot.manifestRevision,
      )
    ) {
      return;
    }
    assertNoIdentityFields(params.fields);
    // Read before the base moves, for the same reason `rebasePending` is.
    const foreign = !this.isOwnAcknowledgedStage(
      params.fields,
      params.throughBatchId,
    );
    const rebase = this.rebasePending(
      cloneDoc(params.fields),
      (batch) => batch.id > params.throughBatchId,
    );
    this.baseFields = cloneDoc(params.fields);
    const { batches: pendingCommands, fields } = rebase;
    if (foreign) {
      // An undo entry is a whole draft, and every one of these predates the
      // arrival: undoing to one would take the collaborator's rows back out
      // with the researcher's own edit. So the history is fenced and rebuilt
      // out of the rebase's own steps — the draft before each rebased batch —
      // exactly as the compound-edit apply rebuilds it, which leaves the
      // researcher able to undo their own outstanding batches one at a time
      // and nothing else. The generation and the revision are what let the UI
      // say the history was cut and why.
      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.historyGeneration += 1;
      this.fencedAtRevision = params.manifestRevision;
      this.undoStack.push(...rebase.steps);
    }
    this.releaseWithheldFrom(pendingCommands);
    this.replaceSnapshot({
      fields,
      pendingCommands,
      protocolSections: this.sectionsWithAuthoritativeStage(params.fields),
      manifestRevision: params.manifestRevision,
      attribution: params.attribution ?? this.snapshot.attribution,
      validation: pendingValidation(),
      validatedProtocol: null,
    });
    void this.runValidation();
  }

  /**
   * Whether an acknowledged stage is nothing but this session's own work.
   *
   * The question the undo history turns on. A host that applies `onCommands`
   * live acknowledges EVERY batch as it commits, so "the base moved" is the
   * ordinary case and fencing on it would leave the researcher unable to undo
   * anything they had saved. What actually invalidates the history is a stage
   * carrying something this session did not put there — a collaborator's row —
   * because an undo entry is a whole draft that predates it.
   *
   * So the base is walked through the batches the acknowledgement covers,
   * which is the stage the host would be holding if it had applied those and
   * nothing else, and compared with the one it answered with. A batch that no
   * longer applies to the base it was made on says nothing reliable, and is
   * answered the conservative way: treat the arrival as foreign, which fences
   * the history rather than leaving a stale entry standing.
   *
   * Must be called BEFORE `baseFields` is replaced, exactly as
   * {@link rebasePending} must.
   */
  private isOwnAcknowledgedStage(
    fields: StageFormDraft,
    throughBatchId: number,
  ): boolean {
    let document: SectionDoc = cloneDoc(this.baseFields);
    for (const batch of this.snapshot.pendingCommands) {
      if (batch.id > throughBatchId) break;
      try {
        document = applyCommands(document, [...batch.commands]);
      } catch {
        return false;
      }
    }
    return canonicalize(document) === canonicalize(fields);
  }

  /**
   * The protocol sections with this session's own copy of the edited stage
   * moved to the document the host has just agreed to.
   *
   * The snapshot's stage section is the ONLY authoritative stage document a
   * caller can read, and two things read it: a compound edit naming the
   * document its stage commands will be applied to (`withStageSectionEdit`
   * hashes it, and a hash of a superseded document is refused), and
   * `protocolContext.orderedStages`, which is where a skip destination's list
   * and the names an auto-named stage must not collide with come from. Moving
   * the base without moving this leaves both a revision behind the host, so
   * they move together.
   *
   * A stage being CREATED is left out: the interview does not contain it, an
   * acknowledgement is not what puts it there, and a stage section outside the
   * stage order is a protocol issue rather than a stage anything can read.
   */
  private sectionsWithAuthoritativeStage(
    fields: StageFormDraft,
  ): Readonly<Record<string, SectionDoc>> {
    if (this.options.creation !== undefined)
      return this.snapshot.protocolSections;
    return {
      ...this.snapshot.protocolSections,
      [this.snapshot.editedSection.sectionId]: stageDocument(
        this.options.identity,
        fields,
      ),
    };
  }

  replaceAuthoritativeStage(
    params: Readonly<{
      fields: StageFormDraft;
      manifestRevision: ManifestRevision;
    }>,
  ): void {
    if (
      !acceptsAuthoritativeRevision(
        params.manifestRevision,
        this.snapshot.manifestRevision,
      )
    ) {
      return;
    }
    if (this.snapshot.pendingCommands.length !== 0) {
      throw new AuthoritativeConflictError();
    }
    assertNoIdentityFields(params.fields);
    this.baseFields = cloneDoc(params.fields);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.replaceSnapshot({
      fields: params.fields,
      protocolSections: this.sectionsWithAuthoritativeStage(params.fields),
      manifestRevision: params.manifestRevision,
      validation: pendingValidation(),
      validatedProtocol: null,
    });
    void this.runValidation();
  }

  setAccess(access: ProtocolBuilderAccess): void {
    const lostEditAccess =
      this.snapshot.access.mode === 'editable' && access.mode === 'readOnly';
    if (lostEditAccess) {
      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.historyGeneration += 1;
      this.fencedAtRevision = this.snapshot.manifestRevision;
      // The dropped batches take the hold with them: nothing is waiting for a
      // finish this session can no longer run.
      this.withheldFromBatchId = undefined;
      this.replaceSnapshot({
        access,
        fields: this.baseFields,
        pendingCommands: [],
        validation: pendingValidation(),
        validatedProtocol: null,
      });
      void this.runValidation();
      return;
    }
    this.replaceSnapshot({ access });
  }

  private applyLocalCommands(
    commands: readonly Command[],
    recordHistory: boolean,
  ): void {
    if (commands.length === 0) return;
    const previous = cloneDoc(this.snapshot.editedSection.fields);
    const fields = applyCommands(previous, [...commands]);
    if (canonicalize(previous) === canonicalize(fields)) return;
    if (recordHistory) {
      this.undoStack.push(previous);
      this.redoStack.length = 0;
    }
    const batch = Object.freeze({
      id: this.nextBatchId++,
      commands: Object.freeze([...commands]),
    });
    const withheld = this.withholdsFromHost(batch, fields);
    if (withheld) this.withheldFromBatchId ??= batch.id;
    this.replaceSnapshot({
      fields,
      pendingCommands: [...this.snapshot.pendingCommands, batch],
      validation: pendingValidation(),
      validatedProtocol: null,
    });
    // Validation runs whatever the host makes of the news. The edit is in the
    // draft either way, and a host that throws would otherwise leave the
    // session saying "validating" with nothing left to replace that — an
    // editor reading it either waits forever or acts on the verdict about the
    // draft before this edit. The host's own failure still reaches the caller,
    // because nothing here can resend a batch the host would not take.
    try {
      if (!withheld) this.options.onCommands?.(batch);
    } finally {
      void this.runValidation();
    }
  }

  /**
   * The edits a compound request should actually carry, and how much of this
   * session's unsaved work the host will own once it applies them.
   *
   * A researcher configuring a stage reaches for a related section IN THE
   * MIDDLE of that work — a name generator needs a node type that does not
   * exist yet, and the half-written prompts are exactly why they noticed. So
   * the request has to survive an unsaved, and usually incomplete, stage.
   *
   * What the session sends therefore depends on whether the request says
   * anything about this stage at all:
   *
   * - **It does not** — creating a node type, say. The request is sent alone,
   *   and this session's pending commands stay the researcher's own. Folding
   *   them in instead would make the host validate a stage the researcher is
   *   in the middle of writing, and refuse the codebook change in the schema's
   *   words for a stage they had not asked to save. Such an apply changes
   *   nothing about the stage, but it still answers with the stage the host
   *   holds — which, for a host that applies `onCommands` live, already
   *   contains some of those pending batches. Which of them is read off the
   *   answer rather than assumed: see `deliveredPrefixLength`.
   * - **It does** — then it has decided what the stage document becomes, and
   *   the researcher's unsaved commands have to go somewhere. The ones the
   *   host has not been given are folded in front of the request's own
   *   commands in that one section update, so both land in a single host apply
   *   and the request's own decision wins wherever the two touch the same key.
   *   The request's commands are rebased over that fold first, because a row
   *   command in them is a position in the list the CALLER was looking at, and
   *   the fold moves the rows under it.
   *
   * Which batches those are is DELIVERY, not evidence: a batch handed to
   * `onCommands` is the host's (see the option), so a session with one folds
   * nothing and a session without one folds everything. The stage edit is then
   * addressed at the document that leaves the host holding — this session's
   * base plus the batches it has delivered — because the caller cannot name
   * it: the only authoritative stage a caller can read is the one this session
   * has been TOLD about, and a live-applying host's acknowledgement of the
   * batch it is already holding arrives a round trip later. Reading the
   * caller's hash as evidence of the host's stage instead matched the
   * zero-length prefix throughout that window, folding in a batch the host had
   * and naming a document it no longer held: refused as stale, for a reason
   * nothing on the researcher's screen could explain.
   *
   * The caller's hash is still the staleness check it always was, asked before
   * the host is: a stage that is neither this session's base nor that base
   * plus a run of its own batches is a stage a collaborator has moved, and the
   * request is refused with `stale-base` — every pending batch untouched — for
   * the researcher to try again.
   *
   * One case still refuses outright: a pending batch withheld from a
   * live-applying host because it references a resource this session has
   * staged. Those bytes reach the protocol only when `finish` promotes them,
   * and neither sending that batch nor leaving the host to apply around it is
   * honest while its resource does not exist.
   */
  private planPendingCommands(request: CompoundEditRequest):
    | Readonly<{
        status: 'send';
        edits: readonly CompoundSectionEdit[];
        /**
         * Batches up to and including this id are FOLDED into this request,
         * and are the host's once it applies. `-1` precedes every batch id,
         * and means the request carries none of them — which is every request
         * to a host that has been given them already.
         */
        throughBatchId: number;
        /**
         * Batches up to and including this id were HANDED to the host before
         * this request went out, so it applied them before answering it (see
         * `onCommands`). `-1` for a host that has been given nothing.
         *
         * Delivery, not a reading: what the answer is read for is the batches
         * made while the request was in flight, which are the only ones
         * delivery cannot order against it.
         */
        deliveredThroughBatchId: number;
        /**
         * Whether the request says anything about the edited stage. When it
         * does, the stage the host answers with is the request's own decision;
         * when it does not, the host was asked to leave the stage alone, and
         * what comes back has to be reconciled against what this session
         * believes the host holds.
         */
        stageEdited: boolean;
        /**
         * The commands the stage edit carries AS SENT — rebased onto the
         * document the host will apply them to, which is what it applied to
         * whatever stage it was holding. `undefined` when the request says
         * nothing about this stage.
         */
        stageCommands?: readonly Command[];
      }>
    | Readonly<{
        status: 'refused';
        failure: Extract<CompoundEditResult, { status: 'failed' }>;
      }> {
    const stageSectionId = this.snapshot.editedSection.sectionId;
    // An update specifically: `validateCompoundEditRequest` has already
    // refused a structural create or removal of anything but a codebook
    // section, so a stage edit that reaches here is always an update.
    const stageEdit = request.edits.find(
      (edit): edit is Extract<CompoundSectionEdit, { kind: 'update' }> =>
        edit.sectionId === stageSectionId && edit.kind === 'update',
    );
    const stageEdited = stageEdit !== undefined;
    const pending = this.snapshot.pendingCommands;
    if (pending.length === 0) {
      return Object.freeze({
        status: 'send',
        edits: request.edits,
        throughBatchId: -1,
        deliveredThroughBatchId: -1,
        stageEdited,
        ...(stageEdit === undefined
          ? {}
          : { stageCommands: stageEdit.commands }),
      });
    }

    if (this.withheldFromBatchId !== undefined) {
      return Object.freeze({
        status: 'refused',
        failure: compoundFailure(
          'pending-commands',
          createMessageError(messages.compoundPendingCommands),
        ),
      });
    }

    // What the host is holding: the base plus every batch already handed over.
    const delivered = this.deliveredBatchCount(pending);
    const deliveredThroughBatchId = pending[delivered - 1]?.id ?? -1;

    if (stageEdit === undefined) {
      return Object.freeze({
        status: 'send',
        edits: request.edits,
        throughBatchId: -1,
        deliveredThroughBatchId,
        stageEdited,
      });
    }

    // The staleness check, before the host is asked: the document the request
    // was built from has to be one this session can account for — and WHICH
    // one it is, because the commands it carries are positions in that list.
    const identity = this.snapshot.editedSection.identity;
    const built = this.deliveredPrefixLength(
      pending,
      (candidate) =>
        contentHash(stageDocument(identity, candidate)) ===
        stageEdit.expectedContentHash,
    );
    if (built === null) {
      // The stage the request was built from is neither this session's base nor
      // that base with any run of its batches applied. Refused with the base,
      // the batches, the draft and the history exactly as they were.
      return Object.freeze({
        status: 'refused',
        failure: compoundFailure(
          'stale-base',
          createMessageError(messages.compoundStaleStage),
          stageSectionId,
        ),
      });
    }

    // What this update is addressed at, then: the stage the host is holding.
    // Only the batches it has not been given are folded in — and the request's
    // own commands land on the far side of that fold, so the document they
    // will be applied to is this session's base with every pending batch on
    // it, whichever of them the host already had.
    const held = this.stageWithBatches(pending.slice(0, delivered));
    const authored = this.stageWithBatches(pending.slice(0, built));
    const applied = this.stageWithBatches(pending);
    if (held === null || authored === null || applied === null) {
      return Object.freeze({
        status: 'refused',
        failure: compoundFailure(
          'stale-base',
          createMessageError(messages.compoundSentChangesStale),
          stageSectionId,
        ),
      });
    }
    const folded = pending.slice(delivered);
    // A caller writes a row command against the list it was looking at, which
    // is the last authoritative stage this session handed out: a batch behind
    // the host for a live one, every pending batch behind the fold for a
    // buffering one. Moving the address to `held` without moving the commands
    // landed each of them on whatever row had taken that position — a caller
    // removing the second of `[a, b]` removed the first, once a delivered
    // `insertItem` had made the list `[x, a, b]`. So they are rebased onto the
    // document they will be applied to, exactly as a pending batch is rebased
    // onto an arrival, and the request's own decision still wins wherever the
    // two touch the same key. A stage edit written against that document
    // already keeps its own command objects: `rebaseCommands` answers with
    // them when nothing it addresses has moved.
    const stageCommands = rebaseCommands(authored, applied, stageEdit.commands);
    const commands = Object.freeze([
      ...folded.flatMap((batch) => [...batch.commands]),
      ...stageCommands,
    ]);
    // Nothing left for the host to do about this stage: the researcher's own
    // batches have already carried out what the request asks for, and the host
    // is holding every one of them. That is not a request to send — a section
    // update carrying no commands is refused outright, and sending one took
    // the rest of the compound down with it, so a Section deleting its own row
    // and the codebook type behind it lost the type over a row that was
    // already gone.
    //
    // The stage edit is left out instead, which makes this a request that says
    // nothing about the stage — so the answer is reconciled the way every
    // other one that says nothing about it is: the host answers with the
    // batches it has applied, and they are acknowledged by content rather than
    // replayed.
    if (commands.length === 0) {
      const remaining = request.edits.filter((edit) => edit !== stageEdit);
      // Only reachable by hand: `withStageSectionEdit` adds a stage half to a
      // request that already edits a codebook section, so a stage edit never
      // travels alone. Refused rather than sent as an empty request.
      if (remaining.length === 0) {
        return Object.freeze({
          status: 'refused',
          failure: compoundFailure(
            'invalid-request',
            createMessageError(messages.compoundStageAlreadyApplied),
            stageSectionId,
          ),
        });
      }
      return Object.freeze({
        status: 'send',
        edits: remaining,
        throughBatchId: -1,
        deliveredThroughBatchId,
        stageEdited: false,
      });
    }
    return Object.freeze({
      status: 'send',
      edits: request.edits.map((edit) =>
        edit === stageEdit
          ? Object.freeze({
              ...stageEdit,
              expectedContentHash: contentHash(stageDocument(identity, held)),
              commands,
            })
          : edit,
      ),
      throughBatchId: folded[folded.length - 1]?.id ?? -1,
      deliveredThroughBatchId,
      stageEdited,
      stageCommands,
    });
  }

  /**
   * How many of these pending batches the host has been given.
   *
   * Delivery is what `onCommands` means — see the option — so a session with
   * one has handed over everything it has not withheld, and a session without
   * one has handed over nothing. A withheld batch never reached the host, and
   * neither did any after it.
   */
  private deliveredBatchCount(pending: readonly PendingCommandBatch[]): number {
    if (this.options.onCommands === undefined) return 0;
    const withheldFrom = this.withheldFromBatchId;
    if (withheldFrom === undefined) return pending.length;
    const held = pending.findIndex((batch) => batch.id >= withheldFrom);
    return held === -1 ? pending.length : held;
  }

  /**
   * This session's base with these batches applied, or `null` when one of them
   * no longer applies to it.
   */
  private stageWithBatches(
    batches: readonly PendingCommandBatch[],
  ): SectionDoc | null {
    try {
      return batches.reduce<SectionDoc>(
        (document, batch) => applyCommands(document, [...batch.commands]),
        cloneDoc(this.baseFields),
      );
    } catch {
      return null;
    }
  }

  /**
   * How many of these pending batches a host's stage already contains.
   *
   * A host receives the batches in order and applies them in order, so any
   * stage it holds is this session's base plus a PREFIX of them: none for a
   * session that hands it nothing until finish, all of them for one that hands
   * over every batch as it is made, and a leading run when a batch was made
   * while the request being answered was in flight. `null` means the stage is
   * none of those — it moved for a reason this session cannot account for.
   *
   * This is the reading of a stage that HAS COME BACK, where the evidence is.
   * What a request is addressed at on the way out is not a reading at all: a
   * batch handed to `onCommands` is the host's, and `deliveredBatchCount` says
   * how many that is. The one thing asked of this before a request is sent is
   * whether the document the caller built it from is one this session can
   * account for at all.
   *
   * Which stage is being asked about differs by path, so the caller says how to
   * recognise it: the codebook-only path compares the stage the host ANSWERED
   * with, a request carrying a stage edit compares that answer with its own
   * commands applied, and the pre-flight check compares the content hash the
   * request was BUILT from.
   *
   * `from` is the prefix the CONTRACT already settles — the batches handed
   * over before the request went out, which the host applied before answering
   * it. Shorter prefixes are not offered as readings of the answer, because
   * one of them matching would say the host had not applied a batch it was
   * given: two batches that cancel each other out make the base itself match
   * again, and reading that as "the host holds neither" leaves both pending
   * for a finish to send a second time.
   */
  /**
   * The outstanding batches, re-expressed against a base that has moved.
   *
   * A batch describes an EDIT the researcher made to the document they were
   * looking at. Replayed literally onto a base a collaborator has since changed,
   * an index in it addresses whatever row has moved into that position and a
   * whole-list `set` in it writes their rows back out of existence — which is
   * the same merge-blindness nested addressing was added to avoid, arriving one
   * step later.
   *
   * So each batch is rebased against the document it was made on, which this
   * session can always reconstruct: its own previous base with every earlier
   * batch applied. `rebaseCommands` decides what each command means against the
   * list that is there now.
   *
   * The rebased commands REPLACE the pending ones, because a batch that stays
   * pending is a batch the host has still to be given — at finish, or in the
   * fold of a later compound edit — and it has to describe the same edit the
   * draft on screen is showing. A batch nothing moved under keeps its own
   * command objects, so the common case is unchanged in every respect.
   *
   * A batch the rebase EMPTIED is dropped, along with the undo entry it would
   * have had. `rebaseCommands` refuses a command whose row the arrival has
   * already taken away — the researcher and a collaborator deleting the same
   * prompt — and for a batch of one that leaves nothing. Keeping the husk said
   * there was unsaved work where there was none, which is a claim other things
   * act on: `replaceAuthoritativeStage` refuses a stage while any batch is
   * pending. Its undo entry was worse, being a draft identical to the one on
   * screen: the history offered an undo that could not do anything, since
   * `applyLocalCommands` returns on an empty diff.
   *
   * Must be called BEFORE `baseFields` is replaced: the previous base is the
   * foot of the walk.
   */
  private rebasePending(
    base: SectionDoc,
    stillPending: (batch: PendingCommandBatch) => boolean,
  ): Readonly<{
    batches: PendingCommandBatch[];
    /** The draft before each rebased batch, in order: a rebase's undo entries. */
    steps: SectionDoc[];
    fields: SectionDoc;
  }> {
    const basisOf = new Map<number, SectionDoc>();
    let basis: SectionDoc | null = cloneDoc(this.baseFields);
    for (const batch of this.snapshot.pendingCommands) {
      if (basis === null) break;
      basisOf.set(batch.id, basis);
      try {
        basis = applyCommands(basis, [...batch.commands]);
      } catch {
        // A batch that no longer applies to the base it was made on says
        // nothing reliable about the ones after it, which are then replayed
        // exactly as they were — the behaviour this rebase replaces.
        basis = null;
      }
    }

    const batches: PendingCommandBatch[] = [];
    const steps: SectionDoc[] = [];
    let fields = cloneDoc(base);
    for (const batch of this.snapshot.pendingCommands) {
      if (!stillPending(batch)) continue;
      const basisDocument = basisOf.get(batch.id);
      const commands =
        basisDocument === undefined
          ? batch.commands
          : rebaseCommands(basisDocument, fields, batch.commands);
      // Nothing of this batch survived the rebase: it edits nothing, changes
      // no draft, and has no undo to offer.
      if (commands.length === 0) continue;
      const rebased =
        commands === batch.commands
          ? batch
          : Object.freeze({
              id: batch.id,
              commands: Object.freeze([...commands]),
            });
      batches.push(rebased);
      steps.push(cloneDoc(fields));
      fields = applyCommands(fields, [...rebased.commands]);
    }
    return { batches, steps, fields };
  }

  private deliveredPrefixLength(
    pending: readonly PendingCommandBatch[],
    isHostStage: (fields: SectionDoc) => boolean,
    from = 0,
  ): number | null {
    let document = cloneDoc(this.baseFields);
    if (from === 0 && isHostStage(document)) return 0;
    // Without an `onCommands` the host has been given nothing, so the base is
    // the only stage it can honestly be holding.
    if (this.options.onCommands === undefined) return null;
    for (const [index, batch] of pending.entries()) {
      // A withheld batch never reached the host, and neither did any after it.
      if (
        this.withheldFromBatchId !== undefined &&
        batch.id >= this.withheldFromBatchId
      ) {
        return null;
      }
      try {
        document = applyCommands(document, [...batch.commands]);
      } catch {
        // A batch that no longer applies to this base cannot describe the
        // difference between it and the host's stage.
        return null;
      }
      if (index + 1 >= from && isHostStage(document)) return index + 1;
    }
    return null;
  }

  /**
   * Whether a batch has to wait for finish: it puts a resource this session
   * has staged into one of the fields it touches, and that resource's manifest
   * entry does not exist until the finish promotion writes it.
   *
   * The fields are read for references the way validation reads them — from
   * the schema's own `assetReference` tags — so a stage type that gains a
   * resource field is covered as soon as its schema is tagged, and nothing
   * here has to know which field of which stage holds an asset id.
   *
   * A batch is judged on what it TOUCHES, which is why the editor's own rule
   * matters here: an edit made BECAUSE a staged resource was chosen has to
   * carry that choice, or the session sees only the consequence — a capability
   * cleared because the data file changed, naming no resource at all — and
   * lets it go while the file that explains it stays behind
   * (`useDiscardStageValues`). Everything after such a batch is covered
   * already, because the hold below is a suffix rather than a judgement of
   * each batch in turn.
   */
  private withholdsFromHost(
    batch: PendingCommandBatch,
    fields: StageFormDraft,
  ): boolean {
    // Once one batch is held, everything after it is held too: releasing them
    // out of order would let an acknowledgement of a later batch drop an
    // earlier one the host never saw.
    if (this.withheldFromBatchId !== undefined) return true;
    const staged = this.resources?.staged() ?? NO_STAGED_RESOURCES;
    if (staged.length === 0) return false;
    const stagedIds = new Set(staged.map((descriptor) => descriptor.id));
    // The top-level key each command reaches into, which is the depth a
    // resource reference is addressed at.
    const touched = new Set(
      batch.commands.map((command) => targetRoot(command.key)),
    );
    return collectStageResourceReferences(
      stageDocument(this.snapshot.editedSection.identity, fields),
    ).some(
      (reference) =>
        touched.has(String(reference.path[0])) &&
        stagedIds.has(reference.resourceId),
    );
  }

  /**
   * Forgets the batches a live-applying host never received, and the draft
   * they made — the cancel path, where the resources they reference have just
   * been discarded. The host's own view is untouched: it never had them.
   */
  private dropWithheldCommands(): void {
    const withheldFrom = this.withheldFromBatchId;
    if (withheldFrom === undefined) return;
    this.withheldFromBatchId = undefined;
    const pendingCommands = this.snapshot.pendingCommands.filter(
      (batch) => batch.id < withheldFrom,
    );
    const fields = pendingCommands.reduce<SectionDoc>(
      (doc, batch) => applyCommands(doc, [...batch.commands]),
      cloneDoc(this.baseFields),
    );
    this.replaceSnapshot({
      fields,
      pendingCommands,
      validation: pendingValidation(),
      validatedProtocol: null,
    });
    void this.runValidation();
  }

  /**
   * Moves the hold past everything a finish apply carried to the host.
   *
   * What the apply carried is a prefix of the pending batches, so the hold
   * either goes entirely (the host now has every withheld batch) or moves to
   * the first batch it did not carry — an edit made while the apply was in
   * flight. Those stay pending and withheld, in order, for the next finish to
   * carry: releasing them here would send them after batches the host already
   * has, and clearing the hold outright would let the batches that follow
   * overtake them.
   */
  private releaseWithheldThrough(carriedThroughBatchId: number): void {
    const withheldFrom = this.withheldFromBatchId;
    if (withheldFrom === undefined) return;
    this.withheldFromBatchId = this.snapshot.pendingCommands.find(
      (batch) => batch.id >= withheldFrom && batch.id > carriedThroughBatchId,
    )?.id;
  }

  /** Clears the hold once no withheld batch is pending any more. */
  private releaseWithheldFrom(
    pendingCommands: readonly PendingCommandBatch[],
  ): void {
    const withheldFrom = this.withheldFromBatchId;
    if (
      withheldFrom !== undefined &&
      pendingCommands.every((batch) => batch.id < withheldFrom)
    ) {
      this.withheldFromBatchId = undefined;
    }
  }

  private async runValidation(): Promise<ProtocolBuilderValidation> {
    const version = ++this.validationVersion;
    const draft = stageDocument(
      this.snapshot.editedSection.identity,
      this.snapshot.editedSection.fields,
    );
    const resolvable = this.resolvableResources();
    const resourceIssues = draftResourceIssues({
      stageDocument: draft,
      protocolSections: this.snapshot.protocolSections,
      stagedResourceIds: resolvable.map((descriptor) => descriptor.id),
      stageIndex: stageIndexForValidation(
        this.snapshot.protocolSections,
        this.snapshot.editedSection.identity.id,
      ),
    });
    const candidate = this.options.buildCandidate({
      stageDocument: draft,
      protocolSections: this.candidateProtocolSections(resolvable),
    });
    const result = await CurrentProtocolSchema.safeParseAsync(candidate);
    if (version !== this.validationVersion) return this.snapshot.validation;

    if (result.success && resourceIssues.length === 0) {
      const validation = validValidation();
      this.replaceSnapshot({
        validation,
        validatedProtocol: result.data,
      });
      return validation;
    }

    const schemaIssues = result.success
      ? []
      : result.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.map((segment) =>
            typeof segment === 'symbol' ? String(segment) : segment,
          ),
          message: issue.message,
        }));
    const validation: ProtocolBuilderValidation = Object.freeze({
      status: 'invalid',
      issues: attributeValidationIssues(
        mergeDraftValidationIssues(schemaIssues, resourceIssues),
        this.snapshot.protocolSections,
        this.snapshot.attribution,
        this.snapshot.manifestRevision,
      ),
    });
    this.replaceSnapshot({ validation, validatedProtocol: null });
    return validation;
  }

  /**
   * Resources the draft may reference even though the authoritative manifest
   * does not list them: everything staged here, plus everything this session
   * has already promoted but not yet seen come back in an authoritative
   * revision.
   */
  private resolvableResources(): readonly ResourceDescriptor[] {
    const resources = this.resources;
    if (resources === undefined) return NO_STAGED_RESOURCES;
    return [
      ...this.snapshot.stagedResources,
      ...resources.promotedAwaitingManifest(
        this.snapshot.protocolSections[sectionId({ kind: 'assets' })],
      ),
    ];
  }

  /**
   * The sections a candidate is built from: authoritative everywhere except
   * the manifest, which also carries the resources this session staged or has
   * just promoted, so a draft may reference one before the host's revision
   * lists it. The authoritative sections in the snapshot are left exactly as
   * the host sent them.
   */
  private candidateProtocolSections(
    resolvable: readonly ResourceDescriptor[],
  ): Readonly<Record<string, SectionDoc>> {
    const resources = this.resources;
    if (resolvable.length === 0 || resources === undefined) {
      return this.snapshot.protocolSections;
    }
    return Object.freeze({
      ...this.snapshot.protocolSections,
      [sectionId({ kind: 'assets' })]: assetsSectionForValidation(
        this.snapshot.protocolSections[sectionId({ kind: 'assets' })],
        resolvable,
        (resourceId) => resources.secretHandle(resourceId),
      ),
    });
  }

  private assertEditable(): void {
    if (this.snapshot.access.mode !== 'editable') {
      throw new SessionReadOnlyError();
    }
  }

  private assertCommandsDoNotOwnIdentity(commands: readonly Command[]): void {
    for (const command of commands) {
      // The ROOT of the path, not the whole address: a command reaching into
      // `id` is writing the stage's identity just as surely as one replacing
      // it, and the session owns that either way.
      const key = targetRoot(command.key);
      if (key === 'id' || key === 'type') {
        throw new StageIdentityCommandError(key);
      }
    }
  }

  private replaceSnapshot(
    update: Partial<{
      fields: StageFormDraft;
      protocolSections: Readonly<Record<string, SectionDoc>>;
      manifestRevision: ManifestRevision;
      access: ProtocolBuilderAccess;
      presence: readonly ProtocolBuilderPresence[];
      attribution: Readonly<Record<string, ChangeAttribution>>;
      pendingCommands: readonly PendingCommandBatch[];
      validation: ProtocolBuilderValidation;
      validatedProtocol: CurrentProtocol | null;
    }>,
  ): void {
    this.snapshot = this.makeSnapshot(
      {
        fields: update.fields ?? this.snapshot.editedSection.fields,
        protocolSections:
          update.protocolSections ?? this.snapshot.protocolSections,
        manifestRevision:
          update.manifestRevision ?? this.snapshot.manifestRevision,
        access: update.access ?? this.snapshot.access,
        presence: update.presence ?? this.snapshot.presence,
        attribution: update.attribution ?? this.snapshot.attribution,
        pendingCommands:
          update.pendingCommands ?? this.snapshot.pendingCommands,
        validation: update.validation ?? this.snapshot.validation,
        validatedProtocol:
          update.validatedProtocol === undefined
            ? this.snapshot.validatedProtocol
            : update.validatedProtocol,
      },
      this.snapshot,
    );
    for (const listener of this.listeners) listener();
  }

  private makeSnapshot(
    params: Readonly<{
      fields: StageFormDraft;
      protocolSections: Readonly<Record<string, SectionDoc>>;
      manifestRevision: ManifestRevision;
      access: ProtocolBuilderAccess;
      presence: readonly ProtocolBuilderPresence[];
      attribution: Readonly<Record<string, ChangeAttribution>>;
      pendingCommands: readonly PendingCommandBatch[];
      validation: ProtocolBuilderValidation;
      validatedProtocol: CurrentProtocol | null;
    }>,
    previous?: ProtocolBuilderSnapshot,
  ): ProtocolBuilderSnapshot {
    const protocolSections =
      previous?.protocolSections === params.protocolSections
        ? previous.protocolSections
        : Object.freeze({ ...params.protocolSections });
    const protocolContext =
      previous?.protocolSections === protocolSections
        ? previous.protocolContext
        : protocolContextFromSections(protocolSections);
    return Object.freeze({
      editedSection: Object.freeze({
        sectionId: sectionId({
          kind: 'stage',
          stageId: this.options.identity.id,
        }),
        identity: this.options.identity,
        fields: freezeDoc(params.fields),
        // Settled when the session opened and never moved by an edit: whether
        // this stage exists yet is the host's fact, not the draft's.
        ...(this.options.creation === undefined
          ? {}
          : { creation: Object.freeze({ ...this.options.creation }) }),
      }),
      protocolSections,
      protocolContext,
      manifestRevision: Object.freeze({ ...params.manifestRevision }),
      access: Object.freeze({ ...params.access }),
      presence: Object.freeze([...params.presence]),
      attribution: Object.freeze({ ...params.attribution }),
      pendingCommands: Object.freeze([...params.pendingCommands]),
      history: Object.freeze({
        canUndo: this.undoStack.length > 0,
        canRedo: this.redoStack.length > 0,
        generation: this.historyGeneration,
        ...(this.fencedAtRevision === undefined
          ? {}
          : { fencedAtRevision: this.fencedAtRevision }),
      }),
      validation: params.validation,
      validatedProtocol: params.validatedProtocol,
      // Read from the tracker rather than threaded through every snapshot
      // update: it is the one place that knows what this session staged.
      stagedResources: this.resources?.staged() ?? NO_STAGED_RESOURCES,
    });
  }
}

const NO_STAGED_RESOURCES: readonly ResourceDescriptor[] = Object.freeze([]);

type ManifestRevisionOrder = 'older' | 'same' | 'newer' | 'conflicting';

/**
 * Sequence order is authoritative only across unequal sequences. Equal
 * sequences identify the same revision iff their content hashes also match;
 * accepting an equal-sequence/different-hash fork would silently replace one
 * authoritative history with another.
 */
function revisionOrder(
  candidate: ManifestRevision,
  current: ManifestRevision,
): ManifestRevisionOrder {
  if (candidate.sequence < current.sequence) return 'older';
  if (candidate.sequence > current.sequence) return 'newer';
  return candidate.hash === current.hash ? 'same' : 'conflicting';
}

function acceptsAuthoritativeRevision(
  candidate: ManifestRevision,
  current: ManifestRevision,
): boolean {
  const order = revisionOrder(candidate, current);
  return order === 'same' || order === 'newer';
}

function assertNoIdentityFields(fields: StageFormDraft): void {
  if (Object.hasOwn(fields, 'id')) throw new StageIdentityCommandError('id');
  if (Object.hasOwn(fields, 'type'))
    throw new StageIdentityCommandError('type');
}

function pendingValidation(): ProtocolBuilderValidation {
  return Object.freeze({
    status: 'pending',
    issues: Object.freeze([]) as readonly [],
  });
}

function validValidation(): ProtocolBuilderValidation {
  return Object.freeze({
    status: 'valid',
    issues: Object.freeze([]) as readonly [],
  });
}

function validateCompoundEditRequest(
  request: CompoundEditRequest,
): Extract<CompoundEditResult, { status: 'failed' }> | null {
  if (request.id.trim() === '') {
    return compoundFailure(
      'invalid-request',
      createMessageError(compoundRequestMessages.requiresId),
    );
  }
  if (request.description.trim() === '') {
    return compoundFailure(
      'invalid-request',
      createMessageError(compoundRequestMessages.requiresDescription),
    );
  }
  if (request.edits.length === 0) {
    return compoundFailure(
      'invalid-request',
      createMessageError(compoundRequestMessages.touchesNothing),
    );
  }

  const touchedSections = new Set<ProtocolSectionId>();
  for (const edit of request.edits) {
    if (touchedSections.has(edit.sectionId)) {
      return compoundFailure(
        'invalid-request',
        createMessageError(compoundRequestMessages.duplicateSection),
        edit.sectionId,
      );
    }
    touchedSections.add(edit.sectionId);

    let ref: ReturnType<typeof parseSectionId>;
    try {
      ref = parseSectionId(edit.sectionId);
    } catch {
      return compoundFailure(
        'invalid-request',
        createMessageError(compoundRequestMessages.unknownSection),
        edit.sectionId,
      );
    }

    if (edit.kind === 'update') {
      if (
        typeof edit.expectedContentHash !== 'string' ||
        edit.expectedContentHash.trim() === ''
      ) {
        return compoundFailure(
          'invalid-request',
          createMessageError(compoundRequestMessages.updateNeedsHash),
          edit.sectionId,
        );
      }
      if (edit.commands.length === 0) {
        return compoundFailure(
          'invalid-request',
          createMessageError(compoundRequestMessages.updateNeedsCommands),
          edit.sectionId,
        );
      }
      if (
        ref.kind === 'stage' &&
        edit.commands.some((command) => {
          const key = targetRoot(command.key);
          return key === 'id' || key === 'type';
        })
      ) {
        return compoundFailure(
          'invalid-request',
          createMessageError(compoundRequestMessages.stageIdentityLocked),
          edit.sectionId,
        );
      }
      continue;
    }

    if (
      edit.kind === 'remove' &&
      (typeof edit.expectedContentHash !== 'string' ||
        edit.expectedContentHash.trim() === '')
    ) {
      return compoundFailure(
        'invalid-request',
        createMessageError(compoundRequestMessages.removalNeedsHash),
        edit.sectionId,
      );
    }

    if (
      ref.kind !== 'codebookNode' &&
      ref.kind !== 'codebookEdge' &&
      ref.kind !== 'codebookEgo'
    ) {
      return compoundFailure(
        'invalid-request',
        createMessageError(compoundRequestMessages.structuralSectionLocked),
        edit.sectionId,
      );
    }
  }
  return null;
}

function compoundFailure(
  reason: CompoundEditFailureReason,
  message: string,
  sectionIdValue?: ProtocolSectionId,
): Extract<CompoundEditResult, { status: 'failed' }> {
  return Object.freeze({
    status: 'failed',
    reason,
    message,
    ...(sectionIdValue === undefined ? {} : { sectionId: sectionIdValue }),
  });
}

function cloneValue(value: unknown): unknown {
  return structuredClone(value);
}

function cloneDoc(doc: StageFormDraft): SectionDoc {
  return structuredClone(doc);
}

function freezeDoc(doc: StageFormDraft): StageFormDraft {
  return Object.freeze(cloneDoc(doc));
}
