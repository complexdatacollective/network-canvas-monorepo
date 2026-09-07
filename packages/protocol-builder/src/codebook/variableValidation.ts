import {
  createMessageError,
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
  type MessageErrorValues,
} from '@codaco/app-i18n/messages';
import {
  findValidationContradictions,
  VARIABLE_REFERENCE_VALIDATIONS,
  VARIABLE_TYPE_COMPONENTS,
  VARIABLE_TYPE_VALIDATIONS,
  type ValidationContradiction,
  type ValidationName,
} from '@codaco/protocol-validation';

import type { CodebookSubject } from '../protocol-context.ts';
import {
  hasConflictingUse as roleMapHasConflictingUse,
  type VariableRoleMap,
  type WriterClass,
} from './variableRoles.ts';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordWith = (
  source: Readonly<UnknownRecord>,
  key: string,
  value: unknown,
): UnknownRecord =>
  Object.fromEntries([...Object.entries(source), [key, value]]);

const PASSPHRASE_VALIDATIONS = [
  'minLength',
  'maxLength',
] as const satisfies readonly ValidationName[];

const NUMBER_RULES = new Set<string>([
  'minLength',
  'maxLength',
  'minValue',
  'maxValue',
  'minSelected',
  'maxSelected',
]);

const VALUELESS_RULES = new Set<string>(['required', 'unique']);

/**
 * What each validation rule is called, keyed by the schema's own name for it
 * so a rule the schema adds is named here or nowhere.
 *
 * These are the words on the checkbox a researcher ticks, and the words quoted
 * back at them when the rule they ticked has no value yet.
 */
const VALIDATION_LABELS = defineMessages({
  required: {
    id: 'protocolBuilder.variableValidation.requiredLabel',
    defaultMessage: 'Required',
    description:
      'Name of the validation rule that refuses an answer left blank. Shown as the label of the checkbox that turns the rule on.',
  },
  unique: {
    id: 'protocolBuilder.variableValidation.uniqueLabel',
    defaultMessage: 'Must be unique',
    description:
      'Name of the validation rule that refuses an answer another network member has already given for this attribute.',
  },
  minLength: {
    id: 'protocolBuilder.variableValidation.minLengthLabel',
    defaultMessage: 'Minimum length',
    description:
      'Name of the validation rule setting the fewest characters an answer may have.',
  },
  maxLength: {
    id: 'protocolBuilder.variableValidation.maxLengthLabel',
    defaultMessage: 'Maximum length',
    description:
      'Name of the validation rule setting the most characters an answer may have.',
  },
  minValue: {
    id: 'protocolBuilder.variableValidation.minValueLabel',
    defaultMessage: 'Minimum value',
    description:
      'Name of the validation rule setting the smallest number an answer may be.',
  },
  maxValue: {
    id: 'protocolBuilder.variableValidation.maxValueLabel',
    defaultMessage: 'Maximum value',
    description:
      'Name of the validation rule setting the largest number an answer may be.',
  },
  minSelected: {
    id: 'protocolBuilder.variableValidation.minSelectedLabel',
    defaultMessage: 'Minimum selected',
    description:
      'Name of the validation rule setting the fewest options a participant must choose.',
  },
  maxSelected: {
    id: 'protocolBuilder.variableValidation.maxSelectedLabel',
    defaultMessage: 'Maximum selected',
    description:
      'Name of the validation rule setting the most options a participant may choose.',
  },
  differentFrom: {
    id: 'protocolBuilder.variableValidation.differentFromLabel',
    defaultMessage: 'Different from',
    description:
      'Name of the validation rule requiring this attribute’s answer to differ from another attribute’s. The attribute compared against is chosen in a control beneath.',
  },
  sameAs: {
    id: 'protocolBuilder.variableValidation.sameAsLabel',
    defaultMessage: 'Same as',
    description:
      'Name of the validation rule requiring this attribute’s answer to match another attribute’s. The attribute compared against is chosen in a control beneath.',
  },
  lessThanVariable: {
    id: 'protocolBuilder.variableValidation.lessThanVariableLabel',
    defaultMessage: 'Less than',
    description:
      'Name of the validation rule requiring this attribute’s answer to be smaller than another attribute’s. The attribute compared against is chosen in a control beneath.',
  },
  greaterThanVariable: {
    id: 'protocolBuilder.variableValidation.greaterThanVariableLabel',
    defaultMessage: 'Greater than',
    description:
      'Name of the validation rule requiring this attribute’s answer to be larger than another attribute’s. The attribute compared against is chosen in a control beneath.',
  },
  lessThanOrEqualToVariable: {
    id: 'protocolBuilder.variableValidation.lessThanOrEqualToVariableLabel',
    defaultMessage: 'Less than or equal to',
    description:
      'Name of the validation rule requiring this attribute’s answer to be no larger than another attribute’s. The attribute compared against is chosen in a control beneath.',
  },
  greaterThanOrEqualToVariable: {
    id: 'protocolBuilder.variableValidation.greaterThanOrEqualToVariableLabel',
    defaultMessage: 'Greater than or equal to',
    description:
      'Name of the validation rule requiring this attribute’s answer to be no smaller than another attribute’s. The attribute compared against is chosen in a control beneath.',
  },
}) satisfies Partial<Record<ValidationName, MessageDescriptor>>;

