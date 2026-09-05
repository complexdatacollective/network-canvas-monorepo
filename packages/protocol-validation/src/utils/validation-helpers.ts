import type { z } from 'zod';

import type {
  Codebook,
  EntityDefinition,
  FilterRule,
  StageSubject,
  Variable,
} from '../schemas/8/schema.ts';

/**
 * Check if an entity (node/edge type) exists in the codebook
 */
export const entityExists = (
  codebook: Codebook,
  subject: StageSubject,
): boolean => {
  if (subject.entity === 'ego') {
    return codebook.ego !== undefined;
  }

  if (subject.entity === 'node') {
    return codebook.node?.[subject.type] !== undefined;
  }

  if (subject.entity === 'edge') {
    return codebook.edge?.[subject.type] !== undefined;
  }

  return false;
};

/**
 * Get variables for a subject (entity + type combination)
 */
export const getVariablesForSubject = (
  codebook: Codebook,
  subject: StageSubject,
): Record<string, Variable> => {
  if (subject.entity === 'ego') {
    return codebook.ego?.variables || {};
  }

  if (subject.entity === 'node') {
    return codebook.node?.[subject.type]?.variables || {};
  }

  if (subject.entity === 'edge') {
    return codebook.edge?.[subject.type]?.variables || {};
  }

  return {};
};

/**
 * Check if a variable exists for a given subject
 */
export const variableExists = (
  codebook: Codebook,
  subject: StageSubject,
  variableName: string,
): boolean => {
  const variables = getVariablesForSubject(codebook, subject);
  return variableName in variables;
};

/**
 * Check if a variable has a specific type
 */
export const variableHasType = (
  codebook: Codebook,
  subject: StageSubject,
  variableName: string,
  expectedType: string,
): boolean => {
  const variables = getVariablesForSubject(codebook, subject);
  const variable = variables[variableName];
  return variable?.type === expectedType;
};

/**
 * Check for duplicate IDs in array of objects with id property
 */
export const findDuplicateId = <T extends { id: string }>(
  items: T[],
): string | null => {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      return item.id;
    }
    seen.add(item.id);
  }
  return null;
};

/**
 * A `superRefine` callback that flags duplicate `id`s in an array of content
 * items. Shared by the Information stage and the FamilyPedigree intro screen,
 * which validate their own (separate) item schemas with the same rule.
 * `label` names the collection in the error message.
 */
export const duplicateIdRefinement =
  (label: string) =>
  (items: { id: string }[], ctx: z.RefinementCtx): void => {
    const duplicateItemId = findDuplicateId(items);
    if (duplicateItemId) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `${label} contain duplicate ID "${duplicateItemId}"`,
        path: [],
      });
    }
  };

const findDuplicate = (
  values: string[],
  keyOf: (value: string) => string,
): string | null => {
  const seen = new Set<string>();
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) {
      return value;
    }
    seen.add(key);
  }
  return null;
};

/**
 * The first exactly-repeated researcher-authored NAME in an array.
 *
 * EXACT, and deliberately NOT case-folded. Architect's editors do fold case and
 * Unicode form as a name is typed, so no protocol authored there can gain a
 * pair like `gender`/`GENDER`. Applying that same fold in the SCHEMA is a
 * different act: it decides whether an existing protocol may be OPENED, and
 * `migrateProtocol` throws on a schema failure — so a protocol that trips it
 * cannot be recovered, because there is no editor on that path to repair it in.
 *
 * Not hypothetical. Folding here was tried, and a real protocol in the
 * validation corpus stopped migrating: two ego attributes spelled `gender` and
 * `GENDER`, authored long before either rule existed.
 *
 * The schema's job is to describe what a protocol may CONTAIN. Keeping a
 * researcher from creating a confusable pair is the editor's job, where there
 * is somewhere to put the refusal. The asymmetry is intended and runs in the
 * safe direction; do not "restore consistency" by folding here.
 */
export const findDuplicateName = (names: string[]): string | null =>
  findDuplicate(names, (name) => name);

/**
 * The first exactly-repeated value in an array — for IDENTIFIERS (codebook
 * keys, type ids), where two spellings are two different things and no folding
 * may be applied.
 */
export const findDuplicateValue = (values: string[]): string | null =>
  findDuplicate(values, (value) => value);

/**
 * Get all entity names from codebook for duplicate checking
 */
export const getAllEntityNames = (codebook: Codebook): string[] => {
  const names: string[] = [];

  if (codebook.node) {
    names.push(...Object.values(codebook.node).map((entity) => entity.name));
  }

  if (codebook.edge) {
    names.push(...Object.values(codebook.edge).map((entity) => entity.name));
  }

  return names;
};

/**
 * Get all variable names for an entity definition
 */
export const getVariableNames = (
  variables?: EntityDefinition['variables'],
): string[] => {
  if (!variables) return [];
  return Object.values(variables).map((v) => v.name);
};

/**
 * Check if filter rule entity exists in codebook
 */
export const filterRuleEntityExists = (
  rule: FilterRule,
  codebook: Codebook,
): boolean => {
  if (rule.type === 'ego') {
    return codebook.ego !== undefined;
  }

  return Boolean(codebook[rule.type]?.[rule.options.type || '']);
};

/**
 * Check if filter rule attribute exists
 */
export const filterRuleAttributeExists = (
  rule: FilterRule,
  codebook: Codebook,
): boolean => {
  if (!('attribute' in rule.options) || !rule.options.attribute) return true; // No attribute to check

  if (rule.type === 'ego') {
    return Boolean(codebook.ego?.variables?.[rule.options.attribute]);
  }

  const entity = codebook[rule.type]?.[rule.options.type || ''];
  return Boolean(entity?.variables?.[rule.options.attribute]);
};

/**
 * Get the codebook definition of a filter rule's attribute.
 * Returns undefined if attribute is not specified or variable doesn't exist.
 *
 * The whole definition rather than only its type, because what a rule's
 * comparison value may be is not always decided by the type alone: an
 * option-bearing attribute answers with one of the options IT authored, so
 * they have to be read to know whether the rule can ever match.
 */
export const getFilterRuleVariable = (
  rule: FilterRule,
  codebook: Codebook,
): Variable | undefined => {
  if (!('attribute' in rule.options) || !rule.options.attribute)
    return undefined;

  if (rule.type === 'ego') {
    return codebook.ego?.variables?.[rule.options.attribute];
  }

  const entity = codebook[rule.type]?.[rule.options.type || ''];
  return entity?.variables?.[rule.options.attribute];
};

/**
 * Get the variable type for a filter rule's attribute
 * Returns undefined if attribute is not specified or variable doesn't exist
 */
export const getFilterRuleVariableType = (
  rule: FilterRule,
  codebook: Codebook,
): string | undefined => {
  return getFilterRuleVariable(rule, codebook)?.type;
};

/**
 * Create validation error message with context
 */
export const createValidationMessage = (
  baseMessage: string,
  context?: { subject?: StageSubject; variable?: string; entity?: string },
) => {
  let message = baseMessage;

  if (context?.subject) {
    if (context.subject.entity === 'ego') {
      message += ' (ego entity)';
    } else {
      message += ` (${context.subject.entity}[${context.subject.type}])`;
    }
  }

  if (context?.variable) {
    message += ` - attribute: "${context.variable}"`;
  }

  if (context?.entity) {
    message += ` - entity: "${context.entity}"`;
  }

  return message;
};
