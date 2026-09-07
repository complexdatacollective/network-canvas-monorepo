import { values } from 'es-toolkit/compat';
import { useCallback, useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type {
  CreateFormFieldProps,
  FieldValue,
} from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import type { Variable, VariableOption } from '@codaco/protocol-validation';
import DialogForm from '~/components/DialogForm/DialogForm';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  optionsValidation,
  type OptionValue,
} from '~/components/Form/arrayFields/Options';
import IssueAnchor from '~/components/IssueAnchor';
import LockedOptions from '~/components/Options/LockedOptions';
import {
  isOrdinalOrCategoricalType,
  VARIABLE_OPTIONS,
} from '~/config/variables';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { createVariableAsync } from '~/ducks/modules/protocol/codebook';
import { type FormattedConfig, formatConfig } from '~/i18n/formatConfig';
import { toSubmissionError } from '~/i18n/submissionErrors';
import { getVariablesForSubject } from '~/selectors/codebook';
import safeName from '~/utils/safeName';
const additionalMessages = defineMessages({
  createNewOption: {
    id: 'architect.additional.newVariableWindow.newVariableWindow.createNewOption',
    defaultMessage: 'Create new option',
    description:
      'The addButtonLabel text in components / NewVariableWindow / NewVariableWindow.',
  },
});
const messages = defineMessages({
  attributeDefinition: {
    id: 'architect.newVariableWindow.newVariableWindow.attributeDefinition',
    defaultMessage: 'Attribute definition',
    description:
      'The title text in components / NewVariableWindow / NewVariableWindow.',
  },
  defineTheAttributeSIdentityDataType: {
    id: 'architect.newVariableWindow.newVariableWindow.defineTheAttributeSIdentityDataType',
    defaultMessage:
      "Define the attribute's identity, data type, and available values.",
    description:
      'The description text in components / NewVariableWindow / NewVariableWindow.',
  },
  identity: {
    id: 'architect.newVariableWindow.newVariableWindow.identity',
    defaultMessage: 'Identity',
    description:
      'The title text in components / NewVariableWindow / NewVariableWindow.',
  },
  attributeName: {
    id: 'architect.newVariableWindow.newVariableWindow.attributeName',
    defaultMessage: 'Attribute name',
    description:
      'The description text in components / NewVariableWindow / NewVariableWindow.',
  },
  theAttributeNameIsHowYou: {
    id: 'architect.newVariableWindow.newVariableWindow.theAttributeNameIsHowYou',
    defaultMessage:
      'The attribute name is how you will reference the attribute elsewhere, including in exported data.',
    description:
      'The hint text in components / NewVariableWindow / NewVariableWindow.',
  },
  eGNickname: {
    id: 'architect.newVariableWindow.newVariableWindow.eGNickname',
    defaultMessage: 'e.g. Nickname',
    description:
      'The placeholder text in components / NewVariableWindow / NewVariableWindow.',
  },
  dataType: {
    id: 'architect.newVariableWindow.newVariableWindow.dataType',
    defaultMessage: 'Data type',
    description:
      'The title text in components / NewVariableWindow / NewVariableWindow.',
  },
  attributeType: {
    id: 'architect.newVariableWindow.newVariableWindow.attributeType',
    defaultMessage: 'Attribute type',
    description:
      'The description text in components / NewVariableWindow / NewVariableWindow.',
  },
  selectAttributeType: {
    id: 'architect.newVariableWindow.newVariableWindow.selectAttributeType',
    defaultMessage: 'Select attribute type',
    description:
      'The placeholder text in components / NewVariableWindow / NewVariableWindow.',
  },
  allowedValues: {
    id: 'architect.newVariableWindow.newVariableWindow.allowedValues',
    defaultMessage: 'Allowed values',
    description:
      'The title text in components / NewVariableWindow / NewVariableWindow.',
  },
  options: {
    id: 'architect.newVariableWindow.newVariableWindow.options',
    defaultMessage: 'Options',
    description:
      'The label text in components / NewVariableWindow / NewVariableWindow.',
  },
  createTheValuesThisInputControl: {
    id: 'architect.newVariableWindow.newVariableWindow.createTheValuesThisInputControl',
    defaultMessage:
      'Create the values this input control offers the participant.',
    description:
      'The hint text in components / NewVariableWindow / NewVariableWindow.',
  },
  createNewAttribute: {
    id: 'architect.newVariableWindow.newVariableWindow.createNewAttribute',
    defaultMessage: 'Create New Attribute',
    description:
      'The title text in components / NewVariableWindow / NewVariableWindow.',
  },
  saveAndClose: {
    id: 'architect.newVariableWindow.newVariableWindow.saveAndClose',
    defaultMessage: 'Save and Close',
    description:
      'The submitLabel text in components / NewVariableWindow / NewVariableWindow.',
  },
});

const FORM_ID = 'create-new-variable';

