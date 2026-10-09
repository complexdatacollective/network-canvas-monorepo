import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  EdgeDefinitionSchema,
  EgoDefinitionSchema,
  MINIMUM_VARIABLE_OPTIONS,
  NodeDefinitionSchema,
  type Variable,
  VariableSchema,
} from '@codaco/protocol-validation';
import {
  CodebookNameSchema,
  type ExportColumnVariable,
  normalizeCodebookName,
  normalizeForComparison,
} from '@codaco/shared-consts';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { exportColumnRefusals } from '../fields/variableNameRules.ts';
import {
  hasDuplicateLocalizedOptionLabels,
  isOptionLabelEmpty,
  isOptionValueEmpty,
} from '../form/arrayFields/optionCompleteness.ts';
import {
  asLocalizedString,
  localizedFromText,
  type ProtocolLocalization,
} from '../localization/localizedText.ts';
import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';
import { isOptionType } from '../sections/collectableTypes.ts';
import { codebookRefusalMessage } from './compoundFailureCopy.ts';

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
  minimumOptions: {
    id: 'protocolBuilder.option.minimumOptions',
    defaultMessage:
      'Requires a minimum of two options. If you need fewer options, consider using a boolean attribute.',
    description:
      'Shown under a list of options when the researcher tries to save an ordinal or categorical attribute with fewer than two of them. A boolean attribute is the codebook variable type that records a yes/no answer.',
  },
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
      'An option value cannot contain line breaks, tabs or other control characters.',
    description:
      'Refusal shown when an allowed answer’s stored value holds a character that cannot be stored in a value, such as a line break or a tab. Values may otherwise be written in any language or script, with spaces and punctuation.',
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

export const minimumOptionsMessage = messages.minimumOptions;

export class InvalidCodebookDraftError extends Error {
  readonly issues: readonly CodebookDraftIssue[];
  readonly refusal: string | undefined;

  constructor(
    message: string,
    issues: readonly CodebookDraftIssue[],
    refusal?: string,
  ) {
    super(message);
    this.issues = Object.freeze([...issues]);
    this.refusal = refusal;
  }
}

/**
 * A write refused because the export would put two things in one column. Its
 * words are written for the researcher and anchored at the name or the options
 * that cause the clash, wherever the write was made from.
 */
export class ExportColumnConflictError extends InvalidCodebookDraftError {
  declare readonly refusal: string;

  constructor(path: 'name' | 'options', message: string) {
    super(
      'the variable draft is invalid',
      [{ path: [path], message }],
      message,
    );
  }
}

export const draftRefusalMessage = (error: InvalidCodebookDraftError): string =>
  error.refusal ?? codebookRefusalMessage({ kind: 'invalidShape' });

const researcherIssue = (
  issue: CodebookDraftIssue,
): InvalidCodebookDraftError =>
  new InvalidCodebookDraftError(
    'the variable draft is invalid',
    Object.freeze([issue]),
    issue.message,
  );

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
  /** The protocol's languages, which a label seeded from the name is written in. */
  localization: ProtocolLocalization | undefined;
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

/**
 * The draft with the names in it as they will be stored. A name is trimmed and
 * put in Unicode canonical form here, before anything judges it, so a trailing
 * space or a decomposed accent is repaired once instead of being refused by one
 * rule and compared wrongly by another. Only strings are names: a numeric or
 * boolean option value is left as the editor parsed it.
 */
const withNormalizedVariableNames = (draft: SectionDoc): SectionDoc => {
  if (typeof draft.name === 'string') {
    draft.name = normalizeCodebookName(draft.name);
  }
  if (Array.isArray(draft.options)) {
    draft.options = draft.options.map((option: unknown) =>
      isRecord(option) && typeof option.value === 'string'
        ? { ...option, value: normalizeCodebookName(option.value) }
        : option,
    );
  }
  return draft;
};

const withNormalizedEntityName = (document: SectionDoc): SectionDoc => {
  if (typeof document.name === 'string') {
    document.name = normalizeCodebookName(document.name);
  }
  return document;
};