const messages = defineMessages({
  requirementsHeading: {
    id: 'protocolBuilder.variableValidation.requirementsHeading',
    defaultMessage: 'Requirements',
    description:
      'Heading over the validation rules that say an answer must be given at all, rather than what it may contain.',
  },
  limitsHeading: {
    id: 'protocolBuilder.variableValidation.limitsHeading',
    defaultMessage: 'Limits',
    description:
      'Heading over the validation rules that bound an answer by a number the researcher types — a length, a value, or how many options may be chosen.',
  },
  comparisonsHeading: {
    id: 'protocolBuilder.variableValidation.comparisonsHeading',
    defaultMessage: 'Compare to another attribute',
    description:
      'Heading over the validation rules that judge this attribute’s answer against another attribute’s. "Attribute" is a codebook variable.',
  },
  incompleteReferenceRule: {
    id: 'protocolBuilder.variableValidation.incompleteReferenceRule',
    defaultMessage:
      'Choose a comparison attribute for "{label}", or switch the rule off.',
    description:
      'Refusal shown when a rule comparing this attribute against another one has been switched on without saying which. label is that rule’s own name, already translated.',
  },
  incompleteValueRule: {
    id: 'protocolBuilder.variableValidation.incompleteValueRule',
    defaultMessage: 'Enter a value for "{label}", or switch the rule off.',
    description:
      'Refusal shown when a rule that needs a number has been switched on without one. label is that rule’s own name, already translated.',
  },
  wholeNumberRule: {
    id: 'protocolBuilder.variableValidation.wholeNumberRule',
    defaultMessage: '{rule} must be a whole number',
    description:
      'Refusal shown when a rule counting characters or choices was given a fraction. rule is the schema’s own name for the rule, such as minValue, and is not translated.',
  },
  ruleFloor: {
    id: 'protocolBuilder.variableValidation.ruleFloor',
    defaultMessage: '{rule} must be at least {floor, number}',
    description:
      'Refusal shown when a counting rule was given a number below what it allows. rule is the schema’s own name for the rule, such as maxSelected, and is not translated; floor is the smallest number it accepts.',
  },
  validatedElsewhere: {
    id: 'protocolBuilder.variableValidation.validatedElsewhere',
    defaultMessage:
      '"{variableName}" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    description:
      'Refusal shown when a stage that writes an attribute without checking it picks one that a form elsewhere in the protocol collects with validation. variableName is the researcher’s own name for the attribute. A stage is one step of an interview.',
  },
  unvalidatedElsewhere: {
    id: 'protocolBuilder.variableValidation.unvalidatedElsewhere',
    defaultMessage:
      '"{variableName}" is written without validation by another stage, so it cannot be used as a form field',
    description:
      'Refusal shown when a form field picks an attribute that another stage already writes without checking it. variableName is the researcher’s own name for the attribute. A stage is one step of an interview.',
  },
  draftValidatedElsewhere: {
    id: 'protocolBuilder.variableValidation.draftValidatedElsewhere',
    defaultMessage:
      '"{variableName}" is collected by this stage\'s form, so it cannot be assigned by this prompt (values assigned here would bypass its validation)',
    description:
      'The same refusal as validatedElsewhere, when the form doing the collecting belongs to the stage being edited. variableName is the researcher’s own name for the attribute. A prompt is the question a participant reads.',
  },
  draftUnvalidatedElsewhere: {
    id: 'protocolBuilder.variableValidation.draftUnvalidatedElsewhere',
    defaultMessage:
      '"{variableName}" is assigned without validation by a prompt in this stage, so it cannot be used as a form field',
    description:
      'The same refusal as unvalidatedElsewhere, when the writer without validation is a prompt in the stage being edited. variableName is the researcher’s own name for the attribute. A prompt is the question a participant reads.',
  },
});

const startCase = (value: string): string => {
  const words = value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words === ''
    ? ''
    : `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`;
};

const validationLabelMessage = (
  validation: string,
): MessageDescriptor | undefined => {
  const labels: Record<string, MessageDescriptor | undefined> =
    VALIDATION_LABELS;
  return labels[validation];
};

/**
 * The name of one validation rule.
 *
 * The `startCase` fallback stays English on purpose: it start-cases a schema
 * token this package has no name for, so what it produces is the token made
 * readable rather than copy anyone wrote. A rule the schema adds should gain a
 * descriptor above, not a translation of `minSomething`.
 */
export const getValidationLabel = (
  validation: string,
  intl: IntlShape,
): string => {
  const message = validationLabelMessage(validation);
  return message === undefined
    ? startCase(validation)
    : intl.formatMessage(message);
};

