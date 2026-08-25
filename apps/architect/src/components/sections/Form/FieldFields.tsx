import { omit } from 'es-toolkit/compat';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';
import IssueAnchor from '~/components/IssueAnchor';

import ValidationSection from '../ValidationSection';
import { asValidationMap } from './helpers';
import VariableDefinitionFields, {
  VariablePickerSection,
} from './VariableDefinitionFields';
import {
  CREATE_NEW_VARIABLE_FIELD,
  HiddenFieldValue,
  useFieldHandlers,
} from './withFieldsHandlers';

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
        hint="Select an attribute"
      />

      <IssueAnchor fieldName="prompt" description="Question text" />
      <Section
        title="Participant prompt"
        description="Write the question participants will answer in this form field."
      >
        <ArchitectField
          name="prompt"
          label="Question text"
          hint="The question to display to the participant. Supports markdown formatting."
          component={RichText}
          initialValue={asString(item.prompt)}
          validation={{ required: true }}
          singleLine
          placeholder="What is this person's name?"
        />
      </Section>
      <Section
        title="Answer guidance"
        description="Add optional guidance and choose whether validation requirements are shown to participants."
      >
        <ArchitectField
          name="hint"
          label="Hint text"
          hint="Optionally display a markdown-formatted hint below the question, to help participants understand how to answer."
          component={RichText}
          initialValue={asString(item.hint)}
          validation={{}}
          singleLine
          placeholder="e.g. Select all that apply..."
        />
        <ArchitectField
          name="showValidationHints"
          label="Show validation hints"
          hint="Automatically display hints derived from this field's validation rules, helping participants understand input requirements."
          component={ToggleField}
          inline
          initialValue={item.showValidationHints === true}
          validation={{}}
        />
      </Section>

      <VariableDefinitionFields
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
        showHeading={false}
      />
    </>
  );
};

export default FieldFields;
