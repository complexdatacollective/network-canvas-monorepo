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
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';

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
 * purpose: 'the variable draft is invalid', 'the authoritative codebook entity
 * is invalid', 'Entity variables must be a record' and the `assertNonEmpty`
 * checks all report that a caller wired something wrong, and no researcher
 * action produces them.
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

export type CreateEntityEditInput = Readonly<{
  subject: CodebookSubject;
  draft: CodebookEntityDraft;
}>;

export type UpdateEntityEditInput = Readonly<{
  subject: CodebookSubject;
  authoritativeDocument: SectionDoc;
  /** Only properties owned by the entity form. */
  draft: CodebookEntityDraft;
  unsetProperties?: readonly string[];
}>;

type VariableEditInput = Readonly<{
  subject: CodebookSubject;
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

/** The whole section document a new node, edge or ego type is created from. */
export function documentForNewEntity(input: CreateEntityEditInput): SectionDoc {
  const document = cloneDocument(input.draft);
  if (!Object.hasOwn(document, 'variables')) {
    document.variables = Object.create(null);
  }
  validateEntityDocument(input.subject, document);
  return document;
}

/**
 * The authoritative section rewritten with the entity form's own properties.
 *
 * Variables have their own editor and are never owned by the entity form, so
 * the authoritative map is kept: an entity save must not erase a variable a
 * nested editor or a collaborator added.
 */
export function documentWithEntityProperties(
  input: UpdateEntityEditInput,
): SectionDoc {
  const next = cloneDocument(input.authoritativeDocument);
  for (const [key, value] of Object.entries(input.draft)) {
    if (key !== 'variables') defineOwn(next, key, cloneValue(value));
  }
  for (const key of input.unsetProperties ?? []) {
    if (key !== 'variables') delete next[key];
  }
  validateEntityDocument(input.subject, next);
  return next;
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

const entityDocumentWithVariables = (
  input: VariableEditInput,
  variables: Record<string, unknown>,
): SectionDoc => {
  const next = cloneDocument(input.authoritativeDocument);
  next.variables = variables;
  validateEntityDocument(input.subject, next);
  return next;
};

/** The authoritative section with one more attribute in its variable map. */
export function documentWithCreatedVariable(
  input: CreateVariableEditInput,
): SectionDoc {
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
  return entityDocumentWithVariables(input, variables);
}

/**
 * One editor's finished document, laid back over the section as the host holds
 * it NOW.
 *
 * A nested codebook editor assembles the whole section — the authoritative
 * document it was rendered from, with its one attribute written into it — and
 * the write that carries it takes the section's lock only at that moment. A
 * collaborator who wrote between the editor's last render and that acquire is
 * in the document the lock hands back and NOT in the one the editor built, so
 * submitting the editor's copy whole deletes their attribute without either
 * researcher seeing anything happen.
 *
 * So only the attribute the editor owns comes across. Everything else — other
 * attributes, and the entity's own properties — is whatever the host holds.
 * The name is re-checked against those attributes for the same reason: the
 * collaborator may have used it while this editor was open, and the check the
 * editor made was against a codebook that no longer exists.
 */
export function documentWithRebasedVariable(
  input: VariableEditInput & Readonly<{ submittedDocument: SectionDoc }>,
): SectionDoc {
  assertNonEmpty(input.variableId, 'variable record id');
  const submitted = variablesFromDocument(input.submittedDocument)[
    input.variableId
  ];
  // Absent — or not an attribute at all — is the editor handing back a
  // document that does not hold what it was opened on, which is the same
  // nothing-to-write-to that a deleted attribute is.
  if (!isRecord(submitted)) throw new MissingVariableError(input.variableId);
  const variables = variablesFromDocument(input.authoritativeDocument);
  const variable = validateVariableDraft(submitted);
  assertVariableNameAvailable(variables, variable, input.variableId);
  defineOwn(variables, input.variableId, cloneValue(variable));
  return entityDocumentWithVariables(input, variables);
}

/** The authoritative section with the draft laid over one of its attributes. */
export function documentWithUpdatedVariable(
  input: UpdateVariableEditInput,
): SectionDoc {
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
  return entityDocumentWithVariables(input, variables);
}
