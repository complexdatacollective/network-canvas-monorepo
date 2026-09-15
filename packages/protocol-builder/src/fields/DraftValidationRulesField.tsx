import { createMessageError } from '@codaco/app-i18n/messages';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';

import { missingComparisonTargetMessage } from '../codebook/codebookMessages.ts';
import VariableValidationEditor from '../codebook/validation/VariableValidationEditor.tsx';
import {
  isValidationMap,
  isValidationWithListValue,
  ruleMapIssueForWrite,
  type StageRendering,
  type ValidationMap,
} from '../codebook/variableValidation.ts';

export type DraftValidationRulesFieldProps = CreateFormFieldProps<
  Record<string, unknown>,
  'div',
  {
    /** Whose codebook the attribute will be created in. */
    entity: 'node' | 'edge' | 'ego';
    /** The kind of answer chosen for it, which decides the rule catalogue. */
    variableType: string;
    /** The attributes a comparison rule may be pointed at. */
    allVariables: Readonly<Record<string, unknown>>;
    /** See `VariableValidationEditor`'s own prop. */
    stageRendering?: StageRendering;
  }
>;

/**
 * The rules for an attribute that does not exist yet.
 *
 * A field of the ROW rather than a codebook write: the attribute is being
 * invented by a row whose own save creates it, so these rules are part of that
 * row until then and are written with the create — which is what Architect
 * does (`Form/fieldCommit.ts` puts the field's `validation` into the create
 * request).
 *
 * Everything a researcher sees is the codebook section's: the same rule
 * catalogue for the kind of answer, the same rows, the same refusal for a pair
 * of rules that contradict each other. Only the destination of the save is
 * different, and that is the one thing they must not share.
 */
export default function DraftValidationRulesField({
  value,
  onChange,
  entity,
  variableType,
  allVariables,
  stageRendering,
  disabled = false,
  readOnly = false,
  className,
  // Passed on rather than dropped: the row's own rule about the rules is a
  // field refusal, and a control that does not carry it leaves the refusal
  // invisible to the outline and to `focusFirstError`.
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: DraftValidationRulesFieldProps) {
  return (
    <VariableValidationEditor
      entity={entity}
      variableType={variableType}
      // Nothing to exclude from the comparison targets: the attribute these
      // rules belong to has no record key yet, so no rule can point at it.
      currentVariableId=""
      allVariables={allVariables}
      value={isValidationMap(value) ? value : {}}
      onChange={(next: ValidationMap) => {
        if (disabled || readOnly) return;
        onChange?.(next);
      }}
      readOnly={disabled || readOnly}
      aria-invalid={ariaInvalid}
      {...(ariaDescribedBy === undefined
        ? {}
        : { 'aria-describedby': ariaDescribedBy })}
      {...(stageRendering === undefined ? {} : { stageRendering })}
      {...(className === undefined ? {} : { className })}
    />
  );
}

export type DraftRulesIssueInput = Readonly<{
  value: unknown;
  variableType: string;
  /** The name the researcher typed, for a refusal that names this attribute. */
  variableName: string;
  allVariables: Readonly<Record<string, unknown>>;
  stageRendering?: StageRendering;
}>;

/**
 * The row's rule about the rules it is holding for an attribute it invents.
 *
 * A rule switched on but left without a value is kept as `null` on purpose, so
 * it can be corrected rather than quietly dropped — which means the row's save
 * has to refuse it. A comparison pointing at an attribute that is no longer
 * there is refused for the same reason: the create would write a rule about a
 * record key the codebook does not hold.
 */
export function draftRulesIssue({
  value,
  variableType,
  variableName,
  allVariables,
  stageRendering,
}: DraftRulesIssueInput): string | undefined {
  if (!isValidationMap(value)) return undefined;
  const missingTarget = Object.entries(value).some(
    ([ruleKey, target]) =>
      isValidationWithListValue(ruleKey) &&
      typeof target === 'string' &&
      !Object.hasOwn(allVariables, target),
  );
  if (missingTarget) return createMessageError(missingComparisonTargetMessage);
  return ruleMapIssueForWrite(
    value,
    {
      allVariables: { ...allVariables },
      currentVariableId: '',
      variableType,
      draftVariableName: variableName,
    },
    stageRendering,
  );
}