/**
 * `draft` with a label written from its name where it holds none.
 *
 * A node type or edge type needs participant-facing wording beside its name,
 * but the researcher names it first and may never word it separately, so the
 * name stands in — in the protocol's default language — until they do. Until
 * the protocol's languages are known nothing can be written, and the schema
 * refuses the missing label.
 */
export const withSeededLabel = <
  Draft extends Readonly<Record<string, unknown>>,
>(
  draft: Draft,
  localization: ProtocolLocalization | undefined,
): Draft => {
  if (localization === undefined) return draft;
  if (asLocalizedString(draft.label) !== undefined) return draft;
  const name =
    typeof draft.name === 'string' ? normalizeCodebookName(draft.name) : '';
  return name === ''
    ? draft
    : { ...draft, label: localizedFromText(localization, name) };
};

/**
 * An attribute `draft` with its name standing in for a label it does not
 * hold. An attribute's label is not translated, so it is plain text.
 */
export const withSeededVariableLabel = <
  Draft extends Readonly<Record<string, unknown>>,
>(
  draft: Draft,
): Draft => {
  if (typeof draft.label === 'string' && draft.label.trim() !== '') {
    return draft;
  }
  const name =
    typeof draft.name === 'string' ? normalizeCodebookName(draft.name) : '';
  return name === '' ? draft : { ...draft, label: name };
};

const validateVariableDraft = (draft: CodebookVariableDraft): Variable => {
  const normalized = withNormalizedVariableNames(cloneDocument(draft));
  const tooFew = tooFewOptionsIssue(normalized);
  if (tooFew !== null) throw researcherIssue(tooFew);
  const incomplete = incompleteOptionsIssue(normalized);
  if (incomplete !== null) throw researcherIssue(incomplete);
  const invalidValue = invalidOptionValueIssue(normalized);
  if (invalidValue !== null) throw researcherIssue(invalidValue);
  const duplicateValue = duplicateOptionValueIssue(normalized);
  if (duplicateValue !== null) throw researcherIssue(duplicateValue);
  const result = VariableSchema.safeParse(normalized);
  if (!result.success) {
    throw invalidDraft('the variable draft is invalid', result.error.issues);
  }
  const duplicateLabel = duplicateOptionLabelIssue(result.data);
  if (duplicateLabel !== null) throw researcherIssue(duplicateLabel);
  return result.data;
};

const tooFewOptionsIssue = (
  draft: Readonly<Record<string, unknown>>,
): CodebookDraftIssue | null => {
  if (typeof draft.type !== 'string' || !isOptionType(draft.type)) return null;
  const { options } = draft;
  if (Array.isArray(options) && options.length >= MINIMUM_VARIABLE_OPTIONS) {
    return null;
  }
  return Object.freeze({
    path: Object.freeze(['options']),
    message: createMessageError(messages.minimumOptions),
  });
};

/**
 * An option with no label in any language, or no value.
 *
 * Asked before the schema parses the draft, because an option that has lost
 * its last translation holds no label at all, and the schema's own refusal of
 * a missing key names a path rather than the half of the option to fill in.
 */
const incompleteOptionsIssue = (
  draft: Readonly<Record<string, unknown>>,
): CodebookDraftIssue | null => {
  if (typeof draft.type !== 'string' || !isOptionType(draft.type)) return null;
  const { options } = draft;
  if (!Array.isArray(options)) return null;
  const incomplete = options.some(
    (option: unknown) =>
      !isRecord(option) ||
      isOptionLabelEmpty(option.label) ||
      isOptionValueEmpty(option.value),
  );
  return incomplete
    ? Object.freeze({
        path: Object.freeze(['options']),
        message: createMessageError(messages.optionsIncomplete),
      })
    : null;
};

/**
 * Two options stored under one value.
 *
 * Asked before the schema parses the draft, because the schema refuses an
 * exact repeat with a message written for a protocol file rather than for the
 * researcher typing it. This check is the wider of the two: it also folds case
 * and Unicode form, as the row cell does while the researcher types, where the
 * schema compares values exactly (`optionValueKey`), so every draft the schema
 * would refuse for a repeat is refused here first.
 */
