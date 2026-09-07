import { useEffect, useRef, type ComponentType } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import RichTextField from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  optionsValidation,
} from '~/components/Form/arrayFields/Options';
import NativeSelect from '~/components/Form/Fields/NativeSelect';
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
const remainingMessages = defineMessages({
  createNewEdgeType: {
    id: 'architect.remaining.sections.tieStrengthCensusPrompts.promptFields.createNewEdgeType',
    defaultMessage: '✨ Create new edge type ✨',
    description:
      'The createLabelText text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  newEdgeTypeName: {
    id: 'architect.remaining.sections.tieStrengthCensusPrompts.promptFields.newEdgeTypeName',
    defaultMessage: 'New edge type name',
    description:
      'The createInputLabel text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  enterAnEdgeType: {
    id: 'architect.remaining.sections.tieStrengthCensusPrompts.promptFields.enterAnEdgeType',
    defaultMessage: 'Enter an edge type...',
    description:
      'The createInputPlaceholder text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
});
const additionalMessages = defineMessages({
  createNewOption: {
    id: 'architect.additional.sections.tieStrengthCensusPrompts.promptFields.createNewOption',
    defaultMessage: 'Create new option',
    description:
      'The addButtonLabel text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
});
const messages = defineMessages({
  edgeTypeName: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.edgeTypeName',
    defaultMessage: 'edge type name',
    description: 'Subject of the invalid edge type identifier guidance.',
  },
  participantPrompt: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.participantPrompt',
    defaultMessage: 'Participant prompt',
    description:
      'The title text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  explainTheRelationshipParticipantsShouldEvaluate: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.explainTheRelationshipParticipantsShouldEvaluate',
    defaultMessage:
      'Explain the relationship participants should evaluate for each pair.',
    description:
      'The description text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  promptText: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.promptText',
    defaultMessage: 'Prompt text',
    description:
      'The label text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  referClearlyToTheTwoPeople: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.referClearlyToTheTwoPeople',
    defaultMessage:
      'Refer clearly to the two people shown and phrase the prompt for a yes or no response.',
    description:
      'The hint text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  enterTextForThePromptHere: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.enterTextForThePromptHere',
    defaultMessage: 'Enter text for the prompt here...',
    description:
      'The placeholder text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  tieStrengthResponse: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.tieStrengthResponse',
    defaultMessage: 'Tie-strength response',
    description:
      'The title text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  configureTheEdgeAndOrdinalValue: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.configureTheEdgeAndOrdinalValue',
    defaultMessage:
      'Configure the edge and ordinal value created by an affirmative response.',
    description:
      'The description text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  edgeCreation: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.edgeCreation',
    defaultMessage: 'Edge creation',
    description:
      'The title text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  chooseTheEdgeTypeCreatedBetween: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.chooseTheEdgeTypeCreatedBetween',
    defaultMessage: 'Choose the edge type created between the two nodes.',
    description:
      'The description text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  edgeType: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.edgeType',
    defaultMessage: 'Edge type',
    description:
      'The label text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  selectOrCreateTheEdgeType: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.selectOrCreateTheEdgeType',
    defaultMessage:
      'Select or create the edge type before configuring its ordinal attribute.',
    description:
      'The hint text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  selectOrCreateAnEdgeType: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.selectOrCreateAnEdgeType',
    defaultMessage: 'Select or create an edge type',
    description:
      'The placeholder text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  responseAttribute: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.responseAttribute',
    defaultMessage: 'Response attribute',
    description:
      'The title text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  chooseTheOrdinalAttributeWhoseOptions: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.chooseTheOrdinalAttributeWhoseOptions',
    defaultMessage:
      'Choose the ordinal attribute whose options participants use to rate the relationship.',
    description:
      'The description text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  ordinalAttribute: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.ordinalAttribute',
    defaultMessage: 'Ordinal attribute',
    description:
      'The label text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  tooManyOptionValues: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.tooManyOptionValues',
    defaultMessage: 'Too many option values',
    description:
      'Visible text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  theOrdinalBinInterfaceIsDesigned: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.theOrdinalBinInterfaceIsDesigned',
    defaultMessage:
      'The ordinal bin interface is designed to use <strong>up to 5 option values</strong> including the negative label. Using more will create a sub-optimal experience for participants, and might reduce data quality.',
    description:
      'Visible text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  optionValues: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.optionValues',
    defaultMessage: 'Option values',
    description:
      'The label text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  createUpToFourResponseOptions: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.createUpToFourResponseOptions',
    defaultMessage: 'Create up to four response options for this attribute.',
    description:
      'The hint text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  declineResponse: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.declineResponse',
    defaultMessage: 'Decline response',
    description:
      'The title text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  setTheOptionParticipantsUseTo: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.setTheOptionParticipantsUseTo',
    defaultMessage: 'Set the option participants use to decline edge creation.',
    description:
      'The description text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  declineOption: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.declineOption',
    defaultMessage: 'Decline option',
    description:
      'The label text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  thisOptionAppearsOnTheFar: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.thisOptionAppearsOnTheFar',
    defaultMessage: 'This option appears on the far right of the screen.',
    description:
      'The hint text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
  enterTextForTheNegativeLabel: {
    id: 'architect.sections.tieStrengthCensusPrompts.promptFields.enterTextForTheNegativeLabel',
    defaultMessage: 'Enter text for the negative label here...',
    description:
      'The placeholder text in components / sections / TieStrengthCensusPrompts / PromptFields.',
  },
});

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
  const intl = useAppIntl();
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
        title={intl.formatMessage(messages.participantPrompt)}
        description={intl.formatMessage(
          messages.explainTheRelationshipParticipantsShouldEvaluate,
        )}
      >
        <ArchitectField
          name="text"
          label={intl.formatMessage(messages.promptText)}
          hint={intl.formatMessage(messages.referClearlyToTheTwoPeople)}
          component={RichTextField}
          validation={{ required: true }}
          initialValue={text}
          singleLine
          placeholder={intl.formatMessage(messages.enterTextForThePromptHere)}
        />
      </Section>
      <Section
        title={intl.formatMessage(messages.tieStrengthResponse)}
        description={intl.formatMessage(
          messages.configureTheEdgeAndOrdinalValue,
        )}
      >
        <Section
          title={intl.formatMessage(messages.edgeCreation)}
          description={intl.formatMessage(
            messages.chooseTheEdgeTypeCreatedBetween,
          )}
        >
          <ArchitectField
            name="createEdge"
            label={intl.formatMessage(messages.edgeType)}
            hint={intl.formatMessage(messages.selectOrCreateTheEdgeType)}
            component={NativeSelect as ComponentType<Record<string, unknown>>}
            validation={{
              required: true,
              allowedNMToken: intl.formatMessage(messages.edgeTypeName),
            }}
            initialValue={createEdge}
            options={edgesForSubject}
            onCreateOption={handleCreateEdge}
            placeholder={intl.formatMessage(messages.selectOrCreateAnEdgeType)}
            createLabelText={intl.formatMessage(
              remainingMessages.createNewEdgeType,
            )}
            createInputLabel={intl.formatMessage(
              remainingMessages.newEdgeTypeName,
            )}
            createInputPlaceholder={intl.formatMessage(
              remainingMessages.enterAnEdgeType,
            )}
            createValidation={{
              required: true,
              allowedNMToken: intl.formatMessage(messages.edgeTypeName),
            }}
          />
        </Section>
        {currentCreateEdge && (
          <Section
            title={intl.formatMessage(messages.responseAttribute)}
            description={intl.formatMessage(
              messages.chooseTheOrdinalAttributeWhoseOptions,
            )}
          >
            <ArchitectField
              name="edgeVariable"
              label={intl.formatMessage(messages.ordinalAttribute)}
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
                  <AlertTitle>
                    {intl.formatMessage(messages.tooManyOptionValues)}
                  </AlertTitle>
                  <AlertDescription>
                    {intl.formatMessage(
                      messages.theOrdinalBinInterfaceIsDesigned,
                      { strong: (chunks) => <strong>{chunks}</strong> },
                    )}
                  </AlertDescription>
                </Alert>
              )}
            {currentEdgeVariable && !lockedOptions && (
              <ArchitectArrayField
                name="variableOptions"
                label={intl.formatMessage(messages.optionValues)}
                hint={intl.formatMessage(
                  messages.createUpToFourResponseOptions,
                )}
                component={Options}
                addButtonLabel={intl.formatMessage(
                  additionalMessages.createNewOption,
                )}
                validation={optionsValidation(intl)}
                initialValue={variableOptions}
              />
            )}
          </Section>
        )}
        <Section
          title={intl.formatMessage(messages.declineResponse)}
          description={intl.formatMessage(
            messages.setTheOptionParticipantsUseTo,
          )}
        >
          <ArchitectField
            name="negativeLabel"
            label={intl.formatMessage(messages.declineOption)}
            hint={intl.formatMessage(messages.thisOptionAppearsOnTheFar)}
            component={RichTextField}
            validation={{ required: true }}
            initialValue={negativeLabel}
            singleLine
            placeholder={intl.formatMessage(
              messages.enterTextForTheNegativeLabel,
            )}
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
