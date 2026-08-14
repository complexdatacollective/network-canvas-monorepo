import {
  getValidationLabel,
  isValidationWithListValue,
  isValidationWithNumberValue,
  isValidationWithoutValue,
} from './options';

export type ValidationValue = boolean | number | string | null;

export type ValidationMap = Record<string, ValidationValue>;

export const parseForRule = (key: string, text: string): ValidationValue => {
  if (!key) {
    return null;
  }

  if (isValidationWithoutValue(key)) {
    return true;
  }

  if (isValidationWithNumberValue(key)) {
    if (text.trim() === '') {
      return null;
    }
    const parsed = Number(text);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (isValidationWithListValue(key)) {
    return text === '' ? null : text;
  }

  return null;
};

export const formatCommitted = (value: unknown): string => {
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

export const isValidationMap = (value: unknown): value is ValidationMap =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a rule's value is finished.
 *
 * This replaced a near-identical `isDraftComplete`, which answered the same
 * question of a typed draft but reported a value-less rule as complete
 * whatever it held — including the `null` that now means "switched on, not
 * answered yet". Two predicates that disagree on exactly the case this fix
 * turns on is how the silent-drop bug would come back, so there is only one.
 *
 * A rule row writes its ON state into the map the moment it is switched on,
 * carrying `null` until a value arrives (see `Validations.tsx`). That is what
 * stops a half-configured rule from disappearing on save; the cost is that
 * every reader of the map has to read `null` as "switched on, not answered
 * yet" rather than as a rule whose value happens to be null.
 *
 * A key this editor does not recognise is treated as complete: an unknown
 * rule is the schema's business, and reporting it here would leave a
 * researcher with an error they have no control to fix.
 */
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

/**
 * The map with every unanswered rule dropped — what the contradiction
 * analyser, the reference-target picker and any codebook write must all be
 * given. None of them can read `null` as "not answered yet": the analyser
 * would take it for a bound, and the protocol schema types every rule's value
 * as a number, a boolean or a variable id.
 */
export const completeRuleValues = (
  rules: Record<string, unknown>,
): Record<string, unknown> => {
  const complete: Record<string, unknown> = {};
  for (const [ruleKey, value] of Object.entries(rules)) {
    if (isRuleValueComplete(ruleKey, value)) {
      complete[ruleKey] = value;
    }
  }
  return complete;
};

/**
 * The first rule that is switched on but not yet answered, phrased as a whole
 * researcher-facing sentence: it names the rule and says what to do about it.
 */
export const incompleteRuleIssue = (
  rules: Record<string, unknown>,
): string | undefined => {
  for (const [ruleKey, value] of Object.entries(rules)) {
    if (isRuleValueComplete(ruleKey, value)) continue;
    const label = getValidationLabel(ruleKey);
    if (isValidationWithListValue(ruleKey)) {
      return `Choose a comparison variable for "${label}", or switch the rule off.`;
    }
    return `Enter a value for "${label}", or switch the rule off.`;
  }
  return undefined;
};
