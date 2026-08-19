import { findDraftContradictions } from './contradictions';
import { isValidationMap, ruleMapPrecheck } from './ruleValue';

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

  // The unanswered-rule and floor checks, and the completed map the analyser
  // has to be given, all come from `ruleMapPrecheck` — the same call the stage
  // editor's save gate (`makeFieldEditorValidate`) makes. Written out here as
  // well, the two copies drifted: this one swept the RAW map for floor issues
  // while the other swept the completed one.
  const { issue, complete } = ruleMapPrecheck(value);
  if (issue) return issue;

  if (!context.variableType) return undefined;

  return findDraftContradictions({
    allVariables: context.allVariables,
    currentVariableId: context.currentVariableId,
    variableType: context.variableType,
    validation: complete,
    options: context.options,
    component: context.component,
    parameters: context.parameters,
    draftVariableName: context.draftVariableName,
  })[0]?.message;
};
