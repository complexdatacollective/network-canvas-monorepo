import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
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
  targetRoot,
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

/**
 * The refusals in this module a researcher can actually read.
 *
 * All of them cross a string-only contract — a `CodebookDraftIssue.message` or
 * an `Error.message` — so they are encoded with `createMessageError` and
 * decoded where they are rendered. The invariants around them stay English on
 * purpose: `AuxiliaryDraftBusyError`, 'the variable draft is invalid', 'the
 * authoritative codebook entity is invalid', 'Entity variables must be a
 * record', 'submission failed' and the `assertNonEmpty` checks all report that
 * a caller wired something wrong, and no researcher action produces them.
 */
const messages = defineMessages({
  optionsIncomplete: {
    id: 'protocolBuilder.codebookEditing.optionsIncomplete',
    defaultMessage: 'Every option needs both a label and a value.',
    description:
      'Refusal shown when a researcher saves an attribute whose list of allowed answers has a row with an empty label or an empty stored value. The label is what a participant reads; the value is what the export records.',
  },
  optionsDuplicateValue: {
    id: 'protocolBuilder.codebookEditing.optionsDuplicateValue',
    defaultMessage: 'Every option needs a unique value.',
    description:
      'Refusal shown when two allowed answers of one attribute would be stored under the same value, which the export cannot tell apart.',
  },
  optionsDuplicateLabel: {
    id: 'protocolBuilder.codebookEditing.optionsDuplicateLabel',
    defaultMessage: 'Every option needs a unique label.',
    description:
      'Refusal shown when two allowed answers of one attribute would read the same to a participant.',
  },
  optionsInvalidValue: {
    id: 'protocolBuilder.codebookEditing.optionsInvalidValue',
    defaultMessage:
      'Not a valid option value. Only letters, numbers and the symbols ._-: are supported',
    description:
      'Refusal shown when an allowed answer’s stored value holds characters the export formats cannot carry. The listed symbols are literal characters and must not be translated.',
  },
  duplicateVariableName: {
    id: 'protocolBuilder.codebookEditing.duplicateVariableName',
    defaultMessage: 'Attribute with name "{name}" already exists',
    description:
      'Refusal shown when a researcher names an attribute (a codebook variable) something another attribute of the same entity is already called. name is what they typed.',
  },
  missingVariable: {
    id: 'protocolBuilder.codebookEditing.missingVariable',
    defaultMessage: 'Attribute record id "{variableId}" does not exist',
    description:
      'Refusal shown when a save is submitted for an attribute (a codebook variable) that is no longer in the protocol — usually because a collaborator deleted it while this editor was open. variableId is the attribute’s stored record id, which the researcher does not choose.',
  },
});

export class InvalidCodebookDraftError extends Error {
  readonly issues: readonly CodebookDraftIssue[];

  constructor(message: string, issues: readonly CodebookDraftIssue[]) {
    super(message);
    this.issues = Object.freeze([...issues]);
  }
}

/**
 * Deliberately English. A variable's record id is minted by the host, never
 * typed or chosen by a researcher, and both throw sites check it against the
 * whole protocol before the editor is allowed to submit — so a collision means
 * the host handed the editor an id the codebook already holds. That is a
 * wiring defect to fix, not a refusal to translate.
 */
export class DuplicateVariableIdError extends Error {
  constructor(variableId: string) {
    super(`Attribute record id "${variableId}" already exists`);
  }
}

/**
 * A researcher reaches this by typing a name another attribute of the same
 * entity already has, so it is encoded and decoded where the editor shows it.
 */
export class DuplicateVariableNameError extends Error {
  constructor(name: string) {
    super(createMessageError(messages.duplicateVariableName, { name }));
  }
}

/**
 * A researcher reaches this too, though only through a collaborator: the
 * variable editor keeps submitting an update after the attribute it is editing
 * disappears from the authoritative document, so a concurrent delete surfaces
 * here rather than as a guard. Encoded for the same reason.
 */
