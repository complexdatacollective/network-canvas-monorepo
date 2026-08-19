import type { z } from 'zod';

import { normalizeForComparison } from '@codaco/shared-consts';

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
 * The first repeated researcher-authored NAME in an array, in its original
 * spelling so the message shows what was written.
 *
 * Keyed on `normalizeForComparison`, which is the SAME question Architect's
 * editors ask as a name is typed and the same one the disease-label rule and
 * its repair ask: two names that differ only in case, or only in how the same
 * accented character was encoded, are one name to a reader. Comparing raw here
 * let the editor refuse a name the schema then accepted, so a protocol built on
 * one device could carry a pair of names Architect would never have let the
 * researcher create.
 */
export const findDuplicateName = (names: string[]): string | null =>
  findDuplicate(names, normalizeForComparison);

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
 * Get the variable type for a filter rule's attribute
 * Returns undefined if attribute is not specified or variable doesn't exist
 */
export const getFilterRuleVariableType = (
  rule: FilterRule,
  codebook: Codebook,
): string | undefined => {
  if (!('attribute' in rule.options) || !rule.options.attribute)
    return undefined;

  let variable: Variable | undefined;

  if (rule.type === 'ego') {
    variable = codebook.ego?.variables?.[rule.options.attribute];
  } else {
    const entity = codebook[rule.type]?.[rule.options.type || ''];
    variable = entity?.variables?.[rule.options.attribute];
  }

  return variable?.type;
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
