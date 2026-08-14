import { findDraftContradictions, floorIssue } from './contradictions';
import {
  completeRuleValues,
  incompleteRuleIssue,
  isValidationMap,
} from './ruleValue';

/**
 * The inputs a rule map has to be judged against: the codebook it lives in,
 * plus the draft rendering the surrounding editor is currently showing.
 * Assembled once by `Validations` (see `ruleMapContextFor`) and shared by the
 * row-level check, the reference-target picker and the field-level validator,
 * so the three can never disagree about what they are analysing.
 */
export type RuleMapContext = {
  allVariables: Record<string, unknown>;
  currentVariableId: string;
  variableType: string;
  options?: unknown;
  component?: unknown;
  parameters?: unknown;
  draftVariableName?: unknown;
};

/**
 * Every reason a rule map cannot be saved, in the order the researcher can act
 * on them: an unanswered rule first (nothing else can be judged until it has a
 * value), then a value the schema itself would reject, then the first
 * contradiction the map produces against the rest of the codebook.
 *
 * This is the whole contract the `validation` field validates itself against.
 * Before it existed, the rule editor kept an invalid rule OUT of the committed
 * map instead — which blocked nothing, because a map with the offending rule
 * already deleted is trivially consistent. The dialog saved, and the rule
 * (including the previously valid value being edited) was silently lost.
 */
export const ruleMapIssue = (
  value: unknown,
  context: RuleMapContext,
): string | undefined => {
  if (!isValidationMap(value)) return undefined;

  const incomplete = incompleteRuleIssue(value);
  if (incomplete) return incomplete;

  const floor = Object.entries(value)
    .map(([ruleKey, ruleValue]) => floorIssue(ruleKey, ruleValue))
    .find((message): message is string => message !== undefined);
  if (floor) return floor;

  if (!context.variableType) return undefined;

  return findDraftContradictions({
    allVariables: context.allVariables,
    currentVariableId: context.currentVariableId,
    variableType: context.variableType,
    validation: completeRuleValues(value),
    options: context.options,
    component: context.component,
    parameters: context.parameters,
    draftVariableName: context.draftVariableName,
  })[0]?.message;
};
