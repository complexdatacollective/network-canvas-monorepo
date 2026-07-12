import { values } from 'es-toolkit/compat';
import type { ComponentType } from 'react';
import { useCallback, useMemo } from 'react';
import { Field, formValueSelector, isDirty } from 'redux-form';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Variable, VariableOptions } from '@codaco/protocol-validation';
import { Section, Subsection } from '~/components/EditorLayout';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
import InlineEditScreen from '~/components/InlineEditScreen';
import Options from '~/components/Options';
import LockedOptions from '~/components/Options/LockedOptions';
import {
  isOrdinalOrCategoricalType,
  VARIABLE_OPTIONS,
} from '~/config/variables';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { createVariableAsync } from '~/ducks/modules/protocol/codebook';
import { getVariablesForSubject } from '~/selectors/codebook';
import { getFieldId } from '~/utils/issues';
import safeName from '~/utils/safeName';
import { validations } from '~/utils/validations';
const form = 'create-new-variable';
const isRequired = validations.required();
const isAllowedVariableName = validations.allowedVariableName();
const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const FrescoStyledSelectField = StyledSelectField as ComponentType<
  Record<string, unknown>
>;

export type Entity = 'node' | 'edge' | 'ego';
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
  const variableType = useAppSelector(
    (state) => formValueSelector(form)(state, 'type') as string | undefined,
  );
  const hasUnsavedChanges = useAppSelector((state) => isDirty(form)(state));
  // Memoize subject to avoid creating new object on every render, which breaks selector memoization
  const subject = useMemo(() => ({ entity, type }), [entity, type]);
  const existingVariables = useAppSelector((state) =>
    getVariablesForSubject(state, subject),
  );
  const existingVariableNames = useMemo(
    () => values(existingVariables).map(({ name }: Variable) => name),
    [existingVariables],
  );
  const validateName = useCallback(
    (value: string) => validations.uniqueByList(existingVariableNames)(value),
    [existingVariableNames],
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
      return {
        ...initialValues,
        options: lockedOptions,
      };
    }
    return initialValues;
  }, [initialValues, lockedOptions]);
  const handleCreateNewVariable = useCallback(
    async (configuration: Record<string, unknown>) => {
      // Locked options belong to an interface-owned value set the researcher may
      // not edit; persist readOnly so the shared options editors enforce it.
      const withReadOnly = lockedOptions
        ? { ...configuration, readOnly: true }
        : configuration;
      const result = await dispatch(
        createVariableAsync({
          entity,
          type,
          configuration: withReadOnly as Partial<Variable>,
        }),
      ).unwrap();
      onComplete(result.variable);
    },
    [dispatch, entity, type, onComplete, lockedOptions],
  );
  const handleCancel = useCallback(async () => {
    // An untouched form loses nothing, so close immediately. Once the author has
    // started filling it in, confirm before discarding — so an accidental
    // backdrop/outside click or Esc can't silently drop a partially-authored
    // variable.
    if (!hasUnsavedChanges) {
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
  }, [hasUnsavedChanges, onCancel, openDialog]);
  return (
    <InlineEditScreen
      show={show}
      form={form}
      onSubmit={(formValues: unknown) =>
        handleCreateNewVariable(formValues as Record<string, unknown>)
      }
      onCancel={handleCancel}
      initialValues={mergedInitialValues ?? undefined}
      title="Create New Variable"
    >
      <Section layout="vertical">
        <Subsection
          id={getFieldId('name')}
          title="Variable Name"
          summary={
            <Paragraph>
              Enter a name for this variable. The variable name is how you will
              reference the variable elsewhere, including in exported data.
            </Paragraph>
          }
        >
          <Field
            name="name"
            label="Variable name"
            labelHidden
            component={FrescoReduxField}
            placeholder="e.g. Nickname"
            fieldComponent={FrescoInputField}
            validate={[isRequired, validateName, isAllowedVariableName]}
            normalize={safeName}
          />
        </Subsection>
        <Subsection
          id={getFieldId('type')}
          title="Variable Type"
          summary={<Paragraph>Choose a variable type</Paragraph>}
        >
          <ValidatedField
            name="type"
            label="Variable type"
            labelHidden
            component={FrescoReduxField}
            validation={{ required: true }}
            componentProps={{
              fieldComponent: FrescoStyledSelectField,
              placeholder: 'Select variable type',
              options: filteredVariableOptions,
              // Locked options only make sense for a categorical/ordinal type, so
              // lock the type selector too — otherwise a caller passing
              // lockedOptions without initialValues.type could switch away from
              // that type while the options and readOnly flag stay locked.
              disabled: !!initialValues?.type || !!lockedOptions,
            }}
          />
        </Subsection>
        {isOrdinalOrCategoricalType(variableType) && (
          <Subsection
            id={getFieldId('options')}
            title="Options"
            summary={
              lockedOptions ? (
                <Paragraph>
                  These options are automatically configured by the interface
                  and cannot be modified.
                </Paragraph>
              ) : (
                <Paragraph>
                  Create some options for this input control
                </Paragraph>
              )
            }
          >
            {lockedOptions ? (
              <LockedOptions options={lockedOptions} />
            ) : (
              <Options name="options" label="Options" />
            )}
          </Subsection>
        )}
      </Section>
    </InlineEditScreen>
  );
}
