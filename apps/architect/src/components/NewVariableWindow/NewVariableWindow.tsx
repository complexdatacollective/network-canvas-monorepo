import { values } from 'es-toolkit/compat';
import { useCallback, useMemo, useRef } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type {
  CreateFormFieldProps,
  FieldValue,
} from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type { Variable, VariableOptions } from '@codaco/protocol-validation';
import DialogForm from '~/components/DialogForm/DialogForm';
import DirtyProbe from '~/components/DialogForm/DirtyProbe';
import { Section, Subsection } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  completeOptions,
  minTwoOptions,
  type OptionValue,
} from '~/components/Form/arrayFields/Options';
import LockedOptions from '~/components/Options/LockedOptions';
import {
  isOrdinalOrCategoricalType,
  VARIABLE_OPTIONS,
} from '~/config/variables';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { createVariableAsync } from '~/ducks/modules/protocol/codebook';
import { getVariablesForSubject } from '~/selectors/codebook';
import { ensureError } from '~/utils/ensureError';
import { getFieldId } from '~/utils/issues';
import safeName from '~/utils/safeName';

const FORM_ID = 'create-new-variable';

/** Stable empty list: `initialValue` is a register-effect dependency. */
const NO_OPTIONS: OptionValue[] = [];

type VariableNameFieldProps = CreateFormFieldProps<
  string,
  'input',
  {
    // Narrows the `size` an <input> would otherwise contribute (a number) to
    // the control-size scale `InputField` expects.
    size?: 'sm' | 'md' | 'lg' | 'xl';
  }
>;

/**
 * Variable names are NMTOKENs, so the characters `safeName` strips can never
 * be part of one, so the value is filtered on change rather than only
 * validated.
 */
const VariableNameField = ({
  value,
  onChange,
  ...props
}: VariableNameFieldProps) => (
  <InputField
    {...props}
    value={value ?? ''}
    onChange={(nextValue) => onChange?.(safeName(nextValue ?? ''))}
  />
);

export type Entity = 'node' | 'edge' | 'ego';

type NewVariableFieldsProps = {
  existingVariableNames: string[];
  variableTypeOptions: typeof VARIABLE_OPTIONS;
  initialValues: Record<string, unknown>;
  typeLocked: boolean;
  lockedOptions: VariableOptions | null;
};

const NewVariableFields = ({
  existingVariableNames,
  variableTypeOptions,
  initialValues,
  typeLocked,
  lockedOptions,
}: NewVariableFieldsProps) => {
  const variableType = useFormStore((state) => {
    const value = state.getFieldState('type')?.value;
    return typeof value === 'string' ? value : undefined;
  });
  const initialOptions = Array.isArray(initialValues.options)
    ? (initialValues.options as OptionValue[])
    : NO_OPTIONS;

  return (
    <Section layout="vertical">
      <Subsection id={getFieldId('name')} title="Variable Name">
        <ArchitectField
          name="name"
          label="Variable name"
          labelHidden
          hint="The variable name is how you will reference the variable elsewhere, including in exported data."
          component={VariableNameField}
          placeholder="e.g. Nickname"
          initialValue={
            typeof initialValues.name === 'string'
              ? initialValues.name
              : undefined
          }
          validation={{
            required: true,
            uniqueByList: existingVariableNames,
            allowedVariableName: true,
          }}
        />
      </Subsection>
      <Subsection id={getFieldId('type')} title="Variable Type">
        <ArchitectField
          name="type"
          label="Variable type"
          labelHidden
          component={StyledSelectField}
          placeholder="Select variable type"
          options={variableTypeOptions}
          initialValue={
            typeof initialValues.type === 'string'
              ? initialValues.type
              : undefined
          }
          // Locked options only make sense for a categorical/ordinal type, so
          // lock the type selector too — otherwise a caller passing
          // lockedOptions without initialValues.type could switch away from
          // that type while the options and readOnly flag stay locked.
          disabled={typeLocked}
          validation={{ required: true }}
        />
      </Subsection>
      {isOrdinalOrCategoricalType(variableType) && (
        <Subsection id={getFieldId('options')} title="Options">
          {lockedOptions ? (
            <>
              <p className="text-sm text-current/70">
                These options are automatically configured by the interface and
                cannot be modified.
              </p>
              <LockedOptions options={lockedOptions} />
            </>
          ) : (
            <ArchitectArrayField
              name="options"
              label="Options"
              labelHidden
              hint="Create the values this input control offers the participant."
              component={Options}
              initialValue={initialOptions}
              validation={{ minTwoOptions, completeOptions }}
            />
          )}
        </Subsection>
      )}
    </Section>
  );
};

