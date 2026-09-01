import {
  EdgeDefinitionSchema,
  EgoDefinitionSchema,
  NodeDefinitionSchema,
  type Variable,
  VariableSchema,
} from '@codaco/protocol-validation';
import {
  normalizeForComparison,
  VariableNameSchema,
} from '@codaco/shared-consts';
import {
  canonicalize,
  contentHash,
  type Command,
  type SectionDoc,
} from '@codaco/studio-sync/apply';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';
import type {
  CompoundEditRequest,
  CompoundEditResult,
  CompoundSectionEdit,
} from '../session.ts';

export type { CodebookSubject } from '../protocol-context.ts';

export type CodebookEntityDraft = Readonly<SectionDoc>;

/**
 * A variable form may be intentionally incomplete while it is open. In
 * particular, a selected validation rule whose value has been cleared remains
 * `null` so the schema can reject it rather than silently treating it as an
 * omitted rule.
 */
export type CodebookVariableDraft = Readonly<
  {
    name?: unknown;
    type?: unknown;
    validation?: Readonly<Record<string, unknown>> | null;
  } & Record<string, unknown>
>;

export type CodebookDraftIssue = Readonly<{
  path: readonly (string | number)[];
  message: string;
}>;

export class InvalidCodebookDraftError extends Error {
  readonly issues: readonly CodebookDraftIssue[];

  constructor(message: string, issues: readonly CodebookDraftIssue[]) {
    super(message);
    this.issues = Object.freeze([...issues]);
  }
}

export class DuplicateVariableIdError extends Error {
  constructor(variableId: string) {
    super(`Attribute record id "${variableId}" already exists`);
  }
}

export class DuplicateVariableNameError extends Error {
  constructor(name: string) {
    super(`Attribute with name "${name}" already exists`);
  }
}

export class MissingVariableError extends Error {
  constructor(variableId: string) {
    super(`Attribute record id "${variableId}" does not exist`);
  }
}

export class AuxiliaryDraftBusyError extends Error {
  constructor() {
    super('the auxiliary codebook draft is waiting for a submission');
  }
}

type EntityEditInput = Readonly<{
  requestId: string;
  description: string;
  subject: CodebookSubject;
}>;

export type CreateEntityEditInput = EntityEditInput &
  Readonly<{ draft: CodebookEntityDraft }>;

export type UpdateEntityEditInput = EntityEditInput &
  Readonly<{
    authoritativeDocument: SectionDoc;
    /** Only properties owned by the entity form. */
    draft: CodebookEntityDraft;
    unsetProperties?: readonly string[];
  }>;

export type RemoveEntityEditInput = EntityEditInput &
  Readonly<{ authoritativeDocument: SectionDoc }>;

type VariableEditInput = EntityEditInput &
  Readonly<{
    authoritativeDocument: SectionDoc;
    variableId: string;
  }>;

export type CreateVariableEditInput = VariableEditInput &
  Readonly<{
    draft: CodebookVariableDraft;
    /** The complete package read model used for protocol-global id checks. */
    protocolContext: ProtocolBuilderProtocolContext;
  }>;

export type UpdateVariableEditInput = VariableEditInput &
  Readonly<{
    draft: CodebookVariableDraft;
    /** Omit these properties from the prior variable before applying `draft`. */
    replaceProperties?: readonly string[];
  }>;

export type RemoveVariableEditInput = VariableEditInput;

const issuePath = (path: readonly PropertyKey[]): (string | number)[] =>
  path.map((part) => (typeof part === 'symbol' ? String(part) : part));

const invalidDraft = (
  message: string,
  issues: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): InvalidCodebookDraftError =>
  new InvalidCodebookDraftError(
    message,
    issues.map((issue) => ({
      path: issuePath(issue.path),
      message: issue.message,
    })),
  );

const cloneValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, child] of Object.entries(value)) {
      if (
        child === undefined ||
        typeof child === 'function' ||
        typeof child === 'symbol'
      ) {
        continue;
      }
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: cloneValue(child),
        writable: true,
      });
    }
    return result;
  }
  return value;
};

const cloneDocument = (
  document: Readonly<Record<string, unknown>>,
): SectionDoc => {
  const clone: SectionDoc = Object.create(null);
  for (const [key, value] of Object.entries(document)) {
    if (
      value === undefined ||
      typeof value === 'function' ||
      typeof value === 'symbol'
    ) {
      continue;
    }
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: cloneValue(value),
      writable: true,
    });
  }
  return clone;
};

const freezeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    for (const child of value) freezeValue(child);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeValue(child);
    return Object.freeze(value);
  }
  return value;
};

const frozenDocument = (
  document: Readonly<Record<string, unknown>>,
): Readonly<SectionDoc> => {
  const clone = cloneDocument(document);
  freezeValue(clone);
  return clone;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const defineOwn = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void => {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};

const assertNonEmpty = (value: string, label: string): void => {
  if (value === '') throw new Error(`${label} must be non-empty`);
};

export function sectionIdForCodebookSubject(
  subject: CodebookSubject,
): ProtocolSectionId {
  switch (subject.entity) {
    case 'node':
      return sectionId({ kind: 'codebookNode', typeId: subject.type });
    case 'edge':
      return sectionId({ kind: 'codebookEdge', typeId: subject.type });
    case 'ego':
      return sectionId({ kind: 'codebookEgo' });
  }
  throw new Error('unsupported codebook subject');
}

const validateEntityDocument = (
  subject: CodebookSubject,
  document: SectionDoc,
): void => {
  const result =
    subject.entity === 'node'
      ? NodeDefinitionSchema.safeParse(document)
      : subject.entity === 'edge'
        ? EdgeDefinitionSchema.safeParse(document)
        : EgoDefinitionSchema.safeParse(document);
  if (!result.success) {
    throw invalidDraft(
      'the codebook entity draft is invalid',
      result.error.issues,
    );
  }
};

const validateVariableDraft = (draft: CodebookVariableDraft): Variable => {
  const normalized = cloneDocument(draft);
  const result = VariableSchema.safeParse(normalized);
  if (!result.success) {
    throw invalidDraft('the variable draft is invalid', result.error.issues);
  }
  const optionIssue = categoricalOptionIssue(result.data);
  if (optionIssue !== null) {
    throw new InvalidCodebookDraftError(
      'the variable draft is invalid',
      Object.freeze([optionIssue]),
    );
  }
  return result.data;
};

const categoricalOptionIssue = (
  variable: Variable,
): CodebookDraftIssue | null => {
  if (variable.type !== 'categorical' && variable.type !== 'ordinal') {
    return null;
  }

  if (
    variable.options.some(
      ({ label, value }) => label.trim() === '' || value === '',
    )
  ) {
    return Object.freeze({
      path: Object.freeze(['options']),
      message: 'Every option needs both a label and a value.',
    });
  }

  const seen = new Set<string>();
  for (const option of variable.options) {
    // Export formats stringify option values into keys. A numeric 1 and text
    // "1" must therefore collide here even when a non-UI caller bypasses the
    // editor's numeric parser.
    const comparableValue = normalizeForComparison(String(option.value));
    if (seen.has(comparableValue)) {
      return Object.freeze({
        path: Object.freeze(['options']),
        message: 'Every option needs a unique value.',
      });
    }
    seen.add(comparableValue);
  }

  const labels = new Set<string>();
  for (const { label } of variable.options) {
    const comparableLabel = normalizeForComparison(label);
    if (labels.has(comparableLabel)) {
      return Object.freeze({
        path: Object.freeze(['options']),
        message: 'Every option needs a unique label.',
      });
    }
    labels.add(comparableLabel);
  }

  if (
    variable.options.some(
      ({ value }) => !VariableNameSchema.safeParse(String(value)).success,
    )
  ) {
    return Object.freeze({
      path: Object.freeze(['options']),
      message:
        'Not a valid option value. Only letters, numbers and the symbols ._-: are supported',
    });
  }
  return null;
};

const variablesFromDocument = (
  document: SectionDoc,
): Record<string, unknown> => {
  const variables = document.variables;
  if (variables === undefined) return Object.create(null);
  if (!isRecord(variables)) {
    throw new InvalidCodebookDraftError(
      'the authoritative codebook entity is invalid',
      Object.freeze([
        Object.freeze({
          path: Object.freeze(['variables']),
          message: 'Entity variables must be a record',
        }),
      ]),
    );
  }
  return cloneDocument(variables);
};

const commandsFromDocumentChange = (
  previous: SectionDoc,
  next: SectionDoc,
): readonly Command[] => {
  const commands: Command[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of [...keys].toSorted()) {
    if (!Object.hasOwn(next, key)) {
      commands.push(Object.freeze({ op: 'unset', key }));
      continue;
    }
    if (
      !Object.hasOwn(previous, key) ||
      canonicalize(previous[key]) !== canonicalize(next[key])
    ) {
      const value = cloneValue(next[key]);
      freezeValue(value);
      commands.push(Object.freeze({ op: 'set', key, value }));
    }
  }
  return Object.freeze(commands);
};

const request = (
  id: string,
  description: string,
  edit: CompoundSectionEdit,
): CompoundEditRequest => {
  assertNonEmpty(id, 'compound edit request id');
  assertNonEmpty(description, 'compound edit description');
  const immutableEdit = structuredClone(edit);
  freezeValue(immutableEdit);
  return Object.freeze({
    id,
    description,
    edits: Object.freeze([immutableEdit]),
  });
};

/**
 * Adds the current stage half of a nested codebook action without changing the
 * stable request id. The session and host still validate the complete request;
 * this helper makes the required stage + codebook shape explicit at the call
 * site and prevents a caller from accidentally touching the same section
 * twice.
 */
export function withStageSectionEdit(
  requestValue: CompoundEditRequest,
  stageSectionId: ProtocolSectionId,
  authoritativeStageDocument: Readonly<SectionDoc>,
  commands: readonly Command[],
): CompoundEditRequest {
  const ref = parseSectionId(stageSectionId);
  if (ref.kind !== 'stage') {
    throw new Error('the additional compound section must be a stage');
  }
  if (commands.length === 0) {
    throw new Error('the additional stage edit requires at least one command');
  }
  if (
    commands.some((command) => command.key === 'id' || command.key === 'type')
  ) {
    throw new Error('a compound stage edit cannot change stage identity');
  }
  if (requestValue.edits.some((edit) => edit.sectionId === stageSectionId)) {
    throw new Error('the compound request already edits this stage');
  }

  const stageEdit: CompoundSectionEdit = structuredClone({
    kind: 'update',
    sectionId: stageSectionId,
    expectedContentHash: contentHash(authoritativeStageDocument),
    commands,
  });
  freezeValue(stageEdit);
  const existingEdits = structuredClone(requestValue.edits);
  freezeValue(existingEdits);
  return Object.freeze({
    ...requestValue,
    edits: Object.freeze([...existingEdits, stageEdit]),
  });
}

export function buildCreateEntityRequest(
  input: CreateEntityEditInput,
): CompoundEditRequest {
  const document = cloneDocument(input.draft);
  if (!Object.hasOwn(document, 'variables')) {
    document.variables = Object.create(null);
  }
  validateEntityDocument(input.subject, document);
  return request(input.requestId, input.description, {
    kind: 'create',
    sectionId: sectionIdForCodebookSubject(input.subject),
    document: frozenDocument(document),
  });
}

export function buildUpdateEntityRequest(
  input: UpdateEntityEditInput,
): CompoundEditRequest {
  const next = cloneDocument(input.authoritativeDocument);
  for (const [key, value] of Object.entries(input.draft)) {
    // Variables have their own auxiliary editor and are never owned by the
    // entity-properties form. Keeping the authoritative map here prevents an
    // entity save from erasing nested or remotely added variables.
    if (key !== 'variables') defineOwn(next, key, cloneValue(value));
  }
  for (const key of input.unsetProperties ?? []) {
    if (key !== 'variables') delete next[key];
  }
  validateEntityDocument(input.subject, next);
  return request(input.requestId, input.description, {
    kind: 'update',
    sectionId: sectionIdForCodebookSubject(input.subject),
    expectedContentHash: contentHash(input.authoritativeDocument),
    commands: commandsFromDocumentChange(input.authoritativeDocument, next),
  });
}

export function buildRemoveEntityRequest(
  input: RemoveEntityEditInput,
): CompoundEditRequest {
  if (input.subject.entity === 'ego') {
    throw new Error('the ego codebook section cannot be removed');
  }
  return request(input.requestId, input.description, {
    kind: 'remove',
    sectionId: sectionIdForCodebookSubject(input.subject),
    expectedContentHash: contentHash(input.authoritativeDocument),
  });
}

const assertVariableNameAvailable = (
  variables: Readonly<Record<string, unknown>>,
  variable: Variable,
  excludedVariableId?: string,
): void => {
  for (const [variableId, candidate] of Object.entries(variables)) {
    if (
      variableId !== excludedVariableId &&
      isRecord(candidate) &&
      candidate.name === variable.name
    ) {
      throw new DuplicateVariableNameError(variable.name);
    }
  }
};

const variableIdExists = (
  context: ProtocolBuilderProtocolContext,
  variableId: string,
): boolean => {
  for (const definition of Object.values(context.codebook.node ?? {})) {
    if (Object.hasOwn(definition.variables ?? {}, variableId)) return true;
  }
  for (const definition of Object.values(context.codebook.edge ?? {})) {
    if (Object.hasOwn(definition.variables ?? {}, variableId)) return true;
  }
  return Object.hasOwn(context.codebook.ego?.variables ?? {}, variableId);
};

const variableUpdateRequest = (
  input: VariableEditInput,
  variables: Record<string, unknown>,
): CompoundEditRequest => {
  const next = cloneDocument(input.authoritativeDocument);
  next.variables = variables;
  validateEntityDocument(input.subject, next);
  const variablesValue = cloneValue(variables);
  freezeValue(variablesValue);
  return request(input.requestId, input.description, {
    kind: 'update',
    sectionId: sectionIdForCodebookSubject(input.subject),
    expectedContentHash: contentHash(input.authoritativeDocument),
    commands: Object.freeze([
      Object.freeze({
        op: 'set' as const,
        key: 'variables',
        value: variablesValue,
      }),
    ]),
  });
};

export function buildCreateVariableRequest(
  input: CreateVariableEditInput,
): CompoundEditRequest {
  assertNonEmpty(input.variableId, 'variable record id');
  if (variableIdExists(input.protocolContext, input.variableId)) {
    throw new DuplicateVariableIdError(input.variableId);
  }
  const variables = variablesFromDocument(input.authoritativeDocument);
  if (Object.hasOwn(variables, input.variableId)) {
    throw new DuplicateVariableIdError(input.variableId);
  }
  const variable = validateVariableDraft(input.draft);
  assertVariableNameAvailable(variables, variable);
  defineOwn(variables, input.variableId, cloneValue(variable));
  return variableUpdateRequest(input, variables);
}

export function buildUpdateVariableRequest(
  input: UpdateVariableEditInput,
): CompoundEditRequest {
  assertNonEmpty(input.variableId, 'variable record id');
  const variables = variablesFromDocument(input.authoritativeDocument);
  const current = variables[input.variableId];
  if (!Object.hasOwn(variables, input.variableId) || !isRecord(current)) {
    throw new MissingVariableError(input.variableId);
  }

  const nextVariable = cloneDocument(current);
  for (const key of input.replaceProperties ?? []) delete nextVariable[key];
  for (const [key, value] of Object.entries(input.draft)) {
    defineOwn(nextVariable, key, cloneValue(value));
  }
  const variable = validateVariableDraft(nextVariable);
  assertVariableNameAvailable(variables, variable, input.variableId);
  defineOwn(variables, input.variableId, cloneValue(variable));
  return variableUpdateRequest(input, variables);
}

export function buildRemoveVariableRequest(
  input: RemoveVariableEditInput,
): CompoundEditRequest {
  assertNonEmpty(input.variableId, 'variable record id');
  const variables = variablesFromDocument(input.authoritativeDocument);
  if (!Object.hasOwn(variables, input.variableId)) {
    throw new MissingVariableError(input.variableId);
  }
  delete variables[input.variableId];
  return variableUpdateRequest(input, variables);
}

export type AuxiliaryCodebookDraftStatus =
  | 'editing'
  | 'submitting'
  | 'awaiting-authoritative';

type UnappliedCompoundEditResult = Exclude<
  CompoundEditResult,
  Readonly<{ status: 'applied'; update: unknown }>
>;

export type AuxiliaryCodebookDraftFailure =
  | Readonly<{ kind: 'result'; result: UnappliedCompoundEditResult }>
  | Readonly<{ kind: 'error'; message: string }>;

export type AuxiliaryCodebookDraftSnapshot = Readonly<{
  authoritativeDocument: Readonly<SectionDoc> | null;
  draft: Readonly<SectionDoc>;
  status: AuxiliaryCodebookDraftStatus;
  authoritativeChanged: boolean;
  lastFailure: AuxiliaryCodebookDraftFailure | null;
}>;

/**
 * Host-neutral state for a nested codebook editor. It deliberately keeps an
 * invalid draft separate from the authoritative section document. A failed or
 * blocked submit never resets the draft, and an unrelated authoritative
 * update is recorded without attempting a generic rebase.
 */
export class AuxiliaryCodebookDraftSession {
  private readonly listeners = new Set<() => void>();
  private snapshot: AuxiliaryCodebookDraftSnapshot;

  constructor(
    initialDraft: Readonly<SectionDoc>,
    authoritativeDocument: Readonly<SectionDoc> | null = null,
  ) {
    this.snapshot = Object.freeze({
      authoritativeDocument:
        authoritativeDocument === null
          ? null
          : frozenDocument(authoritativeDocument),
      draft: frozenDocument(initialDraft),
      status: 'editing',
      authoritativeChanged: false,
      lastFailure: null,
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): AuxiliaryCodebookDraftSnapshot {
    return this.snapshot;
  }

  replaceDraft(draft: Readonly<SectionDoc>): void {
    if (this.snapshot.status !== 'editing') throw new AuxiliaryDraftBusyError();
    this.replaceSnapshot({
      draft: frozenDocument(draft),
      lastFailure: null,
    });
  }

  reset(): void {
    if (this.snapshot.status !== 'editing') throw new AuxiliaryDraftBusyError();
    if (this.snapshot.authoritativeDocument === null) return;
    this.replaceSnapshot({
      draft: frozenDocument(this.snapshot.authoritativeDocument),
      authoritativeChanged: false,
      lastFailure: null,
    });
  }

  receiveAuthoritative(document: Readonly<SectionDoc>): void {
    const authoritativeDocument = frozenDocument(document);
    if (this.snapshot.status === 'awaiting-authoritative') {
      this.replaceSnapshot({
        authoritativeDocument,
        draft: authoritativeDocument,
        status: 'editing',
        authoritativeChanged: false,
        lastFailure: null,
      });
      return;
    }

    if (this.snapshot.status === 'submitting') {
      this.replaceSnapshot({
        authoritativeDocument,
        authoritativeChanged: true,
      });
      return;
    }

    const dirty = this.isDirty();
    this.replaceSnapshot({
      authoritativeDocument,
      ...(dirty ? {} : { draft: authoritativeDocument }),
      authoritativeChanged: dirty,
    });
  }

  isDirty(): boolean {
    const authoritative = this.snapshot.authoritativeDocument;
    return (
      authoritative === null ||
      canonicalize(authoritative) !== canonicalize(this.snapshot.draft)
    );
  }

  async submit(
    buildRequest: (
      draft: Readonly<SectionDoc>,
      authoritativeDocument: Readonly<SectionDoc> | null,
    ) => CompoundEditRequest,
    onSubmit: (
      request: CompoundEditRequest,
    ) => Promise<CompoundEditResult> | CompoundEditResult,
  ): Promise<CompoundEditResult> {
    if (this.snapshot.status !== 'editing') throw new AuxiliaryDraftBusyError();
    const draft = frozenDocument(this.snapshot.draft);
    const authoritativeDocument = this.snapshot.authoritativeDocument;
    this.replaceSnapshot({ status: 'submitting', lastFailure: null });

    try {
      const result = await onSubmit(buildRequest(draft, authoritativeDocument));
      if (result.status === 'applied') {
        this.replaceSnapshot({
          status: 'awaiting-authoritative',
          lastFailure: null,
        });
      } else {
        this.replaceSnapshot({
          status: 'editing',
          lastFailure: Object.freeze({ kind: 'result', result }),
        });
      }
      return result;
    } catch (error: unknown) {
      this.replaceSnapshot({
        status: 'editing',
        lastFailure: Object.freeze({
          kind: 'error',
          message: error instanceof Error ? error.message : 'submission failed',
        }),
      });
      throw error;
    }
  }

  private replaceSnapshot(
    update: Partial<AuxiliaryCodebookDraftSnapshot>,
  ): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...update });
    for (const listener of this.listeners) listener();
  }
}
