import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  optionsValidation,
  type OptionValue,
} from '~/components/Form/arrayFields/Options';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import { getLockedOptions } from '~/components/Options/getLockedOptions';
import LockedOptions from '~/components/Options/LockedOptions';
import Parameters from '~/components/Parameters';
import { asParameterValues } from '~/components/Parameters/parameterValues';
import {
  isBooleanWithOptions,
  isOrdinalOrCategoricalType,
  isVariableTypeWithParameters,
} from '~/config/variables';
import { getFieldId } from '~/utils/issues';

import BooleanChoice from '../BooleanChoice';
import ExternalLink from '../ExternalLink';
import InputPreview from '../Form/Fields/InputPreview';
import { asValidationMap, toSelectOptions } from '../sections/Form/helpers';
import {
  CREATE_NEW_VARIABLE_FIELD,
  HiddenFieldValue,
  useFieldHandlers,
} from '../sections/Form/withFieldsHandlers';

/** Stable empty list: `initialValue` is a register-effect dependency. */
const NO_OPTIONS: OptionValue[] = [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asOptions = (value: unknown): OptionValue[] =>
  Array.isArray(value) ? (value as OptionValue[]) : NO_OPTIONS;

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
  const {
    variable,
    variableType,
    isNewVariable,
    variableOptions,
    component,
    componentOptions,
    metaForType,
    existingVariables,
    hasInterfaceOwnedOptions,
    handleNewVariable,
  } = useFieldHandlers({
    entity: entity ?? '',
    type: type ?? '',
    siblingFields: composerFields,
    editIndex,
  });
  const lockedOptions = getLockedOptions(
    existingVariables,
    variable,
    hasInterfaceOwnedOptions,
  );

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
      <Section layout="vertical" id={getFieldId('variable')} title="Variable">
        <ArchitectField
          name="variable"
          label="Variable"
          hint="Create or select a variable to collect this attribute. If you select an existing variable, any changes you make to the input control or validation options will also change other uses of this variable."
          component={VariablePickerControl}
          initialValue={asString(item.variable)}
          validation={{ required: true }}
          entity={entity ?? undefined}
          type={type ?? undefined}
          options={variableOptions}
          onCreateOption={handleNewVariable}
        />
      </Section>

      <Section
        layout="vertical"
        id={getFieldId('label')}
        title="Label"
        disabled={!variable}
      >
        <ArchitectField
          name="label"
          label="Label"
          hint="Optionally caption this attribute in the side panel. When left empty, the variable's name is shown instead."
          component={InputField}
          initialValue={asString(item.label)}
          validation={{}}
          placeholder="Defaults to the variable name"
        />
      </Section>

      <Section
        layout="vertical"
        id={getFieldId('component')}
        title="Input Control"
        disabled={!variable}
      >
        <ArchitectField
          name="component"
          label="Input control"
          hint={
            <>
              How the answer is collected. For detailed information about these
              options, see our{' '}
              <ExternalLink href="https://documentation.networkcanvas.com/key-concepts/input-controls/">
                documentation
              </ExternalLink>
              .
            </>
          }
          component={NativeSelectField}
          initialValue={asString(item.component)}
          validation={{ required: true }}
          placeholder="Select an input control"
          options={
            isNewVariable
              ? toSelectOptions(componentOptions)
              : toSelectOptions(componentOptions).toSorted((a, b) =>
                  a.label.localeCompare(b.label),
                )
          }
        />
        {isNewVariable && variableType && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              The selected input control will cause this variable to be defined
              as type <strong>{variableType}</strong>. Once set, this cannot be
              changed (although you may change the input control within this
              type).
            </AlertDescription>
          </Alert>
        )}
        {!isNewVariable && variableType && (
          <Alert variant="warning" className="my-7">
            <AlertTitle>Variable type is locked</AlertTitle>
            <AlertDescription>
              A pre-existing variable is currently selected. You cannot change a
              variable type after it has been created, so only{' '}
              <strong>{variableType}</strong> compatible input controls can be
              selected above. If you would like to use a different input control
              type, you will need to create a new variable.
            </AlertDescription>
          </Alert>
        )}
        {variableType &&
          metaForType &&
          typeof metaForType.label === 'string' && (
            <div>
              <Heading level="h4">Preview</Heading>
              <InputPreview
                label={metaForType.label}
                description={metaForType.description}
                image={metaForType.image}
              />
            </div>
          )}
      </Section>

      {isOrdinalOrCategoricalType(variableType) && (
        <Section
          layout="vertical"
          id={getFieldId('options')}
          title="Categorical/Ordinal options"
        >
          {lockedOptions ? (
            <LockedOptions options={lockedOptions} />
          ) : (
            <ArchitectArrayField
              name="options"
              label="Options"
              hint="The input type you selected indicates that this is a categorical or ordinal variable. Create a minimum of two possible values for the participant to choose between."
              component={Options}
              initialValue={asOptions(item.options)}
              validation={optionsValidation}
            />
          )}
        </Section>
      )}
      {isBooleanWithOptions(component) && (
        // BooleanChoice writes to the `options` field, so anchor it there (it is
        // mutually exclusive with the Categorical/Ordinal options section
        // above, so the shared id never collides at runtime).
        <Section
          layout="vertical"
          id={getFieldId('options')}
          title="BooleanChoice Options"
        >
          <BooleanChoice initialValue={asOptions(item.options)} />
        </Section>
      )}
      {isVariableTypeWithParameters(variableType) && (
        <Section
          layout="vertical"
          id={getFieldId('parameters')}
          title="Input Options"
        >
          <Parameters
            type={variableType}
            component={component ?? ''}
            name="parameters"
            initialParameters={asParameterValues(item.parameters)}
          />
        </Section>
      )}
    </>
  );
};

export default ComposerAttributeFields;