export const isValidationWithoutValue = (validation: string): boolean =>
  VALUELESS_RULES.has(validation);

export const isValidationWithNumberValue = (validation: string): boolean =>
  NUMBER_RULES.has(validation);

export const isValidationWithListValue = (validation: string): boolean =>
  VARIABLE_REFERENCE_VALIDATIONS.some((key) => key === validation);

export type ValidationOption = Readonly<{
  label: string;
  value: ValidationName;
}>;

export type ValidationGroup = Readonly<{
  id: 'requirements' | 'limits' | 'comparisons';
  heading: string;
  rules: readonly ValidationOption[];
}>;

const isValidationName = (value: string): value is ValidationName =>
  isValidationWithoutValue(value) ||
  isValidationWithNumberValue(value) ||
  isValidationWithListValue(value);

const validationNamesFor = (variableType: string): ValidationName[] => {
  if (variableType === 'passphrase') return [...PASSPHRASE_VALIDATIONS];
  const entry = Object.entries(VARIABLE_TYPE_VALIDATIONS).find(
    ([candidate]) => candidate === variableType,
  );
  return entry === undefined
    ? []
    : Object.keys(entry[1]).filter(isValidationName);
};

export const getValidationOptionsForVariableType = (
  variableType: string,
  entity: string,
  intl: IntlShape,
): ValidationOption[] =>
  validationNamesFor(variableType)
    .filter((validation) => entity !== 'ego' || validation !== 'unique')
    .map((validation) => ({
      label: getValidationLabel(validation, intl),
      value: validation,
    }));

const VALIDATION_GROUPS = [
  {
    id: 'requirements' as const,
    heading: messages.requirementsHeading,
    includes: isValidationWithoutValue,
  },
  {
    id: 'limits' as const,
    heading: messages.limitsHeading,
    includes: isValidationWithNumberValue,
  },
  {
    id: 'comparisons' as const,
    heading: messages.comparisonsHeading,
    includes: isValidationWithListValue,
  },
] as const;

const groupsCache = new Map<string, ValidationGroup[]>();

export const getGroupedValidationsForVariableType = (
  variableType: string,
  entity: string,
  intl: IntlShape,
): ValidationGroup[] => {
  // The reader's language is part of the cache key: the headings and rule
  // names in a cached group are already formatted, so a cache keyed only by
  // the variable type would serve whichever language asked first.
  const key = JSON.stringify([variableType, entity, intl.locale]);
  const cached = groupsCache.get(key);
  if (cached !== undefined) return cached;
  const options = getValidationOptionsForVariableType(
    variableType,
    entity,
    intl,
  );
  const groups = VALIDATION_GROUPS.map(({ id, heading, includes }) => ({
    id,
    heading: intl.formatMessage(heading),
    rules: options.filter(({ value }) => includes(value)),
  })).filter(({ rules }) => rules.length > 0);
  groupsCache.set(key, groups);
  return groups;
};

export type ValidationValue = boolean | number | string | null;
export type ValidationMap = Record<string, ValidationValue>;

