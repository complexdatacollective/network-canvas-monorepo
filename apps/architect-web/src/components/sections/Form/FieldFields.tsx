import type { UnknownAction } from '@reduxjs/toolkit';
import { omit } from 'es-toolkit/compat';
import type { ComponentType } from 'react';
import { useSelector } from 'react-redux';
import { change, Field, formValueSelector } from 'redux-form';

import { Section, Subsection } from '~/components/EditorLayout';
import NativeSelect from '~/components/Form/Fields/NativeSelect';
import { Field as RichText } from '~/components/Form/Fields/RichText';
import ValidatedField from '~/components/Form/ValidatedField';
import Switch from '~/components/NewComponents/Switch';
import Options from '~/components/Options';
import Parameters from '~/components/Parameters';
import {
  isBooleanWithOptions,
  isOrdinalOrCategoricalType,
  isVariableTypeWithParameters,
} from '~/config/variables';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';
import { getFieldId } from '~/utils/issues';

import BooleanChoice from '../../BooleanChoice';
import ExternalLink from '../../ExternalLink';
import InputPreview from '../../Form/Fields/InputPreview';
import VariablePicker from '../../Form/Fields/VariablePicker/VariablePicker';
import Tip from '../../Tip';
import ValidationSection from '../ValidationSection';
import { useFieldHandlers } from './withFieldsHandlers';

type PromptFieldsProps = {
  form: string;
  entity?: string | null;
  type?: string | null;
};

const PromptFields = ({
  form,
  entity = null,
  type = null,
}: PromptFieldsProps) => {
  const dispatch = useAppDispatch();

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

  const showValidationHints = useSelector(
    (state: RootState) =>
      formValueSelector(form)(state, 'showValidationHints') as
        | boolean
        | undefined,
  );

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
        id={getFieldId('prompt')}
        title="Question"
        summary={
          <p>
            Configure the question prompt and optional hints for the
            participant.
          </p>
        }
      >
        <div>
          <h4>Prompt Text</h4>
          <p className="mb-(--space-sm) text-sm text-current/70">
            Enter the question to display to the participant. Supports markdown
            formatting.
          </p>
          <ValidatedField
            name="prompt"
            component={RichText as ComponentType<Record<string, unknown>>}
            validation={{ required: true }}
            componentProps={{
              inline: true,
              placeholder: "What is this person's name?",
            }}
          />
        </div>
        <div>
          <h4>Hint Text</h4>
          <p className="mb-(--space-sm) text-sm text-current/70">
            Optionally display a markdown-formatted hint below the question to
            help participants understand how to answer.
          </p>
          <Field
            name="hint"
            component={RichText as ComponentType<Record<string, unknown>>}
            inline
            placeholder="e.g. Select all that apply..."
          />
        </div>
        <div className="flex items-center justify-between gap-(--space-md)">
          <div>
            <h4 className="text-base font-semibold">Show validation hints?</h4>
            <p className="text-sm text-current/70">
              Automatically display hints derived from this field&apos;s
              validation rules, helping participants understand input
              requirements.
            </p>
          </div>
          <Switch
            checked={!!showValidationHints}
            onCheckedChange={(checked) =>
              dispatch(
                change(form, 'showValidationHints', checked) as UnknownAction,
              )
            }
            className="shrink-0"
          />
        </div>
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
        <Subsection id={getFieldId('parameters')} title="BooleanChoice Options">
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

      <ValidationSection
        form={form}
        disabled={!variableType}
        entity={entity ?? ''}
        variableType={
          typeof variableType === 'string' ? variableType : undefined
        }
        existingVariables={omit(existingVariables, variable)}
      />
    </Section>
  );
};

export default PromptFields;
