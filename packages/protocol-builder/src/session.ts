import { v4 as uuid } from 'uuid';

import {
  CurrentProtocolSchema,
  type CurrentProtocol,
  type ProtocolValidationIssue,
  type StageType,
} from '@codaco/protocol-validation';
import {
  applyCommands,
  canonicalize,
  type Command,
  type SectionDoc,
} from '@codaco/studio-sync/apply';
import {
  type ProtocolSectionId,
  parseSectionId,
  sectionId,
} from '@codaco/studio-sync/taxonomy';

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
  stageIndexForValidation,
  type StagedResourceTracker,
} from './resources/lifecycle.ts';
import { collectStageResourceReferences } from './resources/references.ts';
import { isStageType } from './stage-types.ts';
import {
  attributeValidationIssues,
  type AttributedProtocolValidationIssue,
} from './validationAttribution.ts';

export type StageIdentity = Readonly<{ id: string; type: StageType }>;
export type StageFormDraft = Readonly<SectionDoc>;

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
   */
  cancel(): Promise<ResourceResult<undefined>>;
  /**
   * The session-scoped resource gateway, or `undefined` when the host opened
   * the session without one. The shell provides it to editors; nothing else
   * in the package reaches host storage.
   */
  getResourceGateway(): ProtocolBuilderResourceGateway | undefined;
};

