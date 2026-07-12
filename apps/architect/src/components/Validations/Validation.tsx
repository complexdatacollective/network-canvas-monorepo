import { map } from 'es-toolkit/compat';
import { Trash2 } from 'lucide-react';

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
  isValidationWithListValue,
  isValidationWithNumberValue,
} from './options';

type ValidationOption = {
  label: string;
  value: string;
};

type ValidationProps = {
  onDelete?: (itemKey: string) => void;
  onUpdate?: (
    key: string,
    value: boolean | number | string | null,
    itemKey: string,
  ) => void;
  options?: ValidationOption[];
  itemKey?: string;
  itemValue?: boolean | number | string | null;
  existingVariables: Record<string, Pick<Variable, 'name' | 'type'>>;
};

const noop = () => {};

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

const Validation = ({
  onDelete = noop,
  onUpdate = noop,
  options = [],
  itemKey = '',
  itemValue = null,
  existingVariables,
}: ValidationProps) => {
  const handleKeyChange = (option: string | null) => {
    onUpdate(option || '', itemValue, itemKey || '');
  };

  const handleNumberValueChange = (newValue: number | null) => {
    onUpdate(itemKey || '', newValue, itemKey || '');
  };

  const handleListValueChange = (newValue: string | null) => {
    onUpdate(itemKey || '', newValue, itemKey || '');
  };

  const keyInputProps = {
    name: 'validation-key',
    value: itemKey ?? null,
    onChange: handleKeyChange,
  };

  const numberValueInputProps = {
    name: 'validation-value',
    value: typeof itemValue === 'number' ? itemValue : null,
    onChange: handleNumberValueChange,
  };

  const listValueInputProps = {
    name: 'validation-value',
    value: typeof itemValue === 'string' ? itemValue : null,
    onChange: handleListValueChange,
  };

  const existingVariableOptions = map(
    existingVariables,
    (variableValue, variableKey) => ({
      label: variableValue.name,
      value: variableKey,
    }),
  );
  return (
    <div className={`group ${MULTI_SELECT_RULE_CLASSES}`}>
      <div className={MULTI_SELECT_OPTIONS_CLASSES}>
        <div className={MULTI_SELECT_OPTION_CLASSES}>
          <NativeSelectField
            options={options}
            name={keyInputProps.name}
            value={keyInputProps.value ?? undefined}
            onChange={(value) =>
              keyInputProps.onChange(typeof value === 'string' ? value : null)
            }
            placeholder="Select validation rule"
          />
        </div>
        {itemKey && isValidationWithNumberValue(itemKey) && (
          <div className={MULTI_SELECT_OPTION_CLASSES}>
            <InputField
              name={numberValueInputProps.name}
              value={numberValueInputProps.value?.toString() ?? undefined}
              onChange={(value: unknown) =>
                numberValueInputProps.onChange(parseNumberInput(value))
              }
              type="number"
              step="any"
            />
          </div>
        )}
        {itemKey && isValidationWithListValue(itemKey) && (
          <div className={MULTI_SELECT_OPTION_CLASSES}>
            <NativeSelectField
              options={existingVariableOptions}
              name={listValueInputProps.name}
              value={listValueInputProps.value ?? undefined}
              onChange={(value) =>
                listValueInputProps.onChange(
                  typeof value === 'string' ? value : null,
                )
              }
              placeholder="Select comparison variable"
            />
          </div>
        )}
      </div>
      <div className={MULTI_SELECT_CONTROL_CLASSES}>
        <IconButton
          icon={<Trash2 />}
          aria-label="Delete validation rule"
          size="sm"
          variant="text"
          color="destructive"
          className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={() => onDelete(itemKey || '')}
        />
      </div>
    </div>
  );
};

export default Validation;