const duplicateOptionValueIssue = (
  draft: Readonly<Record<string, unknown>>,
): CodebookDraftIssue | null => {
  if (typeof draft.type !== 'string' || !isOptionType(draft.type)) return null;
  const { options } = draft;
  if (!Array.isArray(options)) return null;
  const seen = new Set<string>();
  for (const option of options) {
    if (!isRecord(option)) continue;
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
  return null;
};

const duplicateOptionLabelIssue = (
  variable: Variable,
): CodebookDraftIssue | null => {
  if (variable.type !== 'categorical' && variable.type !== 'ordinal') {
    return null;
  }

  // The write's own reading of the same question the row cell asks while the
  // researcher is typing. Not the same code — the cell compares one row
  // against its siblings (`isDuplicatedInColumn`), this compares a whole list
  // — and they agree for every label a protocol can hold, language by
  // language, which is what makes the refusal here the one the row already
  // showed rather than a second surprise. Asked here as well as there because
  // a caller writing straight to the codebook never met the cell.
  if (hasDuplicateLocalizedOptionLabels(variable.options)) {
    return Object.freeze({
      path: Object.freeze(['options']),
      message: createMessageError(messages.optionsDuplicateLabel),
    });
  }
  return null;
};

/**
 * An option value that is not a name the codebook can hold, such as one with
 * a tab or line break in it.
 *
 * Asked before the schema parses the draft, because the schema refuses the
 * same value with a message written for a protocol file rather than for the
 * researcher typing it.
 */
const invalidOptionValueIssue = (
  draft: Readonly<Record<string, unknown>>,
): CodebookDraftIssue | null => {
  if (typeof draft.type !== 'string' || !isOptionType(draft.type)) return null;
  const { options } = draft;
  if (!Array.isArray(options)) return null;
  const invalid = options.some(
    (option: unknown) =>
      isRecord(option) &&
      !CodebookNameSchema.safeParse(String(option.value)).success,
  );
  return invalid
    ? Object.freeze({
        path: Object.freeze(['options']),
        message: createMessageError(messages.optionsInvalidValue),
      })
    : null;
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
  const document = withNormalizedEntityName(
    cloneDocument(
      input.subject.entity === 'ego'
        ? input.draft
        : withSeededLabel(input.draft, input.localization),
    ),
  );
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
  withNormalizedEntityName(next);
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

const isExportOptionValue = (
  value: unknown,
): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

/**
 * The part of an attribute already in the codebook that its export columns
 * depend on. Read structurally, not through the schema: a codebook written
 * before names were relaxed, or by a collaborator's older Studio, must still
 * have its columns counted.
 */
const exportColumnVariableOf = (
  held: unknown,
): ExportColumnVariable | undefined => {
  if (
    !isRecord(held) ||
    typeof held.name !== 'string' ||
    typeof held.type !== 'string'
  ) {
    return undefined;
  }
  return {
    name: held.name,
    type: held.type,
    ...(Array.isArray(held.options)
      ? {
          options: held.options.flatMap((option: unknown) =>
            isRecord(option) && isExportOptionValue(option.value)
              ? [{ value: option.value }]
              : [],
          ),
        }
      : {}),
  };
};

const exportColumnRefusalsFor = (
  subject: CodebookSubject,
  variables: Readonly<Record<string, unknown>>,
  candidate: ExportColumnVariable,
  excludedVariableId?: string,
) =>
  exportColumnRefusals({
    entity: subject.entity,
    candidate,
    siblings: Object.entries(variables).flatMap(([variableId, held]) => {
      const sibling = exportColumnVariableOf(held);
      return variableId === excludedVariableId || sibling === undefined
        ? []
        : [sibling];
    }),
  });

/**
 * Refuses a write that would make the export put two things in one column: an
 * attribute named like a column a categorical attribute's option, a layout
 * attribute's position or the export itself already writes, or an option or
 * layout position that would land on another attribute's column. Judged on the
 * attribute as it will be stored, beside the others of the same type, so a
 * rename, a new option and a change of type are all asked the same question.
 *
 * Only a clash this write introduces is refused. A codebook written when names
 * were narrower can already hold one, and refusing every later save of the
 * attributes involved would stop the researcher changing anything but the
 * thing they are asked to fix.
 */
const assertNoExportColumnConflict = (
  subject: CodebookSubject,
  variables: Readonly<Record<string, unknown>>,
  variable: Variable,
  excludedVariableId?: string,
): void => {
  const held =
    excludedVariableId === undefined
      ? undefined
      : exportColumnVariableOf(variables[excludedVariableId]);
  const alreadyThere = new Set(
    held === undefined
      ? []
      : exportColumnRefusalsFor(
          subject,
          variables,
          held,
          excludedVariableId,
        ).map(({ message }) => message),
  );
  const introduced = exportColumnRefusalsFor(
    subject,
    variables,
    variable,
    excludedVariableId,
  ).find(({ message }) => !alreadyThere.has(message));
  if (introduced === undefined) return;
  throw new ExportColumnConflictError(
    introduced.origin.kind === 'option' ? 'options' : 'name',
    introduced.message,
  );
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
  const variable = validateVariableDraft(withSeededVariableLabel(input.draft));
  assertVariableNameAvailable(variables, variable);
  assertNoExportColumnConflict(input.subject, variables, variable);
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
 * So only what the editor owns comes across: `ownedProperties` are the
 * attribute's properties this submit set, and everything else — the
 * attribute's other properties, the other attributes, and the entity's own
 * properties — is whatever the host holds. An attribute is one record edited
 * through several surfaces, so carrying the whole of it would undo a
 * collaborator's rename on a save of the rules and their rules on a save of
 * the values, in each case from a surface that offers no control for what it
 * overwrote. Absent only from a CREATE, which authors the whole attribute.
 *
 * The name is re-checked against the authoritative attributes for the same
 * reason: the collaborator may have used it while this editor was open, and
 * the check the editor made was against a codebook that no longer exists.
 */
export function documentWithRebasedVariable(
  input: VariableEditInput &
    Readonly<{
      submittedDocument: SectionDoc;
      /** Absent where the submit creates the attribute, and so owns all of it. */
      ownedProperties?: readonly string[];
    }>,
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
  const variable = validateVariableDraft(
    input.ownedProperties === undefined
      ? submitted
      : variableWithOwnedProperties(
          variables,
          input.variableId,
          submitted,
          input.ownedProperties,
        ),
  );
  assertVariableNameAvailable(variables, variable, input.variableId);
  assertNoExportColumnConflict(
    input.subject,
    variables,
    variable,
    input.variableId,
  );
  defineOwn(variables, input.variableId, cloneValue(variable));
  return entityDocumentWithVariables(input, variables);
}

/**
 * The attribute as the host holds it, with one editor's own properties taken
 * across from what it submitted.
 *
 * A property the submit left off is one the editor cleared — the same
 * delete-then-write `documentWithUpdatedVariable` performs against
 * `replaceProperties` — so an owned property absent from the submitted record
 * is removed rather than kept.
 *
 * An attribute that is no longer there is one a collaborator deleted inside
 * this round trip. Writing it back would recreate it under them, so the save
 * is refused with the sentence `MissingVariableError` already carries.
 */
const variableWithOwnedProperties = (
  variables: Record<string, unknown>,
  variableId: string,
  submitted: Record<string, unknown>,
  ownedProperties: readonly string[],
): SectionDoc => {
  const current = variables[variableId];
  if (!Object.hasOwn(variables, variableId) || !isRecord(current)) {
    throw new MissingVariableError(variableId);
  }
  const next = cloneDocument(current);
  for (const property of ownedProperties) {
    if (Object.hasOwn(submitted, property)) {
      defineOwn(next, property, cloneValue(submitted[property]));
    } else delete next[property];
  }
  return next;
};

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
  assertNoExportColumnConflict(
    input.subject,
    variables,
    variable,
    input.variableId,
  );
  defineOwn(variables, input.variableId, cloneValue(variable));
  return entityDocumentWithVariables(input, variables);
}
