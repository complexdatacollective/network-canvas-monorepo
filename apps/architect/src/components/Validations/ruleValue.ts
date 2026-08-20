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
      return `Choose a comparison attribute for "${label}", or switch the rule off.`;
    }
    return `Enter a value for "${label}", or switch the rule off.`;
  }
  return undefined;
};

// R1 (schema shape) rejects fractional values and values below these floors
// with a generic Zod message. Gating them here — ahead of the schema — lets
// the row editor disable the save and explain why, instead of surfacing that
// generic message only after a failed protocol save.
const RULE_FLOORS: Record<string, number> = {
  minLength: 0,
  maxLength: 0,
  minSelected: 0,
  maxSelected: 0,
};

const INTEGER_RULES = new Set([
  'minLength',
  'maxLength',
  'minValue',
  'maxValue',
  'minSelected',
  'maxSelected',
]);

export const floorIssue = (
  ruleKey: string,
  value: unknown,
): string | undefined => {
  if (
    INTEGER_RULES.has(ruleKey) &&
    typeof value === 'number' &&
    !Number.isInteger(value)
  ) {
    return `${ruleKey} must be a whole number`;
  }
  const floor = RULE_FLOORS[ruleKey];
  if (floor === undefined || typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return value < floor ? `${ruleKey} must be at least ${floor}` : undefined;
};

/**
 * Everything that can be decided about a rule map WITHOUT the codebook: an
 * unanswered rule first (nothing else can be judged until it has a value),
 * then a value the schema itself would reject. `complete` is the map with the
 * unanswered rules dropped, which is the only form the contradiction analyser
 * and any codebook write may see.
 *
 * This exists as one function because the same steps are run by two save
 * gates — `makeFieldEditorValidate` in `contradictions.ts` and `ruleMapIssue`
 * in `validateRuleMap.ts` — and they were written out twice. The copies had
 * already begun to diverge (one swept the raw map for floor issues, the other
 * the completed one), under a comment asserting that both called through one
 * place. They do now.
 *
 * It lives here rather than beside either caller because `contradictions.ts`
 * already imports this module: putting the shared step the other way round
 * would make the two files mutually recursive. `floorIssue` moved here with
 * it, for the same reason — it is a question about one rule's VALUE, which is
 * what this module is.
 */
export const ruleMapPrecheck = (
  rules: Record<string, unknown>,
): { issue?: string; complete: Record<string, unknown> } => {
  const incomplete = incompleteRuleIssue(rules);
  // No `complete` map is offered alongside an incomplete-rule issue: a caller
  // that ignored the issue and analysed the rest would be reasoning about a
  // map the researcher has not finished writing.
  if (incomplete) return { issue: incomplete, complete: {} };

  const complete = completeRuleValues(rules);
  const floor = Object.entries(complete)
    .map(([ruleKey, ruleValue]) => floorIssue(ruleKey, ruleValue))
    .find((message): message is string => message !== undefined);

  return floor ? { issue: floor, complete } : { complete };
};
