import type { ComponentType } from 'react';

import { Section, Subsection } from '~/components/EditorLayout';
import NativeSelect from '~/components/Form/Fields/NativeSelect';
import ValidatedField from '~/components/Form/ValidatedField';
import Options from '~/components/Options';
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
import Tip from '../Tip';

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
    handleNewVariable,
    handleChangeVariable,
    handleChangeComponent,
  } = useFieldHandlers({
    form,
    entity: entity ?? '',
    type: type ?? '',
  });

  return (
    <Section layout="vertical">
      <Subsection id={getFieldId('variable')} title="Variable">
        {variable && !isNewVariable && (
          <Tip>
            <p>
              When selecting an existing variable, changes you make to the input
              control or validation options will also change other uses of this
              variable.
            </p>
          </Tip>
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
        id={getFieldId('component')}
        title="Input Control"
        disabled={!variable}
        summary={
          <p>
            Choose an input control that should be used to collect the answer.
            For detailed information about these options, see our{' '}
            <ExternalLink href="https://documentation.networkcanvas.com/key-concepts/input-controls/">
              documentation
            </ExternalLink>
            .
          </p>
        }
      >
        <ValidatedField
          name="component"
          component={NativeSelect as ComponentType<Record<string, unknown>>}
          validation={{ required: true }}
          componentProps={{
            placeholder: 'Select an input control',
            options: componentOptions,
            sortOptionsByLabel: !isNewVariable,
            onChange: handleChangeComponent,
          }}
        />
        {isNewVariable && variableType && (
          <Tip>
            <p>
              The selected input control will cause this variable to be defined
              as type <strong>{String(variableType)}</strong>. Once set, this
              cannot be changed (although you may change the input control
              within this type).
            </p>
          </Tip>
        )}
        {!isNewVariable && variableType && (
          <Tip type="warning">
            <div>
              <p>
                A pre-existing variable is currently selected. You cannot change
                a variable type after it has been created, so only{' '}
                <strong>{String(variableType)}</strong> compatible input
                controls can be selected above. If you would like to use a
                different input control type, you will need to create a new
                variable.
              </p>
            </div>
          </Tip>
        )}
        {variableType &&
          metaForType &&
          typeof metaForType.label === 'string' && (
            <div>
              <h4>Preview</h4>
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
            <p>
              The input type you selected indicates that this is a categorical
              or ordinal variable. Next, please create a minimum of two possible
              values for the participant to choose between.
            </p>
          }
        >
          <Options name="options" label="Options" />
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
            type={String(variableType)}
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
