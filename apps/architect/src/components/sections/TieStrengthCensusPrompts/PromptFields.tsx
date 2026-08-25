import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  optionsValidation,
} from '~/components/Form/arrayFields/Options';
import NativeSelect from '~/components/Form/Fields/NativeSelect';
import RichTextField from '~/components/Form/Fields/RichText/Field';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import LockedOptions from '~/components/Options/LockedOptions';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { createEdgeAsync } from '~/ducks/modules/protocol/codebook';
import {
  getVariableOptionsForSubject,
  getVariablesForSubject,
} from '~/selectors/codebook';
import {
  excludeInterfaceOwned,
  excludeValidatedUses,
} from '~/selectors/roleFilters';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import { getEdgesForSubject } from '../SociogramPrompts/selectors';
import { useLockedOptions } from '../useLockedOptions';

type SelectOption = {
  label: string;
  value: string;
  type?: string;
  [key: string]: unknown;
};

type PromptFieldsProps = {
  text?: string;
  createEdge?: string;
  edgeVariable?: string;
  negativeLabel?: string;
  variableOptions?: SelectOption[];
};

/** Stable empty list: `initialValue` is a register-effect dependency. */
const NO_OPTIONS: SelectOption[] = [];

const PromptFields = ({
  text,
  createEdge,
  edgeVariable,
  negativeLabel,
  variableOptions = NO_OPTIONS,
}: PromptFieldsProps) => {
  const dispatch = useAppDispatch();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const {
    createEdge: liveCreateEdge,
    edgeVariable: liveEdgeVariable,
    variableOptions: liveVariableOptions,
  } = useFormValue(['createEdge', 'edgeVariable', 'variableOptions'] as const);
  const currentCreateEdge =
    typeof liveCreateEdge === 'string' ? liveCreateEdge : createEdge;
  const currentEdgeVariable =
    typeof liveEdgeVariable === 'string' ? liveEdgeVariable : edgeVariable;
  const currentVariableOptions = Array.isArray(liveVariableOptions)
    ? (liveVariableOptions as SelectOption[])
    : variableOptions;

  const edgesForSubject = useAppSelector(getEdgesForSubject) as SelectOption[];
  const edgeSubject = {
    entity: 'edge' as const,
    type: currentCreateEdge ?? undefined,
  };
  // TSC's edge-variable picker is an UNVALIDATED writer: drop options a form
  // elsewhere already validates, and drop any variable an interface derives
  // from the structure a participant builds — a Family Pedigree's edge slots
  // above all, which its genetics engine reads back.
  const ordinalVariableOptions = useAppSelector((state) => {
    const ordinalOptions = getVariableOptionsForSubject(
      state,
      edgeSubject,
    ).filter(({ type: variableType }) => variableType === 'ordinal');
    return excludeInterfaceOwned(
      state,
      edgeSubject,
      excludeValidatedUses(
        state,
        edgeSubject,
        ordinalOptions,
        currentEdgeVariable,
      ),
      currentEdgeVariable,
    ) as SelectOption[];
  });

  // An interface that branches on the variable's exact values owns its option
  // list, so the editor renders it read-only.
  const lockedOptions = useLockedOptions(edgeSubject, currentEdgeVariable);
  const optionsForCurrentEdgeVariable = useAppSelector((state) => {
    const variables = getVariablesForSubject(state, edgeSubject);
    const found = currentEdgeVariable
      ? variables[currentEdgeVariable]
      : undefined;
    return found && 'options' in found ? (found.options ?? []) : [];
  });

  // Picking a different edge variable replaces the draft options with that
  // variable's already-committed ones — but only on an actual change, so
  // opening the
  // dialog on an already-configured prompt doesn't clobber its live draft.
  const previousEdgeVariableRef = useRef(currentEdgeVariable);
  useEffect(() => {
    if (previousEdgeVariableRef.current === currentEdgeVariable) return;
    previousEdgeVariableRef.current = currentEdgeVariable;
    setFieldValue('variableOptions', optionsForCurrentEdgeVariable);
  }, [currentEdgeVariable, optionsForCurrentEdgeVariable, setFieldValue]);

  const totalOptionsLength = currentVariableOptions.length;
  const showVariableOptionsTip = totalOptionsLength > 5;

  // createEdgeAsync is awaited before the id becomes the field's value:
  // writing the pending Promise into the field corrupts codebook.edge with
  // an "[object Promise]" key.
  const handleCreateEdge = async (name: string) => {
    const { type } = await dispatch(createEdgeAsync({ name })).unwrap();
    setFieldValue('createEdge', type);
    return type;
  };

  const newVariableWindowInitialProps = {
    entity: 'edge' as Entity,
    type: currentCreateEdge ?? '',
    initialValues: { name: '', type: '' },
  };
  const handleCreatedNewVariable = (...args: unknown[]) => {
    const [id, params] = args as [string, { field: string }];
    setFieldValue(params.field, id);
  };
  const [newVariableWindowProps, openNewVariableWindow] =
    useNewVariableWindowState(
      newVariableWindowInitialProps,
      handleCreatedNewVariable,
    );
  const handleNewVariable = (name: string) =>
    openNewVariableWindow(
      { initialValues: { name, type: 'ordinal' } },
      { field: 'edgeVariable' },
    );

  return (
    <>
      <Section
        title="Participant prompt"
        description="Explain the relationship participants should evaluate for each pair."
      >
        <ArchitectField
          name="text"
          label="Prompt text"
          hint="Refer clearly to the two people shown and phrase the prompt for a yes or no response."
          component={RichTextField}
          validation={{ required: true }}
          initialValue={text}
          singleLine
          placeholder="Enter text for the prompt here..."
        />
      </Section>
      <Section
        title="Tie-strength response"
        description="Configure the edge and ordinal value created by an affirmative response."
      >
        <Section
          title="Edge creation"
          description="Choose the edge type created between the two nodes."
        >
          <ArchitectField
            name="createEdge"
            label="Edge type"
            hint="Select or create the edge type before configuring its ordinal attribute."
            component={NativeSelect as ComponentType<Record<string, unknown>>}
            validation={{ required: true, allowedNMToken: 'edge type name' }}
            initialValue={createEdge}
            options={edgesForSubject}
            onCreateOption={handleCreateEdge}
            placeholder="Select or create an edge type"
            createLabelText="✨ Create new edge type ✨"
            createInputLabel="New edge type name"
            createInputPlaceholder="Enter an edge type..."
            createValidation={{
              required: true,
              allowedNMToken: 'edge type name',
            }}
          />
        </Section>
        {currentCreateEdge && (
          <Section
            title="Response attribute"
            description="Choose the ordinal attribute whose options participants use to rate the relationship."
          >
            <ArchitectField
              name="edgeVariable"
              label="Ordinal attribute"
              component={VariablePicker}
              validation={{ required: true }}
              initialValue={edgeVariable}
              entity="edge"
              type={currentCreateEdge}
              options={ordinalVariableOptions}
              onCreateOption={handleNewVariable}
            />
            {currentEdgeVariable && lockedOptions && (
              <LockedOptions options={lockedOptions} />
            )}
            {currentEdgeVariable &&
              !lockedOptions &&
              showVariableOptionsTip && (
                <Alert variant="destructive" className="my-7">
                  <AlertTitle>Too many option values</AlertTitle>
                  <AlertDescription>
                    The ordinal bin interface is designed to use{' '}
                    <strong>up to 5 option values</strong> including the
                    negative label. Using more will create a sub-optimal
                    experience for participants, and might reduce data quality.
                  </AlertDescription>
                </Alert>
              )}
            {currentEdgeVariable && !lockedOptions && (
              <ArchitectArrayField
                name="variableOptions"
                label="Option values"
                hint="Create up to four response options for this attribute."
                component={Options}
                addButtonLabel="Create new option"
                validation={optionsValidation}
                initialValue={variableOptions}
              />
            )}
          </Section>
        )}
        <Section
          title="Decline response"
          description="Set the option participants use to decline edge creation."
        >
          <ArchitectField
            name="negativeLabel"
            label="Decline option"
            hint="This option appears on the far right of the screen."
            component={RichTextField}
            validation={{ required: true }}
            initialValue={negativeLabel}
            singleLine
            placeholder="Enter text for the negative label here..."
          />
        </Section>
      </Section>
      <NewVariableWindow
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...newVariableWindowProps}
      />
    </>
  );
};

export default PromptFields;
