import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';

import VariableValidationEditor from '../../codebook/validation/VariableValidationEditor.tsx';
import {
  isValidationMap,
  ruleMapPrecheck,
  type ValidationMap,
} from '../../codebook/variableValidation.ts';

/**
 * The variable type whose rule catalogue is exactly the passphrase's:
 * a minimum and a maximum length, and nothing else.
 */
const PASSPHRASE = 'passphrase';

/** A passphrase belongs to the participant, so its rules are ego rules. */
const ENTITY = 'ego';

const NO_VARIABLES = Object.freeze({});

export type PassphraseRulesControlProps = CreateFormFieldProps<
  Record<string, unknown>,
  'div'
>;

/**
 * What a passphrase has to look like.
 *
 * The package's own validation-rule editor, pointed at the passphrase rule
 * catalogue. It is reused rather than reimplemented because a rule is a rule:
 * the same checkbox-plus-value control, the same "enter a value or switch it
 * off" refusal, and the same incomplete-rule handling that keeps a half-set
 * rule visible instead of silently discarding it.
 *
 * There is deliberately nothing to compare a passphrase against — it is not a
 * codebook attribute and there are no sibling attributes in scope — so the
 * editor is handed no variables and offers only the two length rules.
 */
export default function PassphraseRulesControl({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  className,
}: PassphraseRulesControlProps) {
  return (
    <VariableValidationEditor
      entity={ENTITY}
      variableType={PASSPHRASE}
      currentVariableId=""
      allVariables={NO_VARIABLES}
      value={isValidationMap(value) ? value : {}}
      onChange={(next: ValidationMap) => {
        if (disabled || readOnly) return;
        onChange?.(next);
      }}
      readOnly={disabled || readOnly}
      {...(className === undefined ? {} : { className })}
    />
  );
}

/**
 * The rule about the rules, in the section that holds them.
 *
 * A rule switched on but left without a value is kept as `null` on purpose, so
 * it can be corrected rather than quietly dropped — which means something has
 * to refuse the save while it is there. The protocol schema refuses it too,
 * but against a path and only once the save has been attempted.
 */
export function passphraseRulesIssue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isValidationMap(value)) {
    return 'These passphrase rules could not be read. Switch them off and set them again.';
  }

  const { issue, complete } = ruleMapPrecheck(value);
  if (issue !== undefined) return issue;

  const minimum = complete.minLength;
  const maximum = complete.maxLength;
  if (
    typeof minimum === 'number' &&
    typeof maximum === 'number' &&
    minimum > maximum
  ) {
    return 'The shortest passphrase you allow cannot be longer than the longest one.';
  }
  return undefined;
}
