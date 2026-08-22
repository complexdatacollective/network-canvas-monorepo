import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
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
import { useOwningStageDraft } from '~/components/NewVariableWindow/prospectiveImpliedRules';
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
import { getFieldId } from '~/utils/issues';

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

  // An attribute created from here is bound to this prompt the moment the
  // dialog closes, so the create-attribute window is told which stage and which
  // slot it is creating for, and offers only what the rules that slot implies
  // leave open. Written into the stage's own prompt list, so a slot whose
  // subject is read off a sibling — this one's edge type — reads it from the
  // prompt that is already there.
  const owningStage = useOwningStageDraft();
  const newVariableWindowInitialProps = {
    entity: 'edge' as Entity,
    type: currentCreateEdge ?? '',
    initialValues: { name: '', type: '' },
    owningStage,
    slotPath: 'prompts.0.edgeVariable',
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
        title="Tie-Strength Census Prompt"
        id={getFieldId('text')}
        layout="vertical"
      >
        <>
          <Paragraph>
            Tie-Strength Census prompts explain to your participant which
            relationship they should evaluate (for example,
            &apos;friendship&apos;, &apos;material support&apos; or
            &apos;conflict&apos;). Enter prompt text below, and select an edge
            type that will be created when the participant answers
            &apos;yes&apos;.
          </Paragraph>
          <Paragraph>
            Remember to write your prompt text to take into account that the
            participant will be looking at pairs of prompts in sequence. Use
            phrases such as &apos;
            <strong>these people</strong>
            &apos;, or &apos;
            <strong>the two people shown</strong>
            &apos; to indicate that the participant should focus on the visible
            pair.
          </Paragraph>
          <ArchitectField
            name="text"
            label="Prompt Text"
            component={RichTextField}
            validation={{ required: true }}
            initialValue={text}
            singleLine
            placeholder="Enter text for the prompt here..."
          />
        </>
      </Section>
      <Section
        title="Tie-Strength Configuration"
        id={getFieldId('set-ordinal-value')}
        summary={
          <>
            <Paragraph>
              This interface works by presenting the user with a choice to
              either:
            </Paragraph>
            <ul>
              <li>
                Create an edge between two alters, and simultaneously assign a
                value to an ordinal attribute.
              </li>
              <li>Decline to create an edge</li>
            </ul>
          </>
        }
        layout="vertical"
      >
        <Section
          title="Create an Edge"
          summary={
            <Paragraph>
              Begin by selecting or creating an edge type. You will then be able
              to select or create an ordinal attribute on this edge type. The
              options of this ordinal attribute will represent the choices
              provided to the user when creating an edge.
            </Paragraph>
          }
          layout="vertical"
        >
          <>
            <ArchitectField
              name="createEdge"
              label="Select an edge type"
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
          </>
        </Section>
        {currentCreateEdge && (
          <Section title="Ordinal Attribute" layout="vertical">
            <>
              <ArchitectField
                name="edgeVariable"
                label="Select an ordinal attribute for this edge type"
                component={VariablePicker}
                validation={{ required: true }}
                initialValue={edgeVariable}
                entity="edge"
                type={currentCreateEdge}
                options={ordinalVariableOptions}
                onCreateOption={handleNewVariable}
              />
            </>
            {currentEdgeVariable && (
              <>
                <Heading level="h4" id={getFieldId('variableOptions')}>
                  Attribute Options
                </Heading>
                {lockedOptions ? (
                  <LockedOptions options={lockedOptions} />
                ) : (
                  <>
                    <Paragraph>
                      The following choices or &apos;options&apos; are
                      configured for this attribute. We suggest no more than
                      four options should be used on this interface.
                    </Paragraph>
                    {showVariableOptionsTip && (
                      <Alert variant="destructive" className="my-7">
                        <AlertTitle>Too many option values</AlertTitle>
                        <AlertDescription>
                          The ordinal bin interface is designed to use{' '}
                          <strong>up to 5 option values</strong> including the
                          negative label. Using more will create a sub-optimal
                          experience for participants, and might reduce data
                          quality.
                        </AlertDescription>
                      </Alert>
                    )}
                    <ArchitectArrayField
                      name="variableOptions"
                      label="Options"
                      labelHidden
                      component={Options}
                      addButtonLabel="Create new option"
                      validation={optionsValidation}
                      initialValue={variableOptions}
                    />
                  </>
                )}
              </>
            )}
          </Section>
        )}
        <Section
          title="Decline Option"
          summary={
            <Paragraph>
              Enter text to display for the option that will{' '}
              <strong>cancel edge creation</strong>. This option will be shown
              on the far right of the screen.
            </Paragraph>
          }
          id={getFieldId('negativeLabel')}
          layout="vertical"
        >
          <ArchitectField
            name="negativeLabel"
            label="Label for the decline option"
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
