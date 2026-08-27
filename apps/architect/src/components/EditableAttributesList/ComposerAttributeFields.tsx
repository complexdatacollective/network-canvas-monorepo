import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';

import { asValidationMap } from '../sections/Form/helpers';
import VariableDefinitionFields, {
  VariablePickerSection,
} from '../sections/Form/VariableDefinitionFields';
import {
  CREATE_NEW_VARIABLE_FIELD,
  HiddenFieldValue,
  useFieldHandlers,
} from '../sections/Form/withFieldsHandlers';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * The contradiction check for this editor is a form-level validate
 * (`makeFieldEditorValidate`, wired in EditableAttributesList) whose message
 * belongs to no single control — it can follow from the input control, its
 * options, or its parameters together with the codebook rules and the stage's
 * sibling attributes. A form-level result is reported per FIELD NAME, so the
 * message needs a field of its own: without one it would be invisible and the
 * contradictory edit would save straight back to the codebook. This field
 * holds no value; it exists to carry the error and render it.
 */
export const COMPOSER_CONTRADICTION_FIELD = '_contradiction';

/**
 * Registers the contradiction field and renders its message as a whole-editor
 * alert rather than as a control's error text — there is no control it belongs
 * to. `data-field-name` is what `focusFirstError` scrolls to.
 */
const ContradictionAlert = () => {
  useField({ name: COMPOSER_CONTRADICTION_FIELD });
  const errors = useFormStore((state) =>
    state.getFieldErrors(COMPOSER_CONTRADICTION_FIELD),
  );

  return (
    <div data-field-name={COMPOSER_CONTRADICTION_FIELD}>
      {errors && errors.length > 0 && (
        <Alert variant="destructive" className="my-7">
          <AlertTitle>This attribute cannot be saved</AlertTitle>
          <AlertDescription>{errors.join(' ')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

type ComposerAttributeFieldsProps = {
  entity?: string | null;
  type?: string | null;
  // The stage's committed composer fields and this row's index within them,
  // supplied by DialogArrayField/EditableAttributesList so the variable picker
  // can drop what a sibling attribute already collects.
  composerFields?: unknown;
  editIndex?: number;
  /**
   * The row being edited, merged with its codebook variable's options and
   * validation. Every control seeds its `initialValue` from here — a field
   * that registers empty would blank the property it owns on save.
   */
  item?: Record<string, unknown>;
};

const ComposerAttributeFields = ({
  entity = null,
  type = null,
  composerFields,
  editIndex,
  item = {},
}: ComposerAttributeFieldsProps) => {
  const fields = useFieldHandlers({
    entity: entity ?? '',
    type: type ?? '',
    siblingFields: composerFields,
    editIndex,
  });

  return (
    <>
      <HiddenFieldValue
        name={CREATE_NEW_VARIABLE_FIELD}
        initialValue={asString(item._createNewVariable)}
      />
      {/* This editor has no validation controls, but the contradiction check
          judges the draft against the variable's committed rules — and it can
          only see values the form actually reports. Carrying them through
          also means the save writes them back unchanged. */}
      <HiddenFieldValue
        name="validation"
        initialValue={asValidationMap(item.validation) ?? undefined}
      />
      <ContradictionAlert />
      <VariablePickerSection
        entity={entity}
        type={type}
        item={item}
        fields={fields}
        withSectionTitles
        hint="Create or select a codebook attribute. If you select an existing attribute, any changes you make to the input control or validation options will also change other uses of this attribute."
      />

      <Section
        title="Display caption"
        description="Optionally customize how this attribute is named in the side panel."
        disabled={!fields.variable}
      >
        <ArchitectField
          name="label"
          label="Caption"
          hint="When left empty, the attribute name is shown instead."
          component={InputField}
          initialValue={asString(item.label)}
          validation={{}}
          placeholder="Defaults to the attribute name"
        />
      </Section>

      <VariableDefinitionFields
        entity={entity}
        type={type}
        item={item}
        fields={fields}
        withSectionTitles
      />
    </>
  );
};

export default ComposerAttributeFields;
