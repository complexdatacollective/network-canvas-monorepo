import type { ComponentType } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section, Subsection } from '~/components/EditorLayout';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import { getReduxFieldErrorState } from '~/components/Form/reduxFieldMeta';
import ValidatedField from '~/components/Form/ValidatedField';
import Options from '~/components/Options';
import { getLockedOptions } from '~/components/Options/getLockedOptions';
import LockedOptions from '~/components/Options/LockedOptions';
import Parameters from '~/components/Parameters';
import {
  isBooleanWithOptions,
  isOrdinalOrCategoricalType,
  isVariableTypeWithParameters,
} from '~/config/variables';
import { getFieldId } from '~/utils/issues';

import BooleanChoice from '../BooleanChoice';
import ExternalLink from '../ExternalLink';
import InputPreview from '../Form/Fields/InputPreview';
import VariablePicker from '../Form/Fields/VariablePicker/VariablePicker';
import { useFieldHandlers } from '../sections/Form/withFieldsHandlers';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

/**
 * Eighteenth-wave Finding 2: the contradiction check for this editor is a
 * form-level validate (`makeFieldEditorValidate`, wired in
 * EditableAttributesList) whose message belongs to no single control — it can
 * follow from the input control, its options, or its parameters together with
 * the codebook rules and the stage's sibling attributes. redux-form only
 * fails a submit over errors on REGISTERED fields, so the message needs a
 * field of its own: without one the error was inert and the contradictory
 * edit saved straight back to the codebook. This field holds no value; it
 * exists to register the error and render it.
 */
export const COMPOSER_CONTRADICTION_FIELD = '_contradiction';

const ContradictionAlert = ({ meta }: WrappedFieldProps) => {
  const { errors, showErrors } = getReduxFieldErrorState(meta);
  if (!showErrors) return null;
  return (
    <Alert variant="destructive" className="my-7">
      <AlertTitle>This attribute cannot be saved</AlertTitle>
      <AlertDescription>{errors.join(' ')}</AlertDescription>
    </Alert>
  );
};

type ComposerAttributeFieldsProps = {
  form: string;
  entity?: string | null;
  type?: string | null;
  // The stage's committed composer fields and this row's index within them,
  // supplied by DialogArrayField/EditableAttributesList so the variable picker
  // can drop what a sibling attribute already collects.
  composerFields?: unknown;
  editIndex?: number;
};
const ComposerAttributeFields = ({
  form,
  entity = null,
  type = null,
  composerFields,
  editIndex,
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
    handleNewVariable,
    handleChangeVariable,
    handleChangeComponent,
  } = useFieldHandlers({
    form,
    entity: entity ?? '',
    type: type ?? '',
    siblingFields: composerFields,
    editIndex,
  });
  const lockedOptions = getLockedOptions(existingVariables, variable);
  return (
    <>
      <ValidatedField
        name={COMPOSER_CONTRADICTION_FIELD}
        component={ContradictionAlert}
        validation={{}}
      />
      <Section
        layout="vertical"
        id={getFieldId('variable')}
        title="Variable"
        summary={
          <Paragraph>
            Create or select a variable to collect this attribute. If you select
            an existing variable, any changes you make to the input control or
            validation options will also change other uses of this variable.
          </Paragraph>
        }
      >
        {/* {variable && !isNewVariable && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              When selecting an existing variable, changes you make to the input
              control or validation options will also change other uses of this
              variable.
            </AlertDescription>
          </Alert>
        )} */}
        <ValidatedField
          name="variable"
          labelHidden
          component={VariablePicker as ComponentType<Record<string, unknown>>}
          validation={{ required: true }}
          componentProps={{
            entity: entity ?? undefined,
            type: type ?? undefined,
            options: variableOptions,
            onCreateOption: handleNewVariable,
            onChange: handleChangeVariable,
          }}
        />
      </Section>

      <Section
        layout="vertical"
        id={getFieldId('label')}
        title="Label"
        disabled={!variable}
        summary={
          <Paragraph>
            Optionally caption this attribute in the side panel. When left
            empty, the variable&apos;s name is shown instead.
          </Paragraph>
        }
      >
        <ValidatedField
          name="label"
          label="Label"
          labelHidden
          component={FrescoReduxField}
          validation={{}}
          componentProps={{
            fieldComponent: FrescoInputField,
            placeholder: 'Defaults to the variable name',
          }}
        />
      </Section>

      <Section
        layout="vertical"
        id={getFieldId('component')}
        title="Input Control"
        disabled={!variable}
        summary={
          <Paragraph>
            Choose an input control that should be used to collect the answer.
            For detailed information about these options, see our{' '}
            <ExternalLink href="https://documentation.networkcanvas.com/key-concepts/input-controls/">
              documentation
            </ExternalLink>
            .
          </Paragraph>
        }
      >
        <ValidatedField
          name="component"
          label="Input control"
          labelHidden
          component={FrescoReduxField}
          validation={{ required: true }}
          componentProps={{
            fieldComponent: FrescoNativeSelectField,
            placeholder: 'Select an input control',
            options: isNewVariable
              ? componentOptions
              : [...componentOptions].toSorted((a, b) =>
                  a.label.localeCompare(b.label),
                ),
            onChange: handleChangeComponent,
          }}
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
          summary={
            lockedOptions ? (
              <Paragraph>
                These options are automatically configured by the interface and
                cannot be modified.
              </Paragraph>
            ) : (
              <Paragraph>
                The input type you selected indicates that this is a categorical
                or ordinal variable. Next, please create a minimum of two
                possible values for the participant to choose between.
              </Paragraph>
            )
          }
        >
          {lockedOptions ? (
            <LockedOptions options={lockedOptions} />
          ) : (
            <Options name="options" label="Options" />
          )}
        </Section>
      )}
      {isBooleanWithOptions(component) && (
        // BooleanChoice writes to the `options` field, so anchor it there (it is
        // mutually exclusive with the Categorical/Ordinal options subsection
        // above, so the shared id never collides at runtime).
        <Section
          layout="vertical"
          id={getFieldId('options')}
          title="BooleanChoice Options"
        >
          <BooleanChoice form={form} />
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
            form={form}
          />
        </Section>
      )}
    </>
  );
};
export default ComposerAttributeFields;
