import { omit } from 'es-toolkit/compat';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
import IssueAnchor from '~/components/IssueAnchor';

import ValidationSection from '../ValidationSection';
import { asValidationMap } from './helpers';
import {
  InputControlFields,
  VariableConfigurationFields,
  VariablePickerSection,
} from './VariableDefinitionFields';
import {
  CREATE_NEW_VARIABLE_FIELD,
  HiddenFieldValue,
  useFieldHandlers,
} from './withFieldsHandlers';
const messages = defineMessages({
  selectAnAttribute: {
    id: 'architect.sections.form.fieldFields.selectAnAttribute',
    defaultMessage: 'Select an attribute',
    description: 'The hint text in components / sections / Form / FieldFields.',
  },
  fieldConfiguration: {
    id: 'architect.sections.form.fieldFields.fieldConfiguration',
    defaultMessage: 'Field configuration',
    description:
      'The title text in components / sections / Form / FieldFields.',
  },
  writeTheParticipantFacingPromptAndChoose: {
    id: 'architect.sections.form.fieldFields.writeTheParticipantFacingPromptAndChoose',
    defaultMessage:
      'Write the participant-facing prompt and choose how the response is collected.',
    description:
      'The description text in components / sections / Form / FieldFields.',
  },
  questionText: {
    id: 'architect.sections.form.fieldFields.questionText',
    defaultMessage: 'Question text',
    description:
      'The description text in components / sections / Form / FieldFields.',
  },
  theQuestionToDisplayToThe: {
    id: 'architect.sections.form.fieldFields.theQuestionToDisplayToThe',
    defaultMessage:
      'The question to display to the participant. Supports markdown formatting.',
    description: 'The hint text in components / sections / Form / FieldFields.',
  },
  whatIsThisPersonSName: {
    id: 'architect.sections.form.fieldFields.whatIsThisPersonSName',
    defaultMessage: "What is this person's name?",
    description:
      'The placeholder text in components / sections / Form / FieldFields.',
  },
  hintText: {
    id: 'architect.sections.form.fieldFields.hintText',
    defaultMessage: 'Hint text',
    description:
      'The label text in components / sections / Form / FieldFields.',
  },
  optionallyDisplayAMarkdownFormattedHintBelow: {
    id: 'architect.sections.form.fieldFields.optionallyDisplayAMarkdownFormattedHintBelow',
    defaultMessage:
      'Optionally display a markdown-formatted hint below the question, to help participants understand how to answer.',
    description: 'The hint text in components / sections / Form / FieldFields.',
  },
  eGSelectAllThatApply: {
    id: 'architect.sections.form.fieldFields.eGSelectAllThatApply',
    defaultMessage: 'e.g. Select all that apply...',
    description:
      'The placeholder text in components / sections / Form / FieldFields.',
  },
  showValidationHints: {
    id: 'architect.sections.form.fieldFields.showValidationHints',
    defaultMessage: 'Show validation hints',
    description:
      'The label text in components / sections / Form / FieldFields.',
  },
  automaticallyDisplayHintsDerivedFromThis: {
    id: 'architect.sections.form.fieldFields.automaticallyDisplayHintsDerivedFromThis',
    defaultMessage:
      "Automatically display hints derived from this field's validation rules, helping participants understand input requirements.",
    description: 'The hint text in components / sections / Form / FieldFields.',
  },
});

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

type FieldFieldsProps = {
  entity?: string | null;
  type?: string | null;
  currentStageIndex?: number;
  /**
   * The committed fields of the form this editor edits a row of, and that
   * row's array index. One form may not collect a variable twice, so a
   * variable a sibling field already claims must not be offered.
   * `DialogArrayField` supplies `editIndex` to both this component and
   * `editorValidate`, so the picker and the save-time gate exclude the same row.
   */
  siblingFields?: unknown;
  editIndex?: number;
  /**
   * The row being edited, already merged with its codebook variable. Every
   * control seeds its `initialValue` from here — `getFormValues()` reports
   * registered fields only, so a field that registers empty would blank the
   * property it owns when the dialog saves.
   */
  item?: Record<string, unknown>;
};

const FieldFields = ({
  entity = null,
  type = null,
  currentStageIndex,
  siblingFields,
  editIndex,
  item = {},
}: FieldFieldsProps) => {
  const intl = useAppIntl();
  const fields = useFieldHandlers({
    entity: entity ?? '',
    type: type ?? '',
    siblingFields,
    editIndex,
    currentStageIndex,
  });
  const { variable, variableType, isNewVariable, existingVariables } = fields;

  return (
    <>
      <HiddenFieldValue
        name={CREATE_NEW_VARIABLE_FIELD}
        initialValue={asString(item._createNewVariable)}
      />
      <VariablePickerSection
        entity={entity}
        type={type}
        item={item}
        fields={fields}
        hint={intl.formatMessage(messages.selectAnAttribute)}
      />

      <Section
        title={intl.formatMessage(messages.fieldConfiguration)}
        description={intl.formatMessage(
          messages.writeTheParticipantFacingPromptAndChoose,
        )}
      >
        <IssueAnchor
          fieldName="prompt"
          description={intl.formatMessage(messages.questionText)}
        />
        <ArchitectField
          name="prompt"
          label={intl.formatMessage(messages.questionText)}
          hint={intl.formatMessage(messages.theQuestionToDisplayToThe)}
          component={RichText}
          initialValue={asString(item.prompt)}
          validation={{ required: true }}
          singleLine
          placeholder={intl.formatMessage(messages.whatIsThisPersonSName)}
        />
        <ArchitectField
          name="hint"
          label={intl.formatMessage(messages.hintText)}
          hint={intl.formatMessage(
            messages.optionallyDisplayAMarkdownFormattedHintBelow,
          )}
          component={RichText}
          initialValue={asString(item.hint)}
          validation={{}}
          singleLine
          placeholder={intl.formatMessage(messages.eGSelectAllThatApply)}
        />
        <ArchitectField
          name="showValidationHints"
          label={intl.formatMessage(messages.showValidationHints)}
          hint={intl.formatMessage(
            messages.automaticallyDisplayHintsDerivedFromThis,
          )}
          component={ToggleField}
          inline
          initialValue={item.showValidationHints === true}
          validation={{}}
        />
        <InputControlFields
          entity={entity}
          type={type}
          item={item}
          fields={fields}
        />
      </Section>

      <VariableConfigurationFields
        entity={entity}
        type={type}
        item={item}
        fields={fields}
      />

      <ValidationSection
        disabled={!variableType}
        entity={entity ?? ''}
        initialValue={asValidationMap(item.validation)}
        variableType={
          typeof variableType === 'string' ? variableType : undefined
        }
        existingVariables={omit(existingVariables, variable ?? '')}
        allVariables={existingVariables}
        // Audit sweep: `handleNewVariable` writes the typed DISPLAY NAME into
        // `variable` as well as `_createNewVariable`, so a non-empty
        // `variable` is only a committed codebook id once the variable
        // exists. Commit 02f3e9cbe taught the form-level validator this; the
        // row-level check kept the conflation, so a typed name colliding with
        // a real codebook id let the row offer a reference rule the dialog
        // then rejected on save.
        currentVariableId={!isNewVariable && variable ? variable : ''}
      />
    </>
  );
};

export default FieldFields;
