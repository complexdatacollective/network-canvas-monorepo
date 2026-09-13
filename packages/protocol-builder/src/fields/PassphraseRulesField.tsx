import { createMessageError } from '@codaco/app-i18n/messages';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';

import VariableValidationEditor from '../codebook/validation/VariableValidationEditor.tsx';
import {
  isValidationMap,
  ruleMapPrecheck,
  type ValidationMap,
} from '../codebook/variableValidation.ts';
import { anonymisationMessages } from '../editors/anonymisation/sections/anonymisationMessages.ts';

/**
 * The variable type whose rule catalogue is exactly the passphrase's: a
 * minimum and a maximum length, and nothing else.
 */
const PASSPHRASE = 'passphrase';

/** A passphrase belongs to the participant, so its rules are ego rules. */
const ENTITY = 'ego';

const NO_VARIABLES = Object.freeze({});

export type PassphraseRulesFieldProps = CreateFormFieldProps<
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
export default function PassphraseRulesField({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  className,
  // Passed on rather than dropped: the section's own rule about the rules is a
  // field refusal, and a control that does not carry it leaves the refusal
  // invisible to the outline and to `focusFirstError`.
  'aria-invalid': ariaInvalid,
  // Likewise: it names the field's error region, which is where the sentence a
  // researcher reads is. Dropping it left the one element carrying
  // `aria-invalid` describing nothing.
  'aria-describedby': ariaDescribedBy,
}: PassphraseRulesFieldProps) {
  // The refusal the field is stating, rather than the bare fact that it is
  // refusing: the field shows its error region exactly when `aria-invalid`
  // holds, and this is the message in it.
  const fieldIssue =
    ariaInvalid === true ? passphraseRulesIssue(value) : undefined;

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
      aria-invalid={ariaInvalid}
      {...(ariaDescribedBy === undefined
        ? {}
        : { 'aria-describedby': ariaDescribedBy })}
      {...(fieldIssue === undefined ? {} : { fieldIssue })}
      {...(className === undefined ? {} : { className })}
    />
  );
}

/**
 * A field's `custom` rule answers with a string or nothing, so the refusal
 * this one writes crosses the package's string-only contract encoded: the
 * descriptor and its id travel inside the string, and the form's own error
 * region decodes them in the reader's language. A refusal `ruleMapPrecheck`
 * wrote is passed through as it stands — it belongs to the rule editor, and is
 * either encoded there already or a plain sentence the same decoder leaves
 * alone.
 */
const MINIMUM_ABOVE_MAXIMUM = createMessageError(
  anonymisationMessages.passphraseRulesMinimumAboveMaximum,
);

/**
 * A maximum of zero is a length no passphrase can have.
 *
 * The rule catalogue's own floor for a length is zero, which is right for a
 * codebook attribute — a text answer may be left empty. A passphrase may not:
 * the interview asks every participant for one and refuses an empty answer
 * (`interfaces/Anonymisation/Anonymisation.tsx` renders both fields
 * `required`) while applying this maximum to it, so a stage carrying zero
 * refuses everything the participant can type and the interview can never be
 * finished. Both halves of that are this stage's own rules, which is why it is
 * refused here rather than in the shared catalogue.
 *
 * The protocol schema accepts it too (`schemas/8/stages/anonymisation.ts`
 * pins the lengths to integers and no floor), so a protocol already holding
 * one opens, is refused here, and can be corrected.
 */
const MAXIMUM_BELOW_ONE = createMessageError(
  anonymisationMessages.passphraseRulesMaximumBelowOne,
);

/**
 * The rule about the rules, in the section that holds them.
 *
 * A rule switched on but left without a value is kept as `null` on purpose, so
 * it can be corrected rather than quietly dropped — which means something has
 * to refuse the save while it is there. The protocol schema refuses it too,
 * but against a path and only once the save has been attempted.
 *
 * Anything that is not a rule map at all is nothing to say to the researcher:
 * the schema pins `validation` to an object of length rules, so no protocol a
 * host holds carries anything else there, and the control writes nothing else
 * either.
 */
export function passphraseRulesIssue(value: unknown): string | undefined {
  if (!isValidationMap(value)) return undefined;

  const { issue, complete } = ruleMapPrecheck(value);
  if (issue !== undefined) return issue;

  const minimum = complete.minLength;
  const maximum = complete.maxLength;
  // Asked before the comparison: with a maximum of zero both are true, and
  // raising the maximum to one is the correction either way.
  if (typeof maximum === 'number' && maximum < 1) return MAXIMUM_BELOW_ONE;
  if (
    typeof minimum === 'number' &&
    typeof maximum === 'number' &&
    minimum > maximum
  ) {
    return MINIMUM_ABOVE_MAXIMUM;
  }
  return undefined;
}
