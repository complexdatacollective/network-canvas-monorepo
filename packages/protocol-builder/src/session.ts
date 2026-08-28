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
  sectionId,
} from '@codaco/studio-sync/taxonomy';

import { isStageType } from './stage-types.ts';

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
      issues: readonly ProtocolValidationIssue[];
    }>;

export type ProtocolBuilderSnapshot = Readonly<{
  editedSection: Readonly<{
    sectionId: ProtocolSectionId;
    identity: StageIdentity;
    fields: StageFormDraft;
  }>;
  protocolSections: Readonly<Record<string, SectionDoc>>;
  manifestRevision: ManifestRevision;
  access: ProtocolBuilderAccess;
  presence: readonly ProtocolBuilderPresence[];
  attribution: Readonly<Record<string, ChangeAttribution>>;
  pendingCommands: readonly PendingCommandBatch[];
  history: ProtocolBuilderHistory;
  validation: ProtocolBuilderValidation;
  validatedProtocol: CurrentProtocol | null;
}>;

export type CompoundSectionEdit = Readonly<{
  sectionId: ProtocolSectionId;
  commands: readonly Command[];
}>;

export type CompoundEditRequest = Readonly<{
  description: string;
  edits: readonly CompoundSectionEdit[];
}>;

export type CompoundEditResult =
  | Readonly<{ status: 'applied'; revision: ManifestRevision }>
  | Readonly<{
      status: 'blocked';
      blockedSections: readonly Readonly<{
        sectionId: ProtocolSectionId;
        holder?: ProtocolBuilderPresence;
      }>[];
    }>
  | Readonly<{ status: 'failed'; message: string }>;

export type ProtocolCandidateContext = Readonly<{
  stageDocument: SectionDoc;
  protocolSections: Readonly<Record<string, SectionDoc>>;
}>;

export type FinishRequest = Readonly<{
  stageDocument: SectionDoc;
  validatedProtocol: CurrentProtocol;
  pendingCommands: readonly PendingCommandBatch[];
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
};

export type ProtocolBuilderSessionOptions = Readonly<{
  identity: StageIdentity;
  fields: StageFormDraft;
  protocolSections: Readonly<Record<string, SectionDoc>>;
  manifestRevision: ManifestRevision;
  access: ProtocolBuilderAccess;
  presence?: readonly ProtocolBuilderPresence[];
  attribution?: Readonly<Record<string, ChangeAttribution>>;
  buildCandidate(context: ProtocolCandidateContext): unknown;
  onCommands?(batch: PendingCommandBatch): void;
  onCompoundEdit?(
    request: CompoundEditRequest,
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

export class AuthoritativeConflictError extends Error {
  constructor() {
    super('cannot replace the edited section while local commands are pending');
  }
}

export function createStageIdentity(
  type: StageType,
  createId: () => string = () => globalThis.crypto.randomUUID(),
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

  constructor(options: ProtocolBuilderSessionOptions) {
    assertNoIdentityFields(options.fields);
    this.options = options;
    this.baseFields = cloneDoc(options.fields);
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
    if (this.options.onCompoundEdit === undefined) {
      return { status: 'failed', message: 'compound editing is unavailable' };
    }
    return this.options.onCompoundEdit(request);
  }

  async finish(): Promise<void> {
    this.assertEditable();
    const validation = await this.validate();
    const validatedProtocol = this.snapshot.validatedProtocol;
    if (validation.status !== 'valid' || validatedProtocol === null) {
      throw new InvalidProtocolDraftError(validation.issues);
    }
    await this.options.onFinish?.({
      stageDocument: stageDocument(
        this.snapshot.editedSection.identity,
        this.snapshot.editedSection.fields,
      ),
      validatedProtocol,
      pendingCommands: this.snapshot.pendingCommands,
    });
  }

  receiveAuthoritativeUpdate(update: AuthoritativeUpdate): void {
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
    assertNoIdentityFields(params.fields);
    this.baseFields = cloneDoc(params.fields);
    const pendingCommands = this.snapshot.pendingCommands.filter(
      (batch) => batch.id > params.throughBatchId,
    );
    const fields = pendingCommands.reduce<SectionDoc>(
      (doc, batch) => applyCommands(doc, [...batch.commands]),
      cloneDoc(this.baseFields),
    );
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
    this.replaceSnapshot({
      fields,
      pendingCommands: [...this.snapshot.pendingCommands, batch],
      validation: pendingValidation(),
      validatedProtocol: null,
    });
    this.options.onCommands?.(batch);
    void this.runValidation();
  }

  private async runValidation(): Promise<ProtocolBuilderValidation> {
    const version = ++this.validationVersion;
    const candidate = this.options.buildCandidate({
      stageDocument: stageDocument(
        this.snapshot.editedSection.identity,
        this.snapshot.editedSection.fields,
      ),
      protocolSections: this.snapshot.protocolSections,
    });
    const result = await CurrentProtocolSchema.safeParseAsync(candidate);
    if (version !== this.validationVersion) return this.snapshot.validation;

    if (result.success) {
      const validation = validValidation();
      this.replaceSnapshot({
        validation,
        validatedProtocol: result.data,
      });
      return validation;
    }

    const validation: ProtocolBuilderValidation = Object.freeze({
      status: 'invalid',
      issues: Object.freeze(
        result.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.map((segment) =>
            typeof segment === 'symbol' ? String(segment) : segment,
          ),
          message: issue.message,
        })),
      ),
    });
    this.replaceSnapshot({ validation, validatedProtocol: null });
    return validation;
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
    this.snapshot = this.makeSnapshot({
      fields: update.fields ?? this.snapshot.editedSection.fields,
      protocolSections:
        update.protocolSections ?? this.snapshot.protocolSections,
      manifestRevision:
        update.manifestRevision ?? this.snapshot.manifestRevision,
      access: update.access ?? this.snapshot.access,
      presence: update.presence ?? this.snapshot.presence,
      attribution: update.attribution ?? this.snapshot.attribution,
      pendingCommands: update.pendingCommands ?? this.snapshot.pendingCommands,
      validation: update.validation ?? this.snapshot.validation,
      validatedProtocol:
        update.validatedProtocol === undefined
          ? this.snapshot.validatedProtocol
          : update.validatedProtocol,
    });
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
  ): ProtocolBuilderSnapshot {
    return Object.freeze({
      editedSection: Object.freeze({
        sectionId: sectionId({
          kind: 'stage',
          stageId: this.options.identity.id,
        }),
        identity: this.options.identity,
        fields: freezeDoc(params.fields),
      }),
      protocolSections: Object.freeze({ ...params.protocolSections }),
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
    });
  }
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

function cloneValue(value: unknown): unknown {
  return structuredClone(value);
}

function cloneDoc(doc: StageFormDraft): SectionDoc {
  return structuredClone(doc);
}

function freezeDoc(doc: StageFormDraft): StageFormDraft {
  return Object.freeze(cloneDoc(doc));
}
