import { map } from 'es-toolkit/compat';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { Variable } from '@codaco/protocol-validation';

import {
  MULTI_SELECT_CONTROL_CLASSES,
  MULTI_SELECT_OPTION_CLASSES,
  MULTI_SELECT_OPTIONS_CLASSES,
  MULTI_SELECT_RULE_CLASSES,
} from '../Form/MultiSelect';
import {
  getValidationLabel,
  isValidationWithListValue,
  isValidationWithNumberValue,
  isValidationWithoutValue,
} from './options';

type ValidationOption = {
  label: string;
  value: string;
};

type ValidationValue = boolean | number | string | null;

type ValidationProps = {
  onDelete?: (itemKey: string) => void;
  onUpdate?: (key: string, value: ValidationValue, itemKey: string) => void;
  onEdit?: () => void;
  onCancel?: () => void;
  options?: ValidationOption[];
  itemKey?: string;
  itemValue?: ValidationValue;
  existingVariables: Record<string, Pick<Variable, 'name' | 'type'>>;
  isBeingEdited?: boolean;
};

const noop = () => {};

const ROW_CLASSES = `group ${MULTI_SELECT_RULE_CLASSES}`;

const parseNumberInput = (value: unknown) => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Human-readable summary for a validation rule's collapsed row, e.g.
 * "Minimum value: 2" or "Same as: Alex".
 */
export const summarizeValidation = (
  key: string,
  value: ValidationValue,
  existingVariables: Record<string, Pick<Variable, 'name' | 'type'>>,
): string => {
  if (!key) {
    return 'New validation rule';
  }

  const label = getValidationLabel(key);

  if (isValidationWithoutValue(key)) {
    return label;
  }

  if (isValidationWithListValue(key)) {
    const variableName =
      typeof value === 'string' ? existingVariables[value]?.name : undefined;
    return `${label}: ${variableName ?? 'No variable selected'}`;
  }

  if (isValidationWithNumberValue(key)) {
    return typeof value === 'number' ? `${label}: ${value}` : `${label}: —`;
  }

  return label;
};

// A draft is only worth saving once it has a rule type, and (when that rule
// type needs one) a value.
const isDraftComplete = (key: string, value: ValidationValue): boolean => {
  if (!key) {
    return false;
  }
  if (isValidationWithoutValue(key)) {
    return true;
  }
  if (isValidationWithNumberValue(key)) {
    return typeof value === 'number';
  }
  if (isValidationWithListValue(key)) {
    return typeof value === 'string' && value.length > 0;
  }
  return false;
};

const Validation = ({
  onDelete = noop,
  onUpdate = noop,
  onEdit = noop,
  onCancel = noop,
  options = [],
  itemKey = '',
  itemValue = null,
  existingVariables,
  isBeingEdited = false,
}: ValidationProps) => {
  const isNewItem = itemKey === '';
  const [draftKey, setDraftKey] = useState(itemKey);
  const [draftValue, setDraftValue] = useState<ValidationValue>(itemValue);

  // Reset the draft to the committed value every time a row (re)starts an
  // edit session, so edits abandoned via Cancel never leak into the next
  // session.
  useEffect(() => {
    if (isBeingEdited) {
      setDraftKey(itemKey);
      setDraftValue(itemValue);
    }
  }, [isBeingEdited, itemKey, itemValue]);

  const handleKeyChange = (option: string | null) => {
    const newKey = option ?? '';
    // Mirror getAutoValue's rule for immediate UI feedback: a value only
    // survives a rule-type change if the previous and new types are
    // value-compatible. The authoritative recompute (relative to the
    // originally committed key) happens in withUpdateHandlers on save.
    setDraftValue((currentValue) => {
      if (!newKey) return null;
      if (isValidationWithoutValue(newKey)) return true;
      if (
        isValidationWithNumberValue(newKey) &&
        isValidationWithNumberValue(draftKey)
      ) {
        return currentValue;
      }
      if (
        isValidationWithListValue(newKey) &&
        isValidationWithListValue(draftKey)
      ) {
        return currentValue;
      }
      return null;
    });
    setDraftKey(newKey);
  };

  const handleSave = () => {
    if (!isDraftComplete(draftKey, draftValue)) {
      return;
    }
    onUpdate(draftKey, draftValue, itemKey);
    onCancel();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const existingVariableOptions = map(
    existingVariables,
    (variableValue, variableKey) => ({
      label: variableValue.name,
      value: variableKey,
    }),
  );

  if (!isBeingEdited) {
    const label = getValidationLabel(itemKey);
    return (
      <div className={ROW_CLASSES}>
        <div className={MULTI_SELECT_OPTIONS_CLASSES}>
          <p className="truncate">
            {summarizeValidation(itemKey, itemValue, existingVariables)}
          </p>
        </div>
        <div className={MULTI_SELECT_CONTROL_CLASSES}>
          <IconButton
            icon={<Pencil />}
            aria-label={`Edit ${label} validation rule`}
            variant="text"
            color="dynamic"
            onClick={onEdit}
          />
          <IconButton
            icon={<Trash2 />}
            aria-label={`Delete ${label} validation rule`}
            variant="text"
            color="destructive"
            className="hover:enabled:bg-destructive hover:enabled:text-destructive-contrast text-current"
            onClick={() => onDelete(itemKey)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={ROW_CLASSES} onKeyDown={handleKeyDown}>
      <div className={MULTI_SELECT_OPTIONS_CLASSES}>
        <div className={MULTI_SELECT_OPTION_CLASSES}>
          <NativeSelectField
            options={options}
            name="validation-key"
            value={draftKey || undefined}
            onChange={(value) =>
              handleKeyChange(typeof value === 'string' ? value : null)
            }
            placeholder="Select validation rule"
            autoFocus
          />
        </div>
        {draftKey && isValidationWithNumberValue(draftKey) && (
          <div className={MULTI_SELECT_OPTION_CLASSES}>
            <InputField
              name="validation-value"
              value={
                typeof draftValue === 'number'
                  ? draftValue.toString()
                  : undefined
              }
              onChange={(value: unknown) =>
                setDraftValue(parseNumberInput(value))
              }
              type="number"
              step="any"
            />
          </div>
        )}
        {draftKey && isValidationWithListValue(draftKey) && (
          <div className={MULTI_SELECT_OPTION_CLASSES}>
            <NativeSelectField
              options={existingVariableOptions}
              name="validation-value"
              value={typeof draftValue === 'string' ? draftValue : undefined}
              onChange={(value) =>
                setDraftValue(typeof value === 'string' ? value : null)
              }
              placeholder="Select comparison variable"
            />
          </div>
        )}
      </div>
      <div className={MULTI_SELECT_CONTROL_CLASSES}>
        <IconButton
          icon={<Check />}
          aria-label={
            isNewItem ? 'Add validation rule' : 'Save validation rule'
          }
          variant="text"
          color="success"
          disabled={!isDraftComplete(draftKey, draftValue)}
          onClick={handleSave}
        />
        <IconButton
          icon={<X />}
          aria-label="Cancel editing validation rule"
          variant="text"
          color="destructive"
          onClick={onCancel}
        />
      </div>
    </div>
  );
};

export default Validation;