export const parseForRule = (key: string, text: string): ValidationValue => {
  if (key === '') return null;
  if (isValidationWithoutValue(key)) return true;
  if (isValidationWithNumberValue(key)) {
    if (text.trim() === '') return null;
    const parsed = Number(text);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (isValidationWithListValue(key)) return text === '' ? null : text;
  return null;
};

export const formatCommitted = (value: unknown): string => {
  if (typeof value === 'number') return value.toString();
  return typeof value === 'string' ? value : '';
};

export const isValidationMap = (value: unknown): value is ValidationMap =>
  isRecord(value);

export const isRuleValueComplete = (
  ruleKey: string,
  value: unknown,
): boolean => {
  if (isValidationWithoutValue(ruleKey)) return typeof value === 'boolean';
  if (isValidationWithNumberValue(ruleKey)) return typeof value === 'number';
  if (isValidationWithListValue(ruleKey)) {
    return typeof value === 'string' && value.length > 0;
  }
  return value !== null && value !== undefined;
};

export const completeRuleValues = (
  rules: Readonly<UnknownRecord>,
): UnknownRecord =>
  Object.fromEntries(
    Object.entries(rules).filter(([ruleKey, value]) =>
      isRuleValueComplete(ruleKey, value),
    ),
  );

/**
 * The rule's own name, as a value one refusal can carry to the other side of a
 * string-only contract. A named rule travels as a reference to its descriptor
 * so it is chosen in the reader's language when the sentence around it is;
 * an unnamed one travels as the start-cased schema token, for the reason
 * `getValidationLabel` records.
 */
const validationLabelValue = (
  validation: string,
): MessageErrorValues[string] => {
  const message = validationLabelMessage(validation);
  return message === undefined
    ? startCase(validation)
    : { messageError: createMessageError(message) };
};

export const incompleteRuleIssue = (
  rules: Readonly<UnknownRecord>,
): string | undefined => {
  for (const [ruleKey, value] of Object.entries(rules)) {
    if (isRuleValueComplete(ruleKey, value)) continue;
    return createMessageError(
      isValidationWithListValue(ruleKey)
        ? messages.incompleteReferenceRule
        : messages.incompleteValueRule,
      { label: validationLabelValue(ruleKey) },
    );
  }
  return undefined;
};

const RULE_FLOORS: Record<string, number> = {
  minLength: 0,
  maxLength: 0,
  minSelected: 0,
  maxSelected: 0,
};

export const floorIssue = (
  ruleKey: string,
  value: unknown,
): string | undefined => {
  if (
    NUMBER_RULES.has(ruleKey) &&
    typeof value === 'number' &&
    !Number.isInteger(value)
  ) {
    return createMessageError(messages.wholeNumberRule, { rule: ruleKey });
  }
  const floor = RULE_FLOORS[ruleKey];
  return floor !== undefined && typeof value === 'number' && value < floor
    ? createMessageError(messages.ruleFloor, { rule: ruleKey, floor })
    : undefined;
};

export const ruleMapPrecheck = (
  rules: Readonly<UnknownRecord>,
): { issue?: string; complete: UnknownRecord } => {
  const incomplete = incompleteRuleIssue(rules);
  if (incomplete !== undefined) return { issue: incomplete, complete: {} };
  const complete = completeRuleValues(rules);
  const floor = Object.entries(complete)
    .map(([ruleKey, value]) => floorIssue(ruleKey, value))
    .find((issue): issue is string => issue !== undefined);
  return floor === undefined ? { complete } : { issue: floor, complete };
};

const DRAFT_VARIABLE_ID_BASE = '__draft-variable__';

export const draftVariableId = (
  allVariables: Readonly<UnknownRecord>,
): string => {
  let candidate = DRAFT_VARIABLE_ID_BASE;
  let suffix = 1;
  while (Object.hasOwn(allVariables, candidate)) {
    suffix += 1;
    candidate = `${DRAFT_VARIABLE_ID_BASE}${suffix}`;
  }
  return candidate;
};

const draftVariableBase = (
  existing: unknown,
  variableType: string,
  draftVariableName: unknown,
): UnknownRecord =>
  isRecord(existing)
    ? existing
    : {
        name:
          typeof draftVariableName === 'string' && draftVariableName.trim()
            ? draftVariableName
            : // Deliberately English, and deliberately not a descriptor: this is
              // seeded into `@codaco/protocol-validation`'s contradiction
              // analyser AS A VARIABLE NAME, standing in for the unnamed
              // attribute being drafted. The analyser writes the sentence it
              // lands inside, in English, so translating the placeholder alone
              // would put a Spanish noun in an English sentence.
              'this attribute',
        type: variableType,
      };

export type ProspectiveDraft = Readonly<{
  allVariables: UnknownRecord;
  currentVariableId: string;
  variableType: string;
  validation: UnknownRecord;
  component?: unknown;
  options?: unknown;
  parameters?: unknown;
  draftVariableName?: unknown;
  stageEffectiveComponents?: boolean;
}>;

export const buildProspectiveVariables = ({
  allVariables,
  currentVariableId,
  variableType,
  validation,
  component,
  options,
  parameters,
  draftVariableName,
}: ProspectiveDraft): UnknownRecord => {
  const id = currentVariableId || draftVariableId(allVariables);
  const base = draftVariableBase(
    allVariables[id],
    variableType,
    draftVariableName,
  );
  return recordWith(allVariables, id, {
    ...base,
    type: variableType,
    validation,
    ...(component !== undefined ? { component } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(parameters !== undefined ? { parameters } : {}),
  });
};

const contradictionKey = (contradiction: ValidationContradiction): string =>
  [
    contradiction.class,
    [...contradiction.variableIds].toSorted().join(','),
    contradiction.strips
      .map(({ variableId, rule }) => `${variableId}:${rule}`)
      .toSorted()
      .join(','),
  ].join('|');

const baselineCache = new WeakMap<
  UnknownRecord,
  Map<boolean, ValidationContradiction[]>
>();

const baselineContradictions = (
  allVariables: UnknownRecord,
  stageEffectiveComponents: boolean,
): ValidationContradiction[] => {
  let byMode = baselineCache.get(allVariables);
  if (byMode === undefined) {
    byMode = new Map();
    baselineCache.set(allVariables, byMode);
  }
  let contradictions = byMode.get(stageEffectiveComponents);
  if (contradictions === undefined) {
    contradictions = findValidationContradictions(allVariables, {
      stageEffectiveComponents,
    });
    byMode.set(stageEffectiveComponents, contradictions);
  }
  return contradictions;
};

export const findDraftContradictions = (
  draft: ProspectiveDraft,
): ValidationContradiction[] => {
  const id = draft.currentVariableId || draftVariableId(draft.allVariables);
  const stageEffectiveComponents = draft.stageEffectiveComponents ?? false;
  const withDraft = findValidationContradictions(
    buildProspectiveVariables(draft),
    { stageEffectiveComponents },
  );
  const baselineKeys = new Set(
    baselineContradictions(draft.allVariables, stageEffectiveComponents).map(
      contradictionKey,
    ),
  );
  return withDraft.filter(
    (contradiction) =>
      contradiction.variableIds.includes(id) ||
      !baselineKeys.has(contradictionKey(contradiction)),
  );
};

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(id: string): string {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      return id;
    }
    let root = id;
    while (true) {
      const next = this.parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    let current = id;
    while (current !== root) {
      const next = this.parent.get(current);
      if (next === undefined) break;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent.set(leftRoot, rightRoot);
  }
}

const referenceTargetOf = (
  entry: unknown,
  rule: string,
): string | undefined => {
  if (!isRecord(entry) || !isRecord(entry.validation)) return undefined;
  const target = entry.validation[rule];
  return typeof target === 'string' ? target : undefined;
};

export type ReferenceTargetLegalityInput = Readonly<{
  allVariables: UnknownRecord;
  currentVariableId: string;
  variableType: string;
  validation: UnknownRecord;
  ruleKey: string;
  candidateIds: readonly string[];
  component?: unknown;
  options?: unknown;
  parameters?: unknown;
  draftVariableName?: unknown;
  stageEffectiveComponents?: boolean;
}>;

/**
 * Returns the candidate ids that remain satisfiable after adding the rule.
 * Isolated candidates share one canonical-analyser run; candidates already
 * connected by reference rules use an independently pruned run.
 */
export const findLegalReferenceTargets = ({
  allVariables,
  currentVariableId,
  variableType,
  validation,
  ruleKey,
  candidateIds,
  component,
  options,
  parameters,
  draftVariableName,
  stageEffectiveComponents = false,
}: ReferenceTargetLegalityInput): Set<string> => {
  const id = currentVariableId || draftVariableId(allVariables);
  const baseline = { ...validation };
  delete baseline[ruleKey];

  const draftEntry = (draftValidation: UnknownRecord): UnknownRecord => ({
    ...draftVariableBase(allVariables[id], variableType, draftVariableName),
    type: variableType,
    validation: draftValidation,
    ...(component !== undefined ? { component } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(parameters !== undefined ? { parameters } : {}),
  });

  const graph = recordWith(allVariables, id, draftEntry(baseline));
  const unionFind = new UnionFind();
  for (const sourceId of Object.keys(graph)) {
    for (const rule of VARIABLE_REFERENCE_VALIDATIONS) {
      const target = referenceTargetOf(graph[sourceId], rule);
      if (target !== undefined && Object.hasOwn(graph, target)) {
        unionFind.union(sourceId, target);
      }
    }
  }

  const componentMembers = new Map<string, string[]>();
  for (const memberId of Object.keys(graph)) {
    const root = unionFind.find(memberId);
    const members = componentMembers.get(root);
    if (members === undefined) componentMembers.set(root, [memberId]);
    else members.push(memberId);
  }

  const baselineKeys = new Set(
    findValidationContradictions(graph, { stageEffectiveComponents }).map(
      contradictionKey,
    ),
  );
  const idRoot = unionFind.find(id);
  const editedHasExternalReferences =
    (componentMembers.get(idRoot) ?? [id]).length > 1;
  const usedRoots = new Set<string>();
  const batched: string[] = [];
  const individual: string[] = [];

  for (const candidateId of candidateIds) {
    const root = Object.hasOwn(graph, candidateId)
      ? unionFind.find(candidateId)
      : candidateId;
    if (root === idRoot || usedRoots.has(root) || editedHasExternalReferences) {
      individual.push(candidateId);
    } else {
      usedRoots.add(root);
      batched.push(candidateId);
    }
  }

  const legal = new Set<string>();
  if (batched.length > 0) {
    const batchEntries = new Map(Object.entries(allVariables));
    if (currentVariableId !== '') batchEntries.delete(currentVariableId);
    const clones: { candidateId: string; cloneId: string; root: string }[] = [];
    for (const candidateId of batched) {
      let cloneId = `${id}::${candidateId}`;
      while (batchEntries.has(cloneId)) cloneId = `${cloneId}:`;
      const root = Object.hasOwn(graph, candidateId)
        ? unionFind.find(candidateId)
        : candidateId;
      clones.push({ candidateId, cloneId, root });
      batchEntries.set(
        cloneId,
        draftEntry({ ...baseline, [ruleKey]: candidateId }),
      );
    }
    const introduced = findValidationContradictions(
      Object.fromEntries(batchEntries),
      { stageEffectiveComponents },
    ).filter(
      (contradiction) => !baselineKeys.has(contradictionKey(contradiction)),
    );
    for (const { candidateId, cloneId, root } of clones) {
      const scope = new Set(componentMembers.get(root) ?? [candidateId]);
      scope.add(cloneId);
      const conflicts = introduced.some((contradiction) =>
        contradiction.variableIds.some((variableId) => scope.has(variableId)),
      );
      if (!conflicts) legal.add(candidateId);
    }
  }

  for (const candidateId of individual) {
    const candidateRoot = Object.hasOwn(graph, candidateId)
      ? unionFind.find(candidateId)
      : candidateId;
    const entries = new Map<string, unknown>();
    for (const memberId of componentMembers.get(idRoot) ?? [id]) {
      entries.set(memberId, graph[memberId]);
    }
    if (candidateRoot !== idRoot) {
      for (const memberId of componentMembers.get(candidateRoot) ?? [
        candidateId,
      ]) {
        entries.set(memberId, graph[memberId] ?? allVariables[memberId]);
      }
    }
    entries.set(id, draftEntry({ ...baseline, [ruleKey]: candidateId }));
    const conflicts = findValidationContradictions(
      Object.fromEntries(entries),
      { stageEffectiveComponents },
    ).some(
      (contradiction) => !baselineKeys.has(contradictionKey(contradiction)),
    );
    if (!conflicts) legal.add(candidateId);
  }

  return legal;
};

export const variableDisplayName = (
  variables: Readonly<UnknownRecord>,
  variableId: string,
): string => {
  const variable = variables[variableId];
  return isRecord(variable) && typeof variable.name === 'string'
    ? variable.name
    : variableId;
};

export const validatedElsewhereMessage = (variableName: string): string =>
  createMessageError(messages.validatedElsewhere, { variableName });

export const unvalidatedElsewhereMessage = (variableName: string): string =>
  createMessageError(messages.unvalidatedElsewhere, { variableName });

export const crossClassConflictMessage: Record<
  WriterClass,
  (variableName: string) => string
> = {
  unvalidated: validatedElsewhereMessage,
  validated: unvalidatedElsewhereMessage,
};

export const draftValidatedElsewhereMessage = (variableName: string): string =>
  createMessageError(messages.draftValidatedElsewhere, { variableName });

export const draftUnvalidatedElsewhereMessage = (
  variableName: string,
): string =>
  createMessageError(messages.draftUnvalidatedElsewhere, { variableName });

export const crossClassPickIssue = ({
  variableId,
  originalVariableId,
  hasConflictingUse,
  allVariables,
  message,
}: {
  variableId: string;
  originalVariableId: string;
  hasConflictingUse: (variableId: string) => boolean;
  allVariables: Readonly<UnknownRecord>;
  message: (variableName: string) => string;
}): string | undefined => {
  if (variableId === '' || variableId === originalVariableId) return undefined;
  return hasConflictingUse(variableId)
    ? message(variableDisplayName(allVariables, variableId))
    : undefined;
};

export type CrossClassPick = Readonly<{
  path: string;
  writerClass: WriterClass;
}>;

const valueAtPath = (value: unknown, path: string): unknown => {
  let current = value;
  for (const part of path.split('.')) {
    if (!isRecord(current) || !Object.hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
};

const stringAt = (value: unknown, path: string): string => {
  const result = valueAtPath(value, path);
  return typeof result === 'string' ? result : '';
};

export const crossClassPickErrors = ({
  values,
  initialValues,
  picks,
  subject,
  roleMap,
  allVariables,
}: {
  values: UnknownRecord;
  initialValues: unknown;
  picks: readonly CrossClassPick[];
  subject: CodebookSubject;
  roleMap: VariableRoleMap;
  allVariables: UnknownRecord;
}): Record<string, string> | undefined => {
  const errors = new Map<string, string>();
  for (const { path, writerClass } of picks) {
    const issue = crossClassPickIssue({
      variableId: stringAt(values, path),
      originalVariableId: stringAt(initialValues, path),
      hasConflictingUse: (variableId) =>
        roleMapHasConflictingUse(roleMap, subject, variableId, writerClass),
      allVariables,
      message: crossClassConflictMessage[writerClass],
    });
    if (issue !== undefined) errors.set(path, issue);
  }
  return errors.size === 0 ? undefined : Object.fromEntries(errors);
};

const variableIdsFromRows = (rows: unknown): ReadonlySet<string> => {
  const ids = new Set<string>();
  if (!Array.isArray(rows)) return ids;
  for (const row of rows) {
    if (isRecord(row) && typeof row.variable === 'string') {
      ids.add(row.variable);
    }
  }
  return ids;
};

export const draftFormFieldVariableIds = (
  fields: unknown,
): ReadonlySet<string> => variableIdsFromRows(fields);

export const draftAdditionalAttributeVariableIds = (
  prompts: unknown,
): ReadonlySet<string> => {
  const ids = new Set<string>();
  if (!Array.isArray(prompts)) return ids;
  for (const prompt of prompts) {
    if (!isRecord(prompt)) continue;
    for (const id of variableIdsFromRows(prompt.additionalAttributes)) {
      ids.add(id);
    }
  }
  return ids;
};

export type RuleMapContext = Readonly<{
  allVariables: UnknownRecord;
  currentVariableId: string;
  variableType: string;
  options?: unknown;
  component?: unknown;
  parameters?: unknown;
  draftVariableName?: unknown;
  stageEffectiveComponents?: boolean;
}>;

export const ruleMapIssue = (
  value: unknown,
  context: RuleMapContext,
): string | undefined => {
  if (!isValidationMap(value)) return undefined;
  const { issue, complete } = ruleMapPrecheck(value);
  if (issue !== undefined || context.variableType === '') return issue;
  return findDraftContradictions({
    allVariables: context.allVariables,
    currentVariableId: context.currentVariableId,
    variableType: context.variableType,
    validation: complete,
    options: context.options,
    component: context.component,
    parameters: context.parameters,
    draftVariableName: context.draftVariableName,
    stageEffectiveComponents: context.stageEffectiveComponents,
  })[0]?.message;
};

export type VariableOverlay = Record<
  string,
  Readonly<{ component?: unknown; parameters?: unknown }>
>;

export type ResolvedFormValidationView = Readonly<{
  renderedVariableIds: ReadonlySet<string>;
  overlay: VariableOverlay;
  includesEditedVariable?: boolean;
}>;

const withOverlay = (
  allVariables: UnknownRecord,
  overlay: VariableOverlay | undefined,
): UnknownRecord => {
  if (overlay === undefined) return allVariables;
  const entries = new Map(Object.entries(allVariables));
  for (const [id, { component, parameters }] of Object.entries(overlay)) {
    const existing = allVariables[id];
    if (!isRecord(existing)) continue;
    entries.set(id, {
      ...existing,
      ...(component !== undefined ? { component } : {}),
      ...(parameters !== undefined ? { parameters } : {}),
    });
  }
  return Object.fromEntries(entries);
};

const withoutUnknownRenderings = (
  variables: UnknownRecord,
  allRenderedVariableIds: ReadonlySet<string>,
  renderedVariableIds: ReadonlySet<string>,
): UnknownRecord => {
  const entries = new Map(Object.entries(variables));
  for (const id of allRenderedVariableIds) {
    if (!renderedVariableIds.has(id)) entries.delete(id);
  }
  return entries.size === Object.keys(variables).length
    ? variables
    : Object.fromEntries(entries);
};

const findResolvedViewDraftContradictions = (
  draft: ProspectiveDraft,
  view: ResolvedFormValidationView,
  allRenderedVariableIds: ReadonlySet<string>,
  baselineKeys: ReadonlySet<string>,
  draftRenderingOwnership: 'codebook' | 'current-form',
): ValidationContradiction[] => {
  const id = draft.currentVariableId || draftVariableId(draft.allVariables);
  const resolvedDraft =
    draftRenderingOwnership === 'current-form'
      ? { ...draft, component: undefined, parameters: undefined }
      : draft;
  const withDraft = withOverlay(
    withoutUnknownRenderings(
      buildProspectiveVariables(resolvedDraft),
      allRenderedVariableIds,
      view.renderedVariableIds,
    ),
    view.overlay,
  );
  return findValidationContradictions(withDraft, {
    stageEffectiveComponents: true,
  }).filter(
    (contradiction) =>
      contradiction.variableIds.includes(id) ||
      !baselineKeys.has(contradictionKey(contradiction)),
  );
};

const variableTypeForComponent = (component: string): string | undefined => {
  for (const [variableType, components] of Object.entries(
    VARIABLE_TYPE_COMPONENTS,
  )) {
    if (components.some((candidate) => candidate === component)) {
      return variableType;
    }
  }
  return undefined;
};

export type FieldEditorValidationContext = Readonly<{
  initialValues?: unknown;
}>;

export type FieldEditorValidationErrors = Readonly<{
  validation?: string;
  variable?: string;
}>;

export type FieldEditorValidator = (
  values: UnknownRecord,
  context?: FieldEditorValidationContext,
) => FieldEditorValidationErrors;

/**
 * Pure save gate for a variable editor. Optional overlays allow a host to
 * validate stage-effective Network Composer renderings without importing UI
 * or form-library state into the protocol-builder package.
 */
export const makeFieldEditorValidate = (
  allVariables: UnknownRecord,
  overlay?: VariableOverlay,
  crossFormRendered?: ReadonlySet<string>,
  hasUnvalidatedUse?: (variableId: string) => boolean | string,
  resolvedViews: readonly ResolvedFormValidationView[] = [],
  resolvedViewDraftRendering: 'codebook' | 'current-form' = 'codebook',
): FieldEditorValidator => {
  const overlaidVariables = withOverlay(allVariables, overlay);
  const unknownRenderingCandidates = [...(crossFormRendered ?? [])].filter(
    (id) =>
      !(overlay !== undefined && Object.hasOwn(overlay, id)) &&
      Object.hasOwn(overlaidVariables, id),
  );
  const resolvedViewIncludesEditedVariable = resolvedViews.some(
    ({ includesEditedVariable }) => includesEditedVariable === true,
  );
  const resolvedRenderedVariableIds = new Set<string>();
  for (const view of resolvedViews) {
    for (const id of Object.keys(view.overlay)) {
      resolvedRenderedVariableIds.add(id);
    }
  }
  for (const id of Object.keys(overlay ?? {})) {
    resolvedRenderedVariableIds.add(id);
  }
  const resolvedBaselineKeys = resolvedViews.map(
    () => new Map<string, Set<string>>(),
  );

  return (values, context = {}) => {
    const validation = isRecord(values.validation) ? values.validation : {};
    const isCreatingVariable =
      typeof values._createNewVariable === 'string' &&
      values._createNewVariable !== '';
    const currentVariableId =
      !isCreatingVariable && typeof values.variable === 'string'
        ? values.variable
        : '';
    const existing =
      currentVariableId === ''
        ? undefined
        : overlaidVariables[currentVariableId];
    const existingType = isRecord(existing) ? existing.type : undefined;
    const component =
      typeof values.component === 'string' ? values.component : '';
    const variableType =
      typeof existingType === 'string'
        ? existingType
        : variableTypeForComponent(component);
    if (variableType === undefined || variableType === '') return {};

    const { issue, complete } = ruleMapPrecheck(validation);
    if (issue !== undefined) return { validation: issue };

    const unknownRendering = unknownRenderingCandidates.filter(
      (id) => id !== currentVariableId,
    );
    const visibleVariables =
      unknownRendering.length === 0
        ? overlaidVariables
        : Object.fromEntries(
            Object.entries(overlaidVariables).filter(
              ([id]) => !unknownRendering.includes(id),
            ),
          );
    const first = findDraftContradictions({
      allVariables: visibleVariables,
      currentVariableId,
      variableType,
      validation: complete,
      component: values.component,
      options: values.options,
      parameters: values.parameters,
      draftVariableName: values._createNewVariable,
      stageEffectiveComponents: overlay !== undefined,
    })[0];
    if (first !== undefined) return { validation: first.message };

    if (resolvedViews.length > 0) {
      const allResolvedRenderedVariableIds = new Set(
        resolvedRenderedVariableIds,
      );
      if (overlay !== undefined || resolvedViewIncludesEditedVariable) {
        allResolvedRenderedVariableIds.add(
          currentVariableId || draftVariableId(allVariables),
        );
      }
      const draft: ProspectiveDraft = {
        allVariables,
        currentVariableId,
        variableType,
        validation: complete,
        component: values.component,
        options: values.options,
        parameters: values.parameters,
        draftVariableName: values._createNewVariable,
      };
      const baselineKey =
        overlay !== undefined || resolvedViewIncludesEditedVariable
          ? currentVariableId || draftVariableId(allVariables)
          : '';
      for (const [viewIndex, view] of resolvedViews.entries()) {
        const renderedVariableIds = view.includesEditedVariable
          ? new Set([
              ...view.renderedVariableIds,
              currentVariableId || draftVariableId(allVariables),
            ])
          : view.renderedVariableIds;
        const resolvedView = { ...view, renderedVariableIds };
        const byEditedVariable = resolvedBaselineKeys[viewIndex];
        if (byEditedVariable === undefined) continue;
        let baselineKeys = byEditedVariable.get(baselineKey);
        if (baselineKeys === undefined) {
          const baseline = withOverlay(
            withoutUnknownRenderings(
              allVariables,
              allResolvedRenderedVariableIds,
              resolvedView.renderedVariableIds,
            ),
            resolvedView.overlay,
          );
          baselineKeys = new Set(
            findValidationContradictions(baseline, {
              stageEffectiveComponents: true,
            }).map(contradictionKey),
          );
          byEditedVariable.set(baselineKey, baselineKeys);
        }
        const contradiction = findResolvedViewDraftContradictions(
          draft,
          resolvedView,
          allResolvedRenderedVariableIds,
          baselineKeys,
          resolvedViewDraftRendering,
        )[0];
        if (contradiction !== undefined) {
          return { validation: contradiction.message };
        }
      }
    }

    if (hasUnvalidatedUse !== undefined) {
      const initialValues = isRecord(context.initialValues)
        ? context.initialValues
        : undefined;
      const originalVariableId =
        typeof initialValues?.variable === 'string'
          ? initialValues.variable
          : '';
      const conflictingUse = hasUnvalidatedUse(currentVariableId);
      if (
        typeof conflictingUse === 'string' &&
        currentVariableId !== originalVariableId
      ) {
        return { variable: conflictingUse };
      }
      const pickIssue = crossClassPickIssue({
        variableId: currentVariableId,
        originalVariableId,
        hasConflictingUse: () =>
          typeof conflictingUse === 'boolean' && conflictingUse,
        allVariables: overlaidVariables,
        message: unvalidatedElsewhereMessage,
      });
      if (pickIssue !== undefined) return { variable: pickIssue };
    }
    return {};
  };
};