/**
 * A seeded option list the researcher may not edit. `readonly` because the
 * canonical interface-owned sets (`INTERFACE_OWNED_OPTION_SETS`) are declared
 * that way in `@codaco/protocol-validation` and nothing here may mutate one —
 * the alternative, copying each set at its call site, would put the canonical
 * data back into several hands.
 */
export type LockedVariableOptions = readonly VariableOption[];

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
  variableTypeOptions: FormattedConfig<typeof VARIABLE_OPTIONS>;
  initialValues: Record<string, unknown>;
  typeLocked: boolean;
  lockedOptions: LockedVariableOptions | null;
};

const NewVariableFields = ({
  existingVariableNames,
  variableTypeOptions,
  initialValues,
  typeLocked,
  lockedOptions,
}: NewVariableFieldsProps) => {
  const intl = useAppIntl();
  const variableType = useFormStore((state) => {
    const value = state.getFieldState('type')?.value;
    return typeof value === 'string' ? value : undefined;
  });
  const initialOptions = Array.isArray(initialValues.options)
    ? (initialValues.options as OptionValue[])
    : NO_OPTIONS;

  return (
    <Section
      title={intl.formatMessage(messages.attributeDefinition)}
      description={intl.formatMessage(
        messages.defineTheAttributeSIdentityDataType,
      )}
    >
      <Section title={intl.formatMessage(messages.identity)}>
        <IssueAnchor
          fieldName="name"
          description={intl.formatMessage(messages.attributeName)}
        />
        <ArchitectField
          name="name"
          label={intl.formatMessage(messages.attributeName)}
          hint={intl.formatMessage(messages.theAttributeNameIsHowYou)}
          component={VariableNameField}
          placeholder={intl.formatMessage(messages.eGNickname)}
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
      </Section>
      <Section title={intl.formatMessage(messages.dataType)}>
        <IssueAnchor
          fieldName="type"
          description={intl.formatMessage(messages.attributeType)}
        />
        <ArchitectField
          name="type"
          label={intl.formatMessage(messages.attributeType)}
          component={StyledSelectField}
          placeholder={intl.formatMessage(messages.selectAttributeType)}
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
      </Section>
      {isOrdinalOrCategoricalType(variableType) && (
        <Section title={intl.formatMessage(messages.allowedValues)}>
          <IssueAnchor
            fieldName="options"
            description={intl.formatMessage(messages.allowedValues)}
          />
          {lockedOptions ? (
            <LockedOptions options={lockedOptions} />
          ) : (
            <ArchitectArrayField
              name="options"
              label={intl.formatMessage(messages.options)}
              hint={intl.formatMessage(
                messages.createTheValuesThisInputControl,
              )}
              component={Options}
              addButtonLabel={intl.formatMessage(
                additionalMessages.createNewOption,
              )}
              initialValue={initialOptions}
              validation={optionsValidation(intl)}
            />
          )}
        </Section>
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
  lockedOptions?: LockedVariableOptions | null;
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
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
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
        ? formatConfig(VARIABLE_OPTIONS, intl).filter(
            ({ value: optionVariableType }) =>
              allowVariableTypes.includes(optionVariableType),
          )
        : formatConfig(VARIABLE_OPTIONS, intl),
    [allowVariableTypes, intl],
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
          formErrors: [toSubmissionError(error)],
        };
      }
    },
    [dispatch, entity, type, onComplete, lockedOptions, mergedInitialValues],
  );

  /**
   * Every open of this window creates a DIFFERENT variable, so each one needs
   * its own field store — the `key` DialogForm documents for exactly this.
   *
   * The window is mounted for the lifetime of the picker that owns it and only
   * toggles `show`, so without a key the store is shared across opens. What
   * normally hides that is `Modal`'s exit animation: it unmounts the form,
   * whose `useForm` cleanup resets the store. A close that is followed by
   * another open before that exit finishes cancels the removal, so the reset
   * never runs — and the next variable's fields then re-register over the
   * previous one's parked values, which `registerField` prefers over
   * `initialValue`. Creating a boolean variable straight after a categorical
   * one therefore reopened the window still holding `categorical`: the type
   * selector is locked against correcting it, so the options editor it reveals
   * could never be satisfied and the save was blocked for good. The quieter
   * case is worse — a boolean created straight after a TEXT one is stored as
   * text, a wrong-typed codebook variable with nothing on screen to show it.
   *
   * Bumped as the window OPENS (the React-documented adjust-state-on-prop-
   * change pattern) rather than on close, so the entering dialog is the fresh
   * one and a close still animates out.
   */
  const [wasShown, setWasShown] = useState(show);
  const [openCount, setOpenCount] = useState(0);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setOpenCount((count) => count + 1);
    }
  }

  return (
    <DialogForm
      key={openCount}
      open={show}
      onClose={onCancel}
      title={intl.formatMessage(messages.createNewAttribute)}
      formId={FORM_ID}
      submitLabel={intl.formatMessage(messages.saveAndClose)}
      onSubmit={handleSubmit}
    >
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
