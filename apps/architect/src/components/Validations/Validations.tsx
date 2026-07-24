import { keys as getKeys, isNull, toPairs } from 'es-toolkit/compat';
import { Plus } from 'lucide-react';
import {
  useId,
  useMemo,
  useState,
  type ReactNode,
  type ComponentProps,
} from 'react';
import { Field } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import type { Variable } from '@codaco/protocol-validation';

import Validation from './Validation';

// redux-form calls a field validator with the field's raw value, which is null
// or undefined until the field holds one.
type ValidationsValue = Record<string, unknown> | null | undefined;

// A scalar's bounds double as the visual analog scale's rendered track, so an
// orphaned or inverted pair produces a scale no participant can answer. The
// schema rejects it; catch it here so the error appears while editing rather
// than at protocol validation.
const validateScalarBounds = (
  validations: ValidationsValue,
): string | undefined => {
  if (!validations) return undefined;

  const { minValue, maxValue } = validations;
  const hasMin = typeof minValue === 'number';
  const hasMax = typeof maxValue === 'number';

  if (hasMin && !hasMax) {
    return 'Minimum value needs a Maximum value greater than it';
  }

  if (hasMax && !hasMin) {
    return 'Maximum value needs a Minimum value less than it';
  }

  if (hasMin && hasMax && minValue >= maxValue) {
    return 'Minimum value must be less than Maximum value';
  }

  return undefined;
};

export const makeValidate =
  (variableType: string) =>
  (validations: ValidationsValue): string | undefined => {
    const values = toPairs(validations ?? {});

    const check = values.reduce((acc: string[], [key, value]) => {
      if (!isNull(value)) {
        return acc;
      }
      acc.push(key);
      return acc;
    }, []);

    if (check.length > 0) {
      return `Validations (${check.join(', ')}) must have values`;
    }

    if (variableType === 'scalar') {
      return validateScalarBounds(validations);
    }

    return undefined;
  };

const format = (value: Record<string, unknown> = {}) => toPairs(value);

const getOptionsWithUsedDisabled = (
  options: ValidationOption[],
  used: string[],
) =>
  options.map((option) => {
    if (!used.includes(option.value)) {
      return option;
    }
    return { ...option, disabled: true };
  });

const AddItem = (props: ComponentProps<typeof Button>) => (
  <Button
    color="primary"
    icon={<Plus />}
    className="self-start"
    // eslint-disable-next-line react/jsx-props-no-spreading
    {...props}
  >
    Add new
  </Button>
);

type ValidationOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type ValidationsFieldProps = {
  input: {
    value: Array<[string, string | number | boolean | null]>;
  };
  options?: ValidationOption[];
  existingVariables: Record<string, Pick<Variable, 'name' | 'type'>>;
  meta: {
    submitFailed: boolean;
    error?: string;
  };
  children?: ReactNode;
  editingKey: string | null;
  onEditKey: (key: string | null) => void;
  onUpdate?: (key: string, value: unknown, itemKey: string) => void;
  onDelete?: (itemKey: string) => void;
};

const ValidationsField = ({
  input,
  options = [],
  existingVariables,
  meta: { submitFailed, error },
  children = null,
  editingKey,
  onEditKey,
  ...rest
}: ValidationsFieldProps) => {
  const hasError = !!(submitFailed && error);
  const errorId = useId();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-5">
        {input.value.map(([key, value]) => (
          <Validation
            key={key}
            itemKey={key}
            itemValue={value}
            options={options}
            existingVariables={existingVariables}
            isBeingEdited={key === editingKey}
            onEdit={() => onEditKey(key)}
            onCancel={() => onEditKey(null)}
            // eslint-disable-next-line react/jsx-props-no-spreading
            {...rest}
          />
        ))}
        {children}
      </div>
      <FieldErrors id={errorId} errors={error ? [error] : []} show={hasError} />
    </div>
  );
};

type ValidationsProps = {
  name: string;
  variableType: string;
  validationOptions?: ValidationOption[];
  value?: Record<string, unknown>;
  addNew: boolean;
  setAddNew: (value: boolean) => void;
  handleChange: (key: string, value: unknown, itemKey: string) => void;
  handleDelete: (itemKey: string) => void;
  handleAddNew: (key: string, value: unknown, itemKey: string) => void;
  existingVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
};

const Validations = ({
  name,
  variableType,
  validationOptions = [],
  existingVariables = {},
  value = {},
  addNew,
  setAddNew,
  handleChange,
  handleDelete,
  handleAddNew,
}: ValidationsProps) => {
  // Only one row (existing or the "add new" draft) is ever open for editing
  // at a time.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // redux-form re-runs validation whenever this identity changes.
  const validate = useMemo(() => makeValidate(variableType), [variableType]);
  const usedOptions = getKeys(value);
  const availableOptions = getOptionsWithUsedDisabled(
    validationOptions,
    usedOptions,
  );
  const isFull = usedOptions.length === availableOptions.length;
  const isEditingSomething = addNew || editingKey !== null;

  const handleSaveExisting = (
    key: string,
    itemValue: unknown,
    itemKey: string,
  ) => {
    handleChange(key, itemValue, itemKey);
    setEditingKey(null);
  };

  const handleDeleteExisting = (itemKey: string) => {
    handleDelete(itemKey);
    setEditingKey((current) => (current === itemKey ? null : current));
  };

  const handleStartAddNew = () => {
    setEditingKey(null);
    setAddNew(true);
  };

  return (
    <div className="flex w-full flex-col gap-5 [--rule-bg:oklch(var(--slate-blue))] [&_button]:m-0">
      <Field
        name={name}
        component={ValidationsField}
        format={format}
        options={availableOptions}
        existingVariables={existingVariables}
        onUpdate={handleSaveExisting}
        onDelete={handleDeleteExisting}
        editingKey={editingKey}
        onEditKey={setEditingKey}
        validate={validate}
      >
        {addNew && (
          <Validation
            isBeingEdited
            onUpdate={handleAddNew}
            onCancel={() => setAddNew(false)}
            options={availableOptions}
            existingVariables={existingVariables}
          />
        )}
      </Field>

      {!isFull && (
        <AddItem onClick={handleStartAddNew} disabled={isEditingSomething} />
      )}
    </div>
  );
};

export default Validations;
