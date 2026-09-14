import { useId, type KeyboardEvent } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  fieldDescribedBy,
  fieldElementIds,
} from '@codaco/fresco-ui/form/Field/fieldElements';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Hint from '@codaco/fresco-ui/form/Hint';

import { MULTI_SELECT_RULE_CLASSES } from '../../form/arrayFields/MultiSelect.tsx';
import {
  isValidationWithListValue,
  isValidationWithNumberValue,
} from '../variableValidation.ts';

const messages = defineMessages({
  increase: {
    id: 'protocolBuilder.variableValidation.increaseRuleValue',
    defaultMessage: 'Increase {label}',
    description:
      'Accessible name of the button raising one validation rule’s number by one. label is that rule’s own name — "Minimum length", "Maximum value" — which is translated beside it.',
  },
  decrease: {
    id: 'protocolBuilder.variableValidation.decreaseRuleValue',
    defaultMessage: 'Decrease {label}',
    description:
      'Accessible name of the button lowering one validation rule’s number by one. label is that rule’s own name — "Minimum length", "Maximum value" — which is translated beside it.',
  },
  selectTarget: {
    id: 'protocolBuilder.variableValidation.selectTarget',
    defaultMessage: 'Select an attribute',
    description:
      'The unchosen entry of the control naming which other attribute a comparison rule judges this one against.',
  },
});

export type TargetOption = Readonly<{ label: string; value: string }>;

export type ValidationRuleProps = Readonly<{
  ruleKey: string;
  label: string;
  isOn: boolean;
  /** Whether the rule cannot be switched on at all, with `hint` saying why. */
  isUnavailable?: boolean;
  hint?: string;
  text: string;
  issues: readonly string[];
  targetOptions?: readonly TargetOption[];
  onToggle(ruleKey: string, nextState: boolean): void;
  onTextChange(ruleKey: string, text: string): void;
  onCommit(ruleKey: string, text: string): void;
  onValueExit(ruleKey: string, text: string): void;
}>;

const ROW_BASE =
  'flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 rounded px-5 whitespace-normal transition-colors duration-300 ease-in-out';
const ROW_OFF = `${ROW_BASE} py-3`;
const ROW_ON = `${MULTI_SELECT_RULE_CLASSES} ${ROW_BASE}`;

/**
 * One validation rule: a switch, whatever value the rule takes, and what is
 * wrong with it.
 *
 * Architect's row (`components/Validations/ValidationRule.tsx`) as it stood,
 * connected to this package's controlled rule map rather than to a Redux form.
 * The switch carries the rule's ON state, the number box holds typing until
 * the researcher leaves it, and the comparison control offers only targets the
 * rule could actually be satisfied against.
 */
export default function ValidationRule({
  ruleKey,
  label,
  isOn,
  isUnavailable = false,
  hint,
  text,
  issues,
  targetOptions,
  onToggle,
  onTextChange,
  onCommit,
  onValueExit,
}: ValidationRuleProps) {
  const intl = useAppIntl();
  const rowId = useId();
  // This row is not a BaseField, but it names the same elements around its
  // controls, so it takes both the IDs and the reference list from fresco-ui's
  // one owner of them rather than assembling `${rowId}-…` itself. `required`
  // is omitted because the row renders no such marker.
  const ids = fieldElementIds(rowId);

  const hasIssues = issues.length > 0;
  const takesNumber = isValidationWithNumberValue(ruleKey);
  const takesTarget = isValidationWithListValue(ruleKey);

  const describedBy =
    fieldDescribedBy(rowId, { hint: Boolean(hint), error: hasIssues }) ||
    undefined;

  const handleValueKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    // Never the enclosing form's submit: this box is a rule about an
    // attribute, and Enter in it means "I have finished typing this number".
    event.preventDefault();
    onValueExit(ruleKey, text);
  };

  return (
    <div className={isOn ? ROW_ON : ROW_OFF}>
      <div className="flex flex-1 items-center gap-4">
        <ToggleField
          name={`validation-${ruleKey}`}
          value={isOn}
          readOnly={isUnavailable}
          aria-disabled={isUnavailable || undefined}
          aria-labelledby={ids.label}
          aria-describedby={describedBy}
          onChange={(nextState) => {
            if (isUnavailable) return;
            onToggle(ruleKey, nextState === true);
          }}
        />
        <span id={ids.label}>{label}</span>
      </div>

      {isOn && takesNumber && (
        <div className="contents">
          <InputField
            name={`validation-value-${ruleKey}`}
            className="w-36"
            aria-label={label}
            aria-invalid={hasIssues || undefined}
            aria-describedby={describedBy}
            value={text}
            onChange={(value: string | undefined) =>
              onTextChange(ruleKey, value ?? '')
            }
            onBlur={() => onValueExit(ruleKey, text)}
            // A step always settles a complete number, and clicking a stepper
            // button moves focus out of the box — so the blur that follows
            // carries the value from BEFORE the step.
            onStep={(value: string) => onCommit(ruleKey, value)}
            stepperLabels={{
              increase: intl.formatMessage(messages.increase, { label }),
              decrease: intl.formatMessage(messages.decrease, { label }),
            }}
            onKeyDown={handleValueKeyDown}
            type="number"
            step={1}
          />
        </div>
      )}

      {isOn && takesTarget && (
        <div className="w-72">
          <NativeSelectField
            options={[...(targetOptions ?? [])]}
            name={`validation-value-${ruleKey}`}
            aria-label={label}
            aria-invalid={hasIssues || undefined}
            aria-describedby={describedBy}
            value={text === '' ? undefined : text}
            onChange={(value) => {
              const next = typeof value === 'string' ? value : '';
              onTextChange(ruleKey, next);
              onCommit(ruleKey, next);
            }}
            onBlur={() => onValueExit(ruleKey, text)}
            placeholder={intl.formatMessage(messages.selectTarget)}
          />
        </div>
      )}

      {hint !== undefined && (
        <div className="w-full max-w-full min-w-0 basis-full wrap-break-word whitespace-normal">
          <Hint id={ids.hint}>{hint}</Hint>
        </div>
      )}

      {hasIssues && (
        <div className="mt-2 w-full max-w-full min-w-0 basis-full wrap-break-word whitespace-normal">
          <FieldErrors id={ids.error} errors={[...issues]} show variant="box" />
        </div>
      )}
    </div>
  );
}
