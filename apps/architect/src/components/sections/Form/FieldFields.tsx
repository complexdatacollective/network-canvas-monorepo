import { omit } from 'es-toolkit/compat';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  completeOptions,
  minTwoOptions,
  type OptionValue,
} from '~/components/Form/arrayFields/Options';
import RichText from '~/components/Form/Fields/RichText/Field';
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
import { documentationLinks } from '~/utils/documentationLinks';
import { getFieldId } from '~/utils/issues';

import BooleanChoice from '../../BooleanChoice';
import ExternalLink from '../../ExternalLink';
import InputPreview from '../../Form/Fields/InputPreview';
import ValidationSection from '../ValidationSection';
import { asValidationMap, toSelectOptions } from './helpers';
import {
  CREATE_NEW_VARIABLE_FIELD,
  HiddenFieldValue,
  useFieldHandlers,
} from './withFieldsHandlers';

/** Stable empty list: `initialValue` is a register-effect dependency. */
const NO_OPTIONS: OptionValue[] = [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asOptions = (value: unknown): OptionValue[] =>
  Array.isArray(value) ? (value as OptionValue[]) : NO_OPTIONS;

type FieldFieldsProps = {
  entity?: string | null;
  type?: string | null;
  currentStageIndex?: number;
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
  item = {},
}: FieldFieldsProps) => {
  const {
    variable,
    variableType,
    isNewVariable,
    variableOptions,
    component,
    componentOptions,
    metaForType,
    existingVariables,
    handleNewVariable,
  } = useFieldHandlers({
    entity: entity ?? '',
    type: type ?? '',
    currentStageIndex,
  });
  const lockedOptions = getLockedOptions(existingVariables, variable);

  return (
    <>
      <HiddenFieldValue
        name={CREATE_NEW_VARIABLE_FIELD}
        initialValue={asString(item._createNewVariable)}
      />
      <Section layout="vertical" id={getFieldId('variable')} title="Variable">
        {variable && !isNewVariable && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              When selecting an existing variable, changes you make to the input
              control or validation options will also change other uses of this
              variable.
            </AlertDescription>
          </Alert>
        )}
        <ArchitectField
          name="variable"
          label="Variable"
          labelHidden
          component={VariablePickerControl}
          initialValue={asString(item.variable)}
          validation={{ required: true }}
          entity={entity ?? undefined}
          type={type ?? undefined}
          options={variableOptions}
          onCreateOption={handleNewVariable}
        />
      </Section>

      <Section layout="vertical" id={getFieldId('prompt')} title="Prompt Text">
        <ArchitectField
          name="prompt"
          label="Prompt text"
          hint="The question to display to the participant. Supports markdown formatting."
          component={RichText}
          initialValue={asString(item.prompt)}
          validation={{ required: true }}
          singleLine
          placeholder="What is this person's name?"
        />
      </Section>
      <Section layout="vertical">
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
              <ExternalLink href={documentationLinks.inputControls}>
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
            <>
              <Paragraph>
                These options are automatically configured by the interface and
                cannot be modified.
              </Paragraph>
              <LockedOptions options={lockedOptions} />
            </>
          ) : (
            <ArchitectArrayField
              name="options"
              label="Options"
              hint="The input type you selected indicates that this is a categorical or ordinal variable. Create a minimum of two possible values for the participant to choose between."
              component={Options}
              initialValue={asOptions(item.options)}
              validation={{ minTwoOptions, completeOptions }}
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