export class MissingVariableError extends Error {
  constructor(variableId: string) {
    super(createMessageError(messages.missingVariable, { variableId }));
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

const hasSameDocumentContent = (
  left: Readonly<SectionDoc> | null,
  right: Readonly<SectionDoc> | null,
): boolean => {
  if (left === null || right === null) return left === right;
  return canonicalize(left) === canonicalize(right);
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
      message: createMessageError(messages.optionsIncomplete),
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
        message: createMessageError(messages.optionsDuplicateValue),
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
        message: createMessageError(messages.optionsDuplicateLabel),
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
      message: createMessageError(messages.optionsInvalidValue),
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
    commands.some((command) => {
      const key = targetRoot(command.key);
      return key === 'id' || key === 'type';
    })
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
  const normalizedName = normalizeForComparison(variable.name);
  for (const [variableId, candidate] of Object.entries(variables)) {
    if (
      variableId !== excludedVariableId &&
      isRecord(candidate) &&
      typeof candidate.name === 'string' &&
      normalizeForComparison(candidate.name) === normalizedName
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

/**
 * A refusal by the surface that asked for the edit, in words it wrote itself.
 *
 * Some things a researcher can ask for are legal to the schema, legal to the
 * host, and still wrong: an attribute whose committed rules require three
 * answers cannot be left with two options to choose from. Nothing downstream
 * refuses that — the codebook schema accepts it, and a host applying a compound
 * edit is not asked to reason about validation rules — so the surface that
 * knows about it has to say so.
 *
 * A separate status rather than a `failed` result, because the whole vocabulary
 * of `CompoundEditFailureReason` is about transport and authority: what went
 * wrong between the editor and the host. Reported as one of those, this arrives
 * carrying a sentence the researcher should read and a reason that means
 * something else, and `compoundFailureMessage` renders the reason — so the
 * contradiction is described as "This change could not be sent" and the
 * sentence explaining it is discarded. A status of its own is what lets the
 * copy module recognise a message that is already written for a researcher and
 * pass it through.
 *
 * NOT part of `CompoundEditResult`: a host answers that, and no host is being
 * asked to detect this.
 */
export type AuxiliaryCodebookContradiction = Readonly<{
  status: 'contradiction';
  /**
   * Researcher-facing, and shown verbatim: it names the rule and the values
   * that cannot both hold. `findDraftContradictions` writes these.
   */
  message: string;
}>;

/** What a submit hook may answer a nested codebook editor with. */
export type AuxiliaryCodebookSubmitResult =
  | CompoundEditResult
  | AuxiliaryCodebookContradiction;

export type AuxiliaryCodebookDraftFailure =
  | Readonly<{ kind: 'result'; result: UnappliedCompoundEditResult }>
  | Readonly<{ kind: 'contradiction'; message: string }>
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
  private authoritativeGeneration = 0;
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

  /** Returns whether the authoritative content, rather than its identity, changed. */
  receiveAuthoritative(document: Readonly<SectionDoc>): boolean {
    const authoritativeDocument = frozenDocument(document);
    if (
      hasSameDocumentContent(
        this.snapshot.authoritativeDocument,
        authoritativeDocument,
      )
    ) {
      return false;
    }
    this.authoritativeGeneration += 1;
    if (this.snapshot.status === 'awaiting-authoritative') {
      this.replaceSnapshot({
        authoritativeDocument,
        draft: authoritativeDocument,
        status: 'editing',
        authoritativeChanged: false,
        lastFailure: null,
      });
      return true;
    }

    if (this.snapshot.status === 'submitting') {
      this.replaceSnapshot({
        authoritativeDocument,
        authoritativeChanged: true,
      });
      return true;
    }

    const dirty = this.isDirty();
    const matchesDraft = hasSameDocumentContent(
      authoritativeDocument,
      this.snapshot.draft,
    );
    if (!dirty || matchesDraft) {
      this.replaceSnapshot({
        authoritativeDocument,
        draft: authoritativeDocument,
        authoritativeChanged: false,
        lastFailure: null,
      });
      return true;
    }

    this.replaceSnapshot({
      authoritativeDocument,
      authoritativeChanged: true,
    });
    return true;
  }

  isDirty(): boolean {
    const authoritative = this.snapshot.authoritativeDocument;
    return (
      authoritative === null ||
      !hasSameDocumentContent(authoritative, this.snapshot.draft)
    );
  }

  async submit(
    buildRequest: (
      draft: Readonly<SectionDoc>,
      authoritativeDocument: Readonly<SectionDoc> | null,
    ) => CompoundEditRequest,
    onSubmit: (
      request: CompoundEditRequest,
    ) => Promise<AuxiliaryCodebookSubmitResult> | AuxiliaryCodebookSubmitResult,
  ): Promise<AuxiliaryCodebookSubmitResult> {
    if (this.snapshot.status !== 'editing') throw new AuxiliaryDraftBusyError();
    const draft = frozenDocument(this.snapshot.draft);
    const authoritativeDocument = this.snapshot.authoritativeDocument;
    const authoritativeGeneration = this.authoritativeGeneration;
    this.replaceSnapshot({ status: 'submitting', lastFailure: null });

    try {
      const result = await onSubmit(buildRequest(draft, authoritativeDocument));
      // A contradiction keeps its own words. Recorded as a `result` failure it
      // would be read by `reason` and reported as a transport problem, and the
      // sentence saying which rule cannot hold would never be shown.
      const failure =
        result.status === 'applied'
          ? null
          : result.status === 'contradiction'
            ? Object.freeze({
                kind: 'contradiction' as const,
                message: result.message,
              })
            : Object.freeze({ kind: 'result' as const, result });
      if (
        this.settleWithPendingAuthoritative(
          draft,
          authoritativeGeneration,
          failure,
        )
      ) {
        return result;
      }
      if (result.status === 'applied') {
        this.replaceSnapshot({
          status: 'awaiting-authoritative',
          authoritativeChanged: false,
          lastFailure: null,
        });
      } else {
        this.replaceSnapshot({
          status: 'editing',
          lastFailure: failure,
        });
      }
      return result;
    } catch (error: unknown) {
      const failure = Object.freeze({
        kind: 'error' as const,
        message: error instanceof Error ? error.message : 'submission failed',
      });
      if (
        !this.settleWithPendingAuthoritative(
          draft,
          authoritativeGeneration,
          failure,
        )
      ) {
        this.replaceSnapshot({
          status: 'editing',
          lastFailure: failure,
        });
      }
      throw error;
    }
  }

  private settleWithPendingAuthoritative(
    submittedDraft: Readonly<SectionDoc>,
    submittedAuthoritativeGeneration: number,
    lastFailure: AuxiliaryCodebookDraftFailure | null,
  ): boolean {
    if (this.authoritativeGeneration === submittedAuthoritativeGeneration) {
      return false;
    }

    const currentAuthoritative = this.snapshot.authoritativeDocument;
    const reconciled = hasSameDocumentContent(
      currentAuthoritative,
      submittedDraft,
    );
    this.replaceSnapshot({
      ...(reconciled && currentAuthoritative !== null
        ? { draft: currentAuthoritative }
        : {}),
      status: 'editing',
      authoritativeChanged: !reconciled,
      lastFailure,
    });
    return true;
  }

  private replaceSnapshot(
    update: Partial<AuxiliaryCodebookDraftSnapshot>,
  ): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...update });
    for (const listener of this.listeners) listener();
  }
}