type NewVariableWindowProps = {
  show?: boolean;
  entity: Entity;
  type: string;
  allowVariableTypes?: string[] | null;
  onComplete: (variable: string) => void;
  onCancel: () => void;
  initialValues?: Record<string, unknown> | null;
  /** Pre-defined options that cannot be edited. When provided, the options section is read-only. */
  lockedOptions?: VariableOptions | null;
};

export default function NewVariableWindow({
  show = false,
  entity,
  type,
  allowVariableTypes = null,
  onComplete,
  onCancel,
  initialValues = null,
  lockedOptions = null,
}: NewVariableWindowProps) {
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const dirtyRef = useRef(false);
  // Memoize subject to avoid creating new object on every render, which breaks selector memoization
  const subject = useMemo(() => ({ entity, type }), [entity, type]);
  const existingVariables = useAppSelector((state) =>
    getVariablesForSubject(state, subject),
  );
  const existingVariableNames = useMemo(
    () => values(existingVariables).map(({ name }: Variable) => name),
    [existingVariables],
  );
  const filteredVariableOptions = useMemo(
    () =>
      allowVariableTypes
        ? VARIABLE_OPTIONS.filter(({ value: optionVariableType }) =>
            allowVariableTypes.includes(optionVariableType),
          )
        : VARIABLE_OPTIONS,
    [allowVariableTypes],
  );
  // Merge locked options into initial values if provided
  const mergedInitialValues = useMemo(() => {
    if (lockedOptions) {
      return { ...initialValues, options: lockedOptions };
    }
    return initialValues ?? {};
  }, [initialValues, lockedOptions]);

  const handleSubmit = useCallback(
    async (formValues: Record<string, FieldValue>) => {
      // Locked options are never rendered as a field, so they are carried over
      // from the seed rather than read back out of the form.
      const configuration = { ...mergedInitialValues, ...formValues };
      // Locked options belong to an interface-owned value set the researcher may
      // not edit; persist readOnly so the shared options editors enforce it.
      const withReadOnly = lockedOptions
        ? { ...configuration, readOnly: true }
        : configuration;

      try {
        // unwrap() re-throws the thunk's error (a duplicate or invalid name)
        // instead of resolving to a rejected action with no payload.
        const result = await dispatch(
          createVariableAsync({
            entity,
            type,
            configuration: withReadOnly as Partial<Variable>,
          }),
        ).unwrap();
        onComplete(result.variable);
      } catch (error) {
        // Keep the dialog open and say why, rather than closing on a failure.
        return {
          success: false as const,
          formErrors: [ensureError(error).message],
        };
      }
    },
    [dispatch, entity, type, onComplete, lockedOptions, mergedInitialValues],
  );

  const handleCancel = useCallback(async () => {
    // An untouched form loses nothing, so close immediately. Once the author has
    // started filling it in, confirm before discarding — so an accidental
    // backdrop/outside click or Esc can't silently drop a partially-authored
    // variable.
    if (!dirtyRef.current) {
      onCancel();
      return;
    }
    const confirmed = await openDialog({
      type: 'choice',
      intent: 'warning',
      title: 'Unsaved Changes',
      description:
        'You have unsaved changes. Are you sure you want to close without saving?',
      actions: {
        primary: { label: 'Close Without Saving', value: true },
        cancel: { label: 'Cancel', value: false },
      },
    });
    if (confirmed) {
      onCancel();
    }
  }, [onCancel, openDialog]);

  return (
    <DialogForm
      open={show}
      onClose={() => void handleCancel()}
      title="Create New Variable"
      formId={FORM_ID}
      submitLabel="Save and Close"
      onSubmit={handleSubmit}
    >
      <DirtyProbe dirtyRef={dirtyRef} />
      <NewVariableFields
        existingVariableNames={existingVariableNames}
        variableTypeOptions={filteredVariableOptions}
        initialValues={mergedInitialValues}
        typeLocked={!!initialValues?.type || !!lockedOptions}
        lockedOptions={lockedOptions}
      />
    </DialogForm>
  );
}
