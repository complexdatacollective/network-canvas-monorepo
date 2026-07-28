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

import { findDraftContradictions, floorIssue } from './contradictions';
import { isValidationWithListValue } from './options';
import Validation from './Validation';

// redux-form calls a field validator with the field's raw value, which is null
// or undefined until the field holds one.
type ValidationsValue = Record<string, unknown> | null | undefined;

const validate = (validations: ValidationsValue): string | undefined => {
  const values = toPairs(validations ?? {});

  const check = values.reduce((acc: string[], [key, value]) => {
    if (!isNull(value)) {
      return acc;
    }
    acc.push(key);
    return acc;
  }, []);

  if (check.length === 0) {
    return undefined;
  }

  return `Validations (${check.join(', ')}) must have values`;
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
  validationOptions?: ValidationOption[];
  value?: Record<string, unknown>;
  addNew: boolean;
  setAddNew: (value: boolean) => void;
  handleChange: (key: string, value: unknown, itemKey: string) => void;
  handleDelete: (itemKey: string) => void;
  handleAddNew: (key: string, value: unknown, itemKey: string) => void;
  existingVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  variableType?: string;
  allVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  currentVariableId?: string;
  draftOptions?: unknown;
};

const Validations = ({
  name,
  validationOptions = [],
  existingVariables = {},
  value = {},
  addNew,
  setAddNew,
  handleChange,
  handleDelete,
  handleAddNew,
  variableType,
  allVariables,
  currentVariableId,
  draftOptions,
}: ValidationsProps) => {
  // Only one row (existing or the "add new" draft) is ever open for editing
  // at a time.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const usedOptions = getKeys(value);

  const uniqueValueCount = useMemo(() => {
    if (variableType !== 'boolean' && variableType !== 'ordinal') {
      return undefined;
    }
    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v);
    const current = allVariables?.[currentVariableId ?? ''];
    const storedOptions =
      isRecord(current) && 'options' in current ? current.options : undefined;
    const options = Array.isArray(draftOptions)
      ? draftOptions
      : Array.isArray(storedOptions)
        ? storedOptions
        : undefined;
    // Fifteenth-wave Finding 2: `booleanOptionsSchema` accepts a single-option
    // array, so a Boolean can genuinely offer one value — with `unique` set,
    // the second entity to answer then has nothing left to pick. Only an
    // ABSENT options array means the unrestricted Yes/No default of two; an
    // ordinal with no options configured yet has no domain to report at all.
    if (options === undefined)
      return variableType === 'boolean' ? 2 : undefined;
    // Sixteenth-wave Finding 2: count DISTINCT option values, for ordinals as
    // well as Booleans. Two options may carry the same `value`, and the
    // runtime stores one value per distinct value — counting option entries
    // would overstate how many entities can hold a unique answer.
    return new Set(
      options
        .map((option) => (isRecord(option) ? option.value : undefined))
        .filter((optionValue) => optionValue !== undefined),
    ).size;
  }, [variableType, draftOptions, allVariables, currentVariableId]);

  const checkDraft = useMemo(
    () =>
      (
        ruleKey: string,
        ruleValue: unknown,
        replacingKey?: string,
      ): string[] => {
        // R1 floor check runs ahead of the contradiction analyser: a below-floor
        // value (e.g. maxLength 0) is meaningless input the schema would reject
        // outright, so there is no point feeding it into findDraftContradictions.
        const floor = floorIssue(ruleKey, ruleValue);
        if (floor) return [floor];
        const prospective: Record<string, unknown> = { ...value };
        if (replacingKey && replacingKey !== ruleKey) {
          delete prospective[replacingKey];
        }
        prospective[ruleKey] = ruleValue;
        // The Anonymisation passphrase is not a codebook variable; a text
        // surrogate lets the local length-pair check still apply.
        const isPassphrase = variableType === 'passphrase';
        return findDraftContradictions({
          allVariables: isPassphrase ? {} : (allVariables ?? {}),
          currentVariableId: currentVariableId ?? '',
          variableType: isPassphrase ? 'text' : (variableType ?? ''),
          validation: prospective,
          options: draftOptions,
        }).map((contradiction) => contradiction.message);
      },
    [value, allVariables, currentVariableId, variableType, draftOptions],
  );

  // A reference rule (e.g. "Same as") is disabled in the dropdown once no
  // existing variable could legally serve as its target.
  const availableOptions = getOptionsWithUsedDisabled(
    validationOptions,
    usedOptions,
  ).map((option) => {
    if (option.disabled || !isValidationWithListValue(option.value)) {
      return option;
    }
    const hasLegalTarget = Object.keys(existingVariables).some(
      (candidateId) =>
        checkDraft(option.value, candidateId, editingKey ?? undefined)
          .length === 0,
    );
    return hasLegalTarget ? option : { ...option, disabled: true };
  });
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
        checkDraft={checkDraft}
        uniqueValueCount={uniqueValueCount}
      >
        {addNew && (
          <Validation
            isBeingEdited
            onUpdate={handleAddNew}
            onCancel={() => setAddNew(false)}
            options={availableOptions}
            existingVariables={existingVariables}
            checkDraft={checkDraft}
            uniqueValueCount={uniqueValueCount}
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
