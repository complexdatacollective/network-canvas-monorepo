import { useId, type KeyboardEvent } from 'react';

import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Hint from '@codaco/fresco-ui/form/Hint';

import { MULTI_SELECT_RULE_CLASSES } from '../Form/MultiSelect';
import {
  isValidationWithListValue,
  isValidationWithNumberValue,
} from './options';

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
  shouldFocusValue?: boolean;
};

const ROW_BASE =
  'flex flex-wrap items-center gap-x-5 gap-y-2 rounded px-5 transition-colors duration-300 ease-in-out';
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
  shouldFocusValue = false,
}: ValidationRuleProps) => {
  const rowId = useId();
  const labelId = `${rowId}-label`;
  const hintId = `${rowId}-hint`;
  const errorId = `${rowId}-error`;

  const hasIssues = issues.length > 0;
  const takesNumber = isValidationWithNumberValue(ruleKey);
  const takesTarget = isValidationWithListValue(ruleKey);

  const describedBy =
    [hint ? hintId : null, hasIssues ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  const handleValueKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit(ruleKey, text);
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
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          onChange={(nextState) => {
            if (isUnavailable) {
              return;
            }
            onToggle(ruleKey, !!nextState);
          }}
        />
        <span id={labelId}>{label}</span>
      </div>

      {isOn && takesNumber && (
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
          onBlur={() => onCommit(ruleKey, text)}
          onStep={(value: string) => onCommit(ruleKey, value)}
          stepperLabels={{
            increase: `Increase ${label}`,
            decrease: `Decrease ${label}`,
          }}
          onKeyDown={handleValueKeyDown}
          type="number"
          step={1}
          autoFocus={shouldFocusValue}
        />
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
            placeholder="Select comparison variable"
            autoFocus={shouldFocusValue}
          />
        </div>
      )}

      {hint && (
        <div className="basis-full">
          <Hint id={hintId}>{hint}</Hint>
        </div>
      )}

      {hasIssues && (
        <div className="mt-2 basis-full">
          <FieldErrors id={errorId} errors={issues} show variant="box" />
        </div>
      )}
    </div>
  );
};

export default ValidationRule;
