import { useEffect, useRef } from 'react';
import { shallowEqual } from 'react-redux';

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
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import LockedOptions from '~/components/Options/LockedOptions';
import PromptText from '~/components/sections/PromptText';
import { useCreateVariable } from '~/components/StageEditor/stageFormHooks';
import { useAppSelector } from '~/ducks/hooks';
import {
  getVariableOptionsForSubject,
  getVariablesForSubject,
} from '~/selectors/codebook';
import {
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
} from '~/selectors/roleFilters';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import BinSortOrderSection from '../BinSortOrderSection';
import BucketSortOrderSection from '../BucketSortOrderSection';
import CodebookVariableValidationSection from '../CodebookVariableValidationSection';
import { useLockedOptions } from '../useLockedOptions';
import { getSortOrderOptionGetter } from './optionGetters';
const remainingMessages = defineMessages({
  enableValidationOfTheOtherAttribute: {
    id: 'architect.remaining.sections.categoricalBinPrompts.promptFields.enableValidationOfTheOtherAttribute',
    defaultMessage: 'Enable validation of the other attribute.',
    description:
      'The sectionSummary text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
});
const additionalMessages = defineMessages({
  createNewOption: {
    id: 'architect.additional.sections.categoricalBinPrompts.promptFields.createNewOption',
    defaultMessage: 'Create new option',
    description:
      'The addButtonLabel text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
});
const messages = defineMessages({
  categoricalResponse: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.categoricalResponse',
    defaultMessage: 'Categorical response',
    description:
      'The title text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  chooseTheCategoricalAttributeAndConfigure: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.chooseTheCategoricalAttributeAndConfigure',
    defaultMessage:
      'Choose the categorical attribute and configure the option values shown as bins.',
    description:
      'The description text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  attribute: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.attribute',
    defaultMessage: 'Attribute',
    description:
      'The label text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  selectACategoricalAttribute: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.selectACategoricalAttribute',
    defaultMessage: 'Select a categorical attribute.',
    description:
      'The hint text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  tooManyOptionValues: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.tooManyOptionValues',
    defaultMessage: 'Too many option values',
    description:
      'Visible text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  theCategoricalBinInterfaceIsDesigned: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.theCategoricalBinInterfaceIsDesigned',
    defaultMessage:
      'The categorical bin interface is designed to use <strong>up to 8 option values</strong> (including an "other" attribute). Using more will create a sub-optimal experience for participants, and might reduce data quality. Consider grouping your attribute options and capturing further detail with follow-up questions.',
    description:
      'Visible text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  optionValues: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.optionValues',
    defaultMessage: 'Option values',
    description:
      'The label text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  aCategoricalAttributeContainsPreDefinedCategories: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.aCategoricalAttributeContainsPreDefinedCategories',
    defaultMessage:
      'A categorical attribute contains pre-defined categories made up of a label (shown to the participant) and a value. Create <strong>up to 8</strong> option values for this attribute.',
    description:
      'The hint text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  followUpOtherOption: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.followUpOtherOption',
    defaultMessage: 'Follow-up other option',
    description:
      'The title text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  collectAParticipantEnteredValueWhenA: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.collectAParticipantEnteredValueWhenA',
    defaultMessage:
      'Collect a participant-entered value when a node is placed in an other bin.',
    description:
      'The description text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  otherAttribute: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.otherAttribute',
    defaultMessage: 'Other attribute',
    description:
      'The label text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  selectATextAttributeToStore: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.selectATextAttributeToStore',
    defaultMessage:
      "Select a text attribute to store the value entered by the participant when they drop a node in the 'other' option.",
    description:
      'The hint text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  otherBinLabel: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.otherBinLabel',
    defaultMessage: 'Other bin label',
    description:
      'The label text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  enterALabelForTheOther: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.enterALabelForTheOther',
    defaultMessage:
      "Enter a label for the 'other' bin that will be shown to participants. This label should indicate that the participant can drop a node in this bin to provide a value not listed above.",
    description:
      'The hint text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  enterALabelSuchAsOther: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.enterALabelSuchAsOther',
    defaultMessage: 'Enter a label (such as "other") for this bin...',
    description:
      'The placeholder text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  followUpQuestion: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.followUpQuestion',
    defaultMessage: 'Follow-up question',
    description:
      'The label text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  enterAQuestionPromptToShow: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.enterAQuestionPromptToShow',
    defaultMessage:
      'Enter a question prompt to show when the other option is triggered.',
    description:
      'The hint text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
  enterAQuestionPromptToShow56295: {
    id: 'architect.sections.categoricalBinPrompts.promptFields.enterAQuestionPromptToShow56295',
    defaultMessage:
      'Enter a question prompt to show when the other option is triggered...',
    description:
      'The placeholder text in components / sections / CategoricalBinPrompts / PromptFields.',
  },
});

type VariableOption = {
  label: string;
  value: string;
  type: string;
};

type PromptFieldsProps = {
  entity: 'node' | 'edge' | 'ego';
  type: string | null;
  text?: string;
  variable?: string;
  otherVariable?: string;
  otherOptionLabel?: string;
  otherVariablePrompt?: string;
  variableOptions?: VariableOption[];
  binSortOrder?: Record<string, unknown>[];
  bucketSortOrder?: Record<string, unknown>[];
};

const PromptFields = ({
  entity,
  type,
  text,
  variable,
  otherVariable,
  otherOptionLabel,
  otherVariablePrompt,
  variableOptions = [],
  binSortOrder,
  bucketSortOrder,
}: PromptFieldsProps) => {
  const intl = useAppIntl();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const { variable: liveVariable, variableOptions: liveVariableOptions } =
    useFormValue(['variable', 'variableOptions'] as const);
  const currentVariable =
    typeof liveVariable === 'string' ? liveVariable : variable;
  // Read both active and transiently dormant field state so dependent
  // validation resolves the current selection without subscribing to
  // unrelated field metadata during Section mount and unmount transitions.
  const currentOtherVariable = useFormStore((state) => {
    const entry =
      state.fields.get('otherVariable') ??
      state.dormantValues.get('otherVariable');
    if (!entry) return otherVariable;
    return typeof entry.value === 'string' ? entry.value : undefined;
  });
  const currentVariableOptions = Array.isArray(liveVariableOptions)
    ? (liveVariableOptions as VariableOption[])
    : variableOptions;
  const { createVariable } = useCreateVariable();

  const subject = { entity, type: type ?? undefined };
  // The main `variable` picker is an UNVALIDATED writer: drop options a form
  // elsewhere already validates. CategoricalBin's "other" picker is a
  // VALIDATED writer (its input now honours the referenced variable's
  // codebook validation): drop options an unvalidated writer elsewhere
  // already claims.
  const rawVariableOptions = useAppSelector((state) =>
    getVariableOptionsForSubject(state, subject),
  );
  const optionsForCurrentVariable = useAppSelector((state) => {
    const variables = getVariablesForSubject(state, subject);
    const found = currentVariable ? variables[currentVariable] : undefined;
    return found && 'options' in found ? (found.options ?? []) : [];
  });

  // Picking a different variable replaces the draft options with that
  // variable's already-committed ones — but only on an actual change, so
  // opening the
  // dialog on an already-configured prompt doesn't clobber its live draft.
  const previousVariableRef = useRef(currentVariable);
  useEffect(() => {
    if (previousVariableRef.current === currentVariable) return;
    previousVariableRef.current = currentVariable;
    setFieldValue('variableOptions', optionsForCurrentVariable);
  }, [currentVariable, optionsForCurrentVariable, setFieldValue]);

  // Both exclusions keep the picker's own current pick, so opening an
  // already-configured prompt never loses its variable from the list.
  const categoricalVariableOptions = useAppSelector(
    (state) =>
      // A variable an interface derives from the structure a participant
      // builds is not a bin: the bin writes through drag-and-drop and would
      // overwrite it. Binding a variable whose OPTIONS an interface owns stays
      // available — sorting family members by sex is legitimate authoring —
      // and the options editor below renders read-only for those.
      excludeInterfaceOwned(
        state,
        subject,
        excludeValidatedUses(
          state,
          subject,
          rawVariableOptions.filter(
            ({ type: variableType }) => variableType === 'categorical',
          ),
          currentVariable,
        ),
        currentVariable,
      ),
    shallowEqual,
  );
  // The interview and genetics engine branch on these exact values, so the
  // list is fixed however the variable is reached — and a variable the
  // new-variable window stamped `readOnly` is fixed for its own reason.
  const lockedOptions = useLockedOptions(subject, currentVariable);
  const otherVariableTextOptions = useAppSelector(
    (state) =>
      excludeUnvalidatedUses(
        state,
        subject,
        rawVariableOptions.filter(
          ({ type: variableType }) => variableType === 'text',
        ),
        currentOtherVariable,
      ),
    shallowEqual,
  );
  const getOptions = getSortOrderOptionGetter(rawVariableOptions, intl);
  const sortMaxItems = getOptions('property', undefined, []).length;
  const totalOptionsLength =
    currentVariableOptions.length + (currentOtherVariable ? 1 : 0);
  const showVariableOptionsTip = totalOptionsLength > 8;

  const newVariableWindowInitialProps = {
    entity: entity as Entity,
    type: type ?? '',
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
      { initialValues: { name, type: 'categorical' } },
      { field: 'variable' },
    );
  const handleCreateOtherVariable = async (name: string) => {
    const id = await createVariable(name, 'text');
    if (id) setFieldValue('otherVariable', id);
  };

  return (
    <>
      <PromptText initialValue={text} />
      <Section
        title={intl.formatMessage(messages.categoricalResponse)}
        description={intl.formatMessage(
          messages.chooseTheCategoricalAttributeAndConfigure,
        )}
      >
        <ArchitectField
          name="variable"
          label={intl.formatMessage(messages.attribute)}
          hint={intl.formatMessage(messages.selectACategoricalAttribute)}
          component={VariablePicker}
          validation={{ required: true }}
          initialValue={variable}
          type={type}
          entity={entity}
          options={categoricalVariableOptions}
          onCreateOption={handleNewVariable}
        />
        {currentVariable && lockedOptions && (
          <LockedOptions options={lockedOptions} />
        )}
        {currentVariable && !lockedOptions && showVariableOptionsTip && (
          <Alert variant="destructive" className="my-7">
            <AlertTitle>
              {intl.formatMessage(messages.tooManyOptionValues)}
            </AlertTitle>
            <AlertDescription>
              {intl.formatMessage(
                messages.theCategoricalBinInterfaceIsDesigned,
                { strong: (chunks) => <strong>{chunks}</strong> },
              )}
            </AlertDescription>
          </Alert>
        )}
        {currentVariable && !lockedOptions && (
          <ArchitectArrayField
            name="variableOptions"
            label={intl.formatMessage(messages.optionValues)}
            hint={intl.formatMessage(
              messages.aCategoricalAttributeContainsPreDefinedCategories,
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
      <Section
        disabled={!currentVariable}
        title={intl.formatMessage(messages.followUpOtherOption)}
        description={intl.formatMessage(
          messages.collectAParticipantEnteredValueWhenA,
        )}
        toggleable
        defaultOpen={!!currentOtherVariable}
      >
        <ArchitectField
          name="otherVariable"
          label={intl.formatMessage(messages.otherAttribute)}
          hint={intl.formatMessage(messages.selectATextAttributeToStore)}
          component={VariablePicker}
          validation={{ required: true }}
          initialValue={otherVariable}
          entity={entity}
          type={type}
          options={otherVariableTextOptions}
          onCreateOption={handleCreateOtherVariable}
        />
        {currentOtherVariable && (
          <div className="mb-8">
            <CodebookVariableValidationSection
              sectionSummary={intl.formatMessage(
                remainingMessages.enableValidationOfTheOtherAttribute,
              )}
              fieldName="otherVariable"
              entity={entity}
              type={type}
              variableId={currentOtherVariable}
            />
          </div>
        )}
        <ArchitectField
          name="otherOptionLabel"
          label={intl.formatMessage(messages.otherBinLabel)}
          hint={intl.formatMessage(messages.enterALabelForTheOther)}
          component={RichTextField}
          validation={{ required: true }}
          initialValue={otherOptionLabel}
          singleLine
          placeholder={intl.formatMessage(messages.enterALabelSuchAsOther)}
        />
        <ArchitectField
          name="otherVariablePrompt"
          label={intl.formatMessage(messages.followUpQuestion)}
          hint={intl.formatMessage(messages.enterAQuestionPromptToShow)}
          component={RichTextField}
          validation={{ required: true }}
          initialValue={otherVariablePrompt}
          singleLine
          placeholder={intl.formatMessage(
            messages.enterAQuestionPromptToShow56295,
          )}
        />
      </Section>
      <BucketSortOrderSection
        disabled={!currentVariable}
        maxItems={sortMaxItems}
        optionGetter={getOptions}
        initialValue={bucketSortOrder}
      />
      <BinSortOrderSection
        disabled={!currentVariable}
        maxItems={sortMaxItems}
        optionGetter={getOptions}
        initialValue={binSortOrder}
      />
      <NewVariableWindow
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...newVariableWindowProps}
      />
    </>
  );
};

export default PromptFields;
