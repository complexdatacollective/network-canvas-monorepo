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

import { MULTI_SELECT_RULE_CLASSES } from '../Form/arrayFields/MultiSelect';
import {
  isValidationWithListValue,
  isValidationWithNumberValue,
} from './options';
const messages = defineMessages({
  increase: {
    id: 'architect.validations.validationRule.increase',
    defaultMessage: 'Increase {label}',
    description:
      'Accessible action for increasing the named validation rule value; label is the localized rule name.',
  },
  decrease: {
    id: 'architect.validations.validationRule.decrease',
    defaultMessage: 'Decrease {label}',
    description:
      'Accessible action for decreasing the named validation rule value; label is the localized rule name.',
  },
  selectComparisonAttribute: {
    id: 'architect.validations.validationRule.selectComparisonAttribute',
    defaultMessage: 'Select comparison attribute',
    description:
      'The placeholder text in components / Validations / ValidationRule.',
  },
});

export type TargetOption = {
  label: string;
  value: string;
};

type ValidationRuleProps = {
  ruleKey: string;
  label: string;
  isOn: boolean;
  isUnavailable?: boolean;
  hint?: string;
  text: string;
  issues: string[];
  targetOptions?: TargetOption[];
  onToggle: (ruleKey: string, nextState: boolean) => void;
  onTextChange: (ruleKey: string, text: string) => void;
  onCommit: (ruleKey: string, text: string) => void;
  onValueExit: (ruleKey: string, text: string) => void;
};

const ROW_BASE =
  'flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 rounded px-5 whitespace-normal transition-colors duration-300 ease-in-out';
const ROW_OFF = `${ROW_BASE} py-3`;
const ROW_ON = `${MULTI_SELECT_RULE_CLASSES} ${ROW_BASE}`;

const ValidationRule = ({
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
}: ValidationRuleProps) => {
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
    if (event.key === 'Enter') {
      event.preventDefault();
      onValueExit(ruleKey, text);
    }
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
            if (isUnavailable) {
              return;
            }
            onToggle(ruleKey, !!nextState);
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
            onChange={(value: unknown) =>
              onTextChange(ruleKey, typeof value === 'string' ? value : '')
            }
            onBlur={() => onValueExit(ruleKey, text)}
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
            options={targetOptions ?? []}
            name={`validation-value-${ruleKey}`}
            aria-label={label}
            aria-invalid={hasIssues || undefined}
            aria-describedby={describedBy}
            value={text || undefined}
            onChange={(value) => {
              const next = typeof value === 'string' ? value : '';
              onTextChange(ruleKey, next);
              onCommit(ruleKey, next);
            }}
            onBlur={() => onValueExit(ruleKey, text)}
            placeholder={intl.formatMessage(messages.selectComparisonAttribute)}
          />
        </div>
      )}

      {hint && (
        <div className="w-full max-w-full min-w-0 basis-full wrap-break-word whitespace-normal">
          <Hint id={ids.hint}>{hint}</Hint>
        </div>
      )}

      {hasIssues && (
        <div className="mt-2 w-full max-w-full min-w-0 basis-full wrap-break-word whitespace-normal">
          <FieldErrors id={ids.error} errors={issues} show variant="box" />
        </div>
      )}
    </div>
  );
};

export default ValidationRule;