export type ProtocolBuilderSessionOptions = Readonly<{
  identity: StageIdentity;
  fields: StageFormDraft;
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
   * A batch that puts a resource this session has staged into the draft is
   * withheld: its bytes are not in the protocol until finish promotes them, so
   * a host applying it live would commit a reference to a resource the
   * protocol does not have. That batch and every batch after it stay pending
   * — visible in {@link ProtocolBuilderSnapshot.pendingCommands}, so nothing
   * looks saved that is not — and reach the host in the finish apply, in
   * order, alongside the manifest commands from the same promotion. A cancel
   * drops them with the staging that made them unsendable. Batches naming only
   * committed resources are unaffected, as is a host that buffers instead of
   * applying live: it reads the same pending batches at finish either way.
   */
  onCommands?(batch: PendingCommandBatch): void;
  onCompoundEdit?(
    request: CompoundEditSubmission,
  ): Promise<CompoundEditResult> | CompoundEditResult;
  onFinish?(request: FinishRequest): Promise<void> | void;
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
 * A finish whose resource promotion was rolled back. Nothing was committed and
 * nothing was discarded, so the same finish can simply be tried again.
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

export function commandsFromDraftChange(
  previous: StageFormDraft,
  next: StageFormDraft,
): Command[] {
  assertNoIdentityFields(previous);
  assertNoIdentityFields(next);
  const commands: Command[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  for (const key of [...keys].toSorted()) {
    const before = previous[key];
    const after = next[key];
    if (after === undefined) {
      if (Object.hasOwn(previous, key) && before !== undefined) {
        commands.push({ op: 'unset', key });
      }
      continue;
    }
    if (
      !Object.hasOwn(previous, key) ||
      canonicalize(before) !== canonicalize(after)
    ) {
      commands.push({ op: 'set', key, value: cloneValue(after) });
    }
  }

  return commands;
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
  /** Held across a retried finish so a promotion cannot happen twice. */
  private promotionId: string | undefined;
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
    if (this.snapshot.pendingCommands.length !== 0) {
      return compoundFailure(
        'pending-commands',
        'save the current stage changes before editing related sections',
      );
    }
    if (this.options.onCompoundEdit === undefined) {
      return compoundFailure('unavailable', 'compound editing is unavailable');
    }
    if (this.compoundEditInFlight) {
      return compoundFailure(
        'compound-in-flight',
        'another compound edit is still in progress',
      );
    }

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
          error instanceof Error ? error.message : 'the compound edit failed',
        );
      }
      if (result.status !== 'applied') return result;

      const currentAccess = this.snapshot.access;
      if (currentAccess.mode !== 'editable') {
        return compoundFailure(
          'lease-lost',
          'editing access was lost before the compound edit completed',
        );
      }
      if (
        currentAccess.leaseOwner !== authority.leaseOwner ||
        currentAccess.leaseEpoch !== authority.leaseEpoch
      ) {
        return compoundFailure(
          'stale-epoch',
          'editing authority changed before the compound edit completed',
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
            ? 'the compound result conflicts with the loaded authoritative revision'
            : 'a newer authoritative protocol revision is already loaded',
        );
      }

      const stageSectionId = this.snapshot.editedSection.sectionId;
      const updatedStageDocument =
        result.update.protocolSections[stageSectionId];
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
              'the authoritative response changed the edited stage identity',
              stageSectionId,
            );
          }
          fields = updatedStage.fields;
        } catch {
          return compoundFailure(
            'invalid-response',
            'the authoritative response contains an invalid edited stage',
            stageSectionId,
          );
        }
      } else {
        return compoundFailure(
          'invalid-response',
          'the authoritative response omitted the current edited stage from its full protocol snapshot',
          stageSectionId,
        );
      }

      const pendingCommands = this.snapshot.pendingCommands;
      this.baseFields = cloneDoc(fields);
      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.historyGeneration += 1;
      this.fencedAtRevision = result.update.manifestRevision;
      const reconciledFields = pendingCommands.reduce<SectionDoc>(
        (draft, batch) => {
          this.undoStack.push(cloneDoc(draft));
          return applyCommands(draft, [...batch.commands]);
        },
        cloneDoc(this.baseFields),
      );
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
    const pendingCommands = this.snapshot.pendingCommands;
    const applyStage = async (
      resourceManifest?: ManifestApplyRequest,
    ): Promise<void> => {
      await this.options.onFinish?.({
        stageDocument: document,
        validatedProtocol,
        pendingCommands,
        ...(resourceManifest === undefined ? {} : { resourceManifest }),
      });
    };

    const resources = this.resources;
    if (resources === undefined) {
      await applyStage();
      return;
    }

    // Stable across a retried finish so an uncertain promotion happens once,
    // and released as soon as one succeeds so the next finish is its own.
    this.promotionId ??= uuid({});
    const outcome = await finishStagedResources({
      gateway: resources.gateway,
      promotionId: this.promotionId,
      stageDocument: document,
      staged: resources.staged(),
      secretHandle: (resourceId) => resources.secretHandle(resourceId),
      applyStage,
    });

    if (outcome.status === 'apply-failed') throw outcome.error;
    if (outcome.status === 'promotion-failed') {
      throw new ResourcePromotionError(outcome.failure);
    }
    this.promotionId = undefined;
    // The apply carried every pending batch, withheld ones included, so the
    // host is no longer missing anything and later batches flow live again.
    this.withheldFromBatchId = undefined;
    resources.finished();
  }

  async cancel(): Promise<ResourceResult<undefined>> {
    const resources = this.resources;
    if (resources === undefined) {
      return Object.freeze({ status: 'ok', data: undefined });
    }
    const result = await resources.cancel();
    if (result.status === 'ok') this.dropWithheldCommands();
    return result;
  }

  getResourceGateway(): ProtocolBuilderResourceGateway | undefined {
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
    this.baseFields = cloneDoc(params.fields);
    const pendingCommands = this.snapshot.pendingCommands.filter(
      (batch) => batch.id > params.throughBatchId,
    );
    const fields = pendingCommands.reduce<SectionDoc>(
      (doc, batch) => applyCommands(doc, [...batch.commands]),
      cloneDoc(this.baseFields),
    );
    this.releaseWithheldFrom(pendingCommands);
    this.replaceSnapshot({
      fields,
      pendingCommands,
      manifestRevision: params.manifestRevision,
      attribution: params.attribution ?? this.snapshot.attribution,
      validation: pendingValidation(),
      validatedProtocol: null,
    });
    void this.runValidation();
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
    if (!withheld) this.options.onCommands?.(batch);
    void this.runValidation();
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
    const touched = new Set(batch.commands.map((command) => command.key));
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
      if (command.key === 'id' || command.key === 'type') {
        throw new StageIdentityCommandError(command.key);
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
      'a compound edit requires a stable request id',
    );
  }
  if (request.description.trim() === '') {
    return compoundFailure(
      'invalid-request',
      'a compound edit requires a description',
    );
  }
  if (request.edits.length === 0) {
    return compoundFailure(
      'invalid-request',
      'a compound edit must touch at least one section',
    );
  }

  const touchedSections = new Set<ProtocolSectionId>();
  for (const edit of request.edits) {
    if (touchedSections.has(edit.sectionId)) {
      return compoundFailure(
        'invalid-request',
        'a compound edit may touch each section only once',
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
        'a compound edit contains an unknown section id',
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
          'a compound section update requires an expected content hash',
          edit.sectionId,
        );
      }
      if (edit.commands.length === 0) {
        return compoundFailure(
          'invalid-request',
          'a compound section update requires at least one command',
          edit.sectionId,
        );
      }
      if (
        ref.kind === 'stage' &&
        edit.commands.some(
          (command) => command.key === 'id' || command.key === 'type',
        )
      ) {
        return compoundFailure(
          'invalid-request',
          'stage identity fields cannot be changed by a compound edit',
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
        'a compound section removal requires an expected content hash',
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
        'only codebook sections can be structurally created or removed',
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
