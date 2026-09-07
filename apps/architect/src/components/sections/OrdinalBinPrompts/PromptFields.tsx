import { useEffect, useMemo, useRef } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  optionsValidation,
  type OptionValue,
} from '~/components/Form/arrayFields/Options';
import ColorPicker from '~/components/Form/Fields/ColorPicker';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import LockedOptions from '~/components/Options/LockedOptions';
import { getSortOrderOptionGetter } from '~/components/sections/CategoricalBinPrompts/optionGetters';
import PromptText from '~/components/sections/PromptText';
import type { RootState } from '~/ducks/modules/root';
import {
  getVariableOptionsForSubject,
  getVariablesForSubject,
} from '~/selectors/codebook';
import {
  excludeInterfaceOwned,
  excludeValidatedUses,
} from '~/selectors/roleFilters';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import BinSortOrderSection from '../BinSortOrderSection';
import BucketSortOrderSection from '../BucketSortOrderSection';
import { useLockedOptions } from '../useLockedOptions';
const additionalMessages = defineMessages({
  createNewOption: {
    id: 'architect.additional.sections.ordinalBinPrompts.promptFields.createNewOption',
    defaultMessage: 'Create new option',
    description:
      'The addButtonLabel text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
});
const messages = defineMessages({
  ordinalResponse: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.ordinalResponse',
    defaultMessage: 'Ordinal response',
    description:
      'The title text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  chooseTheOrdinalAttributeWhoseValues: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.chooseTheOrdinalAttributeWhoseValues',
    defaultMessage:
      'Choose the ordinal attribute whose values are shown as bins.',
    description:
      'The description text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  attribute: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.attribute',
    defaultMessage: 'Attribute',
    description:
      'The label text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  selectAnOrdinalAttribute: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.selectAnOrdinalAttribute',
    defaultMessage: 'Select an ordinal attribute.',
    description:
      'The hint text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  attributeOptions: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.attributeOptions',
    defaultMessage: 'Attribute options',
    description:
      'The title text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  tooManyOptionValues: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.tooManyOptionValues',
    defaultMessage: 'Too many option values',
    description:
      'Visible text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  theOrdinalBinInterfaceIsDesigned: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.theOrdinalBinInterfaceIsDesigned',
    defaultMessage:
      'The ordinal bin interface is designed to use <strong>up to 5 option values</strong>. Using more will create a sub-optimal experience for participants, and might reduce data quality.',
    description:
      'Visible text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  optionValues: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.optionValues',
    defaultMessage: 'Option values',
    description:
      'The label text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  anOrdinalAttributeContainsPreDefinedCategories: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.anOrdinalAttributeContainsPreDefinedCategories',
    defaultMessage:
      'An ordinal attribute contains pre-defined categories made up of a label (shown to the participant) and a value. Create <strong>up to 5</strong> option values for this attribute.',
    description:
      'Visible text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  colorGradient: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.colorGradient',
    defaultMessage: 'Color gradient',
    description:
      'The title text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  chooseTheGradientUsedToDistinguish: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.chooseTheGradientUsedToDistinguish',
    defaultMessage: 'Choose the gradient used to distinguish ordinal options.',
    description:
      'The description text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  color: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.color',
    defaultMessage: 'Color',
    description:
      'The label text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
  interviewerWillRenderEachOptionIn: {
    id: 'architect.sections.ordinalBinPrompts.promptFields.interviewerWillRenderEachOptionIn',
    defaultMessage:
      'Interviewer will render each option in your ordinal attribute using a color gradient.',
    description:
      'The hint text in components / sections / OrdinalBinPrompts / PromptFields.',
  },
});

type SelectOption = {
  label: string;
  value: string;
  type?: string;
};

type SortOrderRow = Record<string, unknown>;

const EMPTY_OPTIONS: SelectOption[] = [];
const EMPTY_VARIABLE_OPTIONS: OptionValue[] = [];

type PromptFieldsProps = {
  entity?: 'node' | 'edge' | 'ego' | null;
  type?: string | null;
  text?: string;
  variable?: string;
  color?: string;
  variableOptions?: OptionValue[];
  bucketSortOrder?: SortOrderRow[];
  binSortOrder?: SortOrderRow[];
};

const PromptFields = ({
  entity = null,
  type = null,
  text,
  variable,
  color,
  variableOptions = EMPTY_VARIABLE_OPTIONS,
  bucketSortOrder,
  binSortOrder,
}: PromptFieldsProps) => {
  const intl = useAppIntl();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const { variable: liveVariable, variableOptions: liveVariableOptions } =
    useFormValue(['variable', 'variableOptions'] as const);
  const currentVariable =
    typeof liveVariable === 'string' ? liveVariable : variable;
  const currentVariableOptions = Array.isArray(liveVariableOptions)
    ? (liveVariableOptions as OptionValue[])
    : variableOptions;

  const subject = useMemo(
    () => (entity ? { entity, type: type ?? undefined } : null),
    [entity, type],
  );

  // Sort keys are read-only references outside the writer-exclusivity rule: a
  // bin may still be bucket/bin-sorted by a form-collected variable that the
  // role-filtered writer pool below drops, so they draw from this RAW pool.
  const sortVariableOptions = useSelector(
    (state: RootState) =>
      subject
        ? (getVariableOptionsForSubject(state, subject) as SelectOption[])
        : EMPTY_OPTIONS,
    shallowEqual,
  );

  // The `variable` picker is an UNVALIDATED writer: drop options a form
  // elsewhere already validates, and drop any variable an interface derives
  // from the structure a participant builds (this bin writes through
  // drag-and-drop and would overwrite it). The current pick is always kept.
  const ordinalVariableOptions = useSelector(
    (state: RootState) =>
      subject
        ? (excludeInterfaceOwned(
            state,
            subject,
            excludeValidatedUses(
              state,
              subject,
              sortVariableOptions.filter(
                ({ type: variableType }) => variableType === 'ordinal',
              ),
              currentVariable,
            ),
            currentVariable,
          ) as SelectOption[])
        : EMPTY_OPTIONS,
    shallowEqual,
  );

  // An interface that branches on the variable's exact values owns its option
  // list, so the editor renders it read-only rather than offering an edit the
  // protocol rule would then reject.
  const lockedOptions = useLockedOptions(subject, currentVariable);

  const optionsForCurrentVariable = useSelector((state: RootState) => {
    if (!subject || !currentVariable) return EMPTY_VARIABLE_OPTIONS;
    const variables = getVariablesForSubject(state, subject);
    const found = variables[currentVariable];
    return found && 'options' in found
      ? ((found.options ?? EMPTY_VARIABLE_OPTIONS) as OptionValue[])
      : EMPTY_VARIABLE_OPTIONS;
  }, shallowEqual);

  // Picking a different variable replaces the draft options with that
  // variable's already-committed ones (the `withVariableOptions` lifecycle
  // this replaces) — but only on an actual change, so opening the dialog on
  // an already-configured prompt doesn't clobber its live draft.
  const previousVariableRef = useRef(currentVariable);
  useEffect(() => {
    if (previousVariableRef.current === currentVariable) return;
    previousVariableRef.current = currentVariable;
    setFieldValue('variableOptions', optionsForCurrentVariable);
  }, [currentVariable, optionsForCurrentVariable, setFieldValue]);

  const getOptions = getSortOrderOptionGetter(sortVariableOptions, intl);
  const sortMaxItems = getOptions('property', undefined, []).length;
  const showVariableOptionsTip = currentVariableOptions.length > 5;

  const newVariableWindowInitialProps = {
    entity: (entity ?? 'node') as Entity,
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
      { initialValues: { name, type: 'ordinal' } },
      { field: 'variable' },
    );

  return (
    <>
      <PromptText initialValue={text} />
      <Section
        title={intl.formatMessage(messages.ordinalResponse)}
        description={intl.formatMessage(
          messages.chooseTheOrdinalAttributeWhoseValues,
        )}
      >
        <ArchitectField
          name="variable"
          label={intl.formatMessage(messages.attribute)}
          hint={intl.formatMessage(messages.selectAnOrdinalAttribute)}
          component={VariablePicker}
          validation={{ required: true }}
          initialValue={variable}
          entity={entity}
          type={type}
          options={ordinalVariableOptions}
          onCreateOption={handleNewVariable}
        />
      </Section>
      {currentVariable && (
        <Section title={intl.formatMessage(messages.attributeOptions)}>
          {lockedOptions && <LockedOptions options={lockedOptions} />}
          {!lockedOptions && showVariableOptionsTip && (
            <Alert variant="destructive" className="my-7">
              <AlertTitle>
                {intl.formatMessage(messages.tooManyOptionValues)}
              </AlertTitle>
              <AlertDescription>
                {intl.formatMessage(messages.theOrdinalBinInterfaceIsDesigned, {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </AlertDescription>
            </Alert>
          )}
          {!lockedOptions && (
            <ArchitectArrayField
              name="variableOptions"
              label={intl.formatMessage(messages.optionValues)}
              hint={
                <>
                  {intl.formatMessage(
                    messages.anOrdinalAttributeContainsPreDefinedCategories,
                    { strong: (chunks) => <strong>{chunks}</strong> },
                  )}
                </>
              }
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
        title={intl.formatMessage(messages.colorGradient)}
        description={intl.formatMessage(
          messages.chooseTheGradientUsedToDistinguish,
        )}
      >
        <ArchitectField
          name="color"
          label={intl.formatMessage(messages.color)}
          hint={intl.formatMessage(messages.interviewerWillRenderEachOptionIn)}
          component={ColorPicker}
          validation={{ required: true }}
          initialValue={color}
          palette="ord-color-seq"
          paletteRange={8}
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
