import type { ComponentType } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section, Subsection } from '~/components/EditorLayout';
import { FrescoReduxField } from '~/components/Form';
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

type ComposerAttributeFieldsProps = {
  form: string;
  entity?: string | null;
  type?: string | null;
};
const ComposerAttributeFields = ({
  form,
  entity = null,
  type = null,
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
  });
  const lockedOptions = getLockedOptions(existingVariables, variable);
  return (
    <Section layout="vertical">
      <Subsection id={getFieldId('variable')} title="Variable">
        {variable && !isNewVariable && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              When selecting an existing variable, changes you make to the input
              control or validation options will also change other uses of this
              variable.
            </AlertDescription>
          </Alert>
        )}
        <ValidatedField
          name="variable"
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
      </Subsection>

      <Subsection
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
          component={FrescoReduxField}
          validation={{}}
          componentProps={{
            fieldComponent: FrescoInputField,
            placeholder: 'Defaults to the variable name',
          }}
        />
      </Subsection>

      <Subsection
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
      </Subsection>

      {isOrdinalOrCategoricalType(variableType) && (
        <Subsection
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
        </Subsection>
      )}
      {isBooleanWithOptions(component) && (
        // BooleanChoice writes to the `options` field, so anchor it there (it is
        // mutually exclusive with the Categorical/Ordinal options subsection
        // above, so the shared id never collides at runtime).
        <Subsection id={getFieldId('options')} title="BooleanChoice Options">
          <BooleanChoice form={form} />
        </Subsection>
      )}
      {isVariableTypeWithParameters(variableType) && (
        <Subsection id={getFieldId('parameters')} title="Input Options">
          <Parameters
            type={variableType}
            component={component ?? ''}
            name="parameters"
            form={form}
          />
        </Subsection>
      )}
    </Section>
  );
};
export default ComposerAttributeFields;
