import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  optionsValidation,
  type OptionValue,
} from '~/components/Form/arrayFields/Options';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import IssueAnchor from '~/components/IssueAnchor';
import { getLockedOptions } from '~/components/Options/getLockedOptions';
import LockedOptions from '~/components/Options/LockedOptions';
import Parameters from '~/components/Parameters';
import { asParameterValues } from '~/components/Parameters/parameterValues';
import {
  getVariableTypeLabel,
  isBooleanWithOptions,
  isOrdinalOrCategoricalType,
  isVariableTypeWithParameters,
} from '~/config/variables';
import { documentationLinks } from '~/utils/documentationLinks';

import BooleanChoice from '../../BooleanChoice';
import ExternalLink from '../../ExternalLink';
import { toSelectOptions } from './helpers';
import type { FieldHandlers } from './withFieldsHandlers';
const additionalMessages = defineMessages({
  howTheAnswerIsCollectedFor: {
    id: 'architect.additional.sections.form.variableDefinitionFields.howTheAnswerIsCollectedFor',
    defaultMessage:
      'How the answer is collected. For detailed information about these options, see our <ExternalLink> documentation </ExternalLink> .',
    description:
      'Visible text in components / sections / Form / VariableDefinitionFields.',
  },
  createNewOption: {
    id: 'architect.additional.sections.form.variableDefinitionFields.createNewOption',
    defaultMessage: 'Create new option',
    description:
      'The addButtonLabel text in components / sections / Form / VariableDefinitionFields.',
  },
});
const messages = defineMessages({
  attribute: {
    id: 'architect.sections.form.variableDefinitionFields.attribute',
    defaultMessage: 'Attribute',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  attributeSelection: {
    id: 'architect.sections.form.variableDefinitionFields.attributeSelection',
    defaultMessage: 'Attribute selection',
    description:
      'The title text in components / sections / Form / VariableDefinitionFields.',
  },
  chooseTheAttributeThisFormField: {
    id: 'architect.sections.form.variableDefinitionFields.chooseTheAttributeThisFormField',
    defaultMessage: 'Choose the attribute this form field will collect.',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  inputControl: {
    id: 'architect.sections.form.variableDefinitionFields.inputControl',
    defaultMessage: 'Input control',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  selectAnInputControl: {
    id: 'architect.sections.form.variableDefinitionFields.selectAnInputControl',
    defaultMessage: 'Select an input control',
    description:
      'The placeholder text in components / sections / Form / VariableDefinitionFields.',
  },
  theSelectedInputControlWillCause: {
    id: 'architect.sections.form.variableDefinitionFields.theSelectedInputControlWillCause',
    defaultMessage:
      'The selected input control will cause this attribute to be defined as type <strong>{variableType}</strong>. Once set, this cannot be changed (although you may change the input control within this type).',
    description:
      'Visible text in components / sections / Form / VariableDefinitionFields.',
  },
  attributeTypeIsLocked: {
    id: 'architect.sections.form.variableDefinitionFields.attributeTypeIsLocked',
    defaultMessage: 'Attribute type is locked',
    description:
      'Visible text in components / sections / Form / VariableDefinitionFields.',
  },
  aPreExistingAttributeIsCurrentlySelected: {
    id: 'architect.sections.form.variableDefinitionFields.aPreExistingAttributeIsCurrentlySelected',
    defaultMessage:
      'A pre-existing attribute is currently selected. You cannot change an attribute type after it has been created, so only <strong>{variableType}</strong> compatible input controls can be selected above. If you would like to use a different input control type, you will need to create a new attribute.',
    description:
      'Visible text in components / sections / Form / VariableDefinitionFields.',
  },
  choiceValues: {
    id: 'architect.sections.form.variableDefinitionFields.choiceValues',
    defaultMessage: 'Choice values',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  defineTheValuesParticipantsCanChoose: {
    id: 'architect.sections.form.variableDefinitionFields.defineTheValuesParticipantsCanChoose',
    defaultMessage:
      'Define the values participants can choose for this categorical or ordinal attribute.',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  categoricalOrdinalOptions: {
    id: 'architect.sections.form.variableDefinitionFields.categoricalOrdinalOptions',
    defaultMessage: 'Categorical/Ordinal options',
    description:
      'The label text in components / sections / Form / VariableDefinitionFields.',
  },
  theInputTypeYouSelectedIndicates: {
    id: 'architect.sections.form.variableDefinitionFields.theInputTypeYouSelectedIndicates',
    defaultMessage:
      'The input type you selected indicates that this is a categorical or ordinal attribute. Create a minimum of two possible values for the participant to choose between.',
    description:
      'The hint text in components / sections / Form / VariableDefinitionFields.',
  },
  booleanValues: {
    id: 'architect.sections.form.variableDefinitionFields.booleanValues',
    defaultMessage: 'Boolean values',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  defineTheValuesStoredForThe: {
    id: 'architect.sections.form.variableDefinitionFields.defineTheValuesStoredForThe',
    defaultMessage: 'Define the values stored for the on and off states.',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  controlSettings: {
    id: 'architect.sections.form.variableDefinitionFields.controlSettings',
    defaultMessage: 'Control settings',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  configureTheSettingsAvailableForThis: {
    id: 'architect.sections.form.variableDefinitionFields.configureTheSettingsAvailableForThis',
    defaultMessage: 'Configure the settings available for this input control.',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  answerControl: {
    id: 'architect.sections.form.variableDefinitionFields.answerControl',
    defaultMessage: 'Answer control',
    description:
      'The title text in components / sections / Form / VariableDefinitionFields.',
  },
  chooseHowParticipantsEnterAnAnswer: {
    id: 'architect.sections.form.variableDefinitionFields.chooseHowParticipantsEnterAnAnswer',
    defaultMessage:
      'Choose how participants enter an answer for this attribute.',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
  selectAnAttributeBeforeChoosingIts: {
    id: 'architect.sections.form.variableDefinitionFields.selectAnAttributeBeforeChoosingIts',
    defaultMessage: 'Select an attribute before choosing its input control.',
    description:
      'The description text in components / sections / Form / VariableDefinitionFields.',
  },
});

/** Stable empty list: `initialValue` is a register-effect dependency. */
const NO_OPTIONS: OptionValue[] = [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asOptions = (value: unknown): OptionValue[] =>
  Array.isArray(value) ? (value as OptionValue[]) : NO_OPTIONS;

type SharedProps = {
  entity?: string | null;
  type?: string | null;
  /**
   * The row being edited, already merged with its codebook variable. Every
   * control seeds its `initialValue` from here — `getFormValues()` reports
   * registered fields only, so a field that registers empty would blank the
   * property it owns when the dialog saves.
   */
  item: Record<string, unknown>;
  /** The variable/input-control state both editors already own. */
  fields: FieldHandlers;
  /** Retained while both field-editor callers migrate to shared sections. */
  withSectionTitles?: boolean;
};

/**
 * The attribute picker both field editors open with. Its hint is the only
 * researcher-facing difference: the composer's picker also creates codebook
 * attributes, and says so.
 */
export const VariablePickerSection = ({
  entity = null,
  type = null,
  item,
  fields,
  hint,
}: SharedProps & { hint: ReactNode }) => {
  const intl = useAppIntl();
  return (
    <>
      <IssueAnchor
        fieldName="variable"
        description={intl.formatMessage(messages.attribute)}
      />
      <Section
        title={intl.formatMessage(messages.attributeSelection)}
        description={intl.formatMessage(
          messages.chooseTheAttributeThisFormField,
        )}
      >
        <ArchitectField
          name="variable"
          label={intl.formatMessage(messages.attribute)}
          hint={hint}
          component={VariablePickerControl}
          initialValue={asString(item.variable)}
          validation={{ required: true }}
          entity={entity ?? undefined}
          type={type ?? undefined}
          options={fields.variableOptions}
          onCreateOption={fields.handleNewVariable}
        />
      </Section>
    </>
  );
};

/**
 * Everything that DEFINES a codebook attribute: which input control collects
 * it, and the option list or parameters that control needs.
 *
 * Both field editors — the Form stage's `FieldFields` and NetworkComposer's
 * `ComposerAttributeFields` — render exactly this, over the same
 * `useFieldHandlers` state. They were two copies until the copies started
 * answering the same researcher question in different words; the differences
 * that remain (section headings, the picker's hint, what each editor adds
 * around this) are props and surrounding markup, not a second implementation.
 */
export const InputControlFields = ({ item, fields }: SharedProps) => {
  const intl = useAppIntl();
  const { variable, variableType, isNewVariable, componentOptions } = fields;

  return (
    <>
      <IssueAnchor
        fieldName="component"
        description={intl.formatMessage(messages.inputControl)}
      />
      <ArchitectField
        name="component"
        label={intl.formatMessage(messages.inputControl)}
        hint={
          <>
            {intl.formatMessage(additionalMessages.howTheAnswerIsCollectedFor, {
              ExternalLink: (chunks) => (
                <ExternalLink href={documentationLinks.inputControls}>
                  {chunks}
                </ExternalLink>
              ),
            })}
          </>
        }
        component={NativeSelectField}
        initialValue={asString(item.component)}
        validation={{ required: true }}
        placeholder={intl.formatMessage(messages.selectAnInputControl)}
        disabled={!variable}
        // A NEW variable keeps the authored order, which reads as a
        // progression from simplest control to most involved. An existing
        // variable's list is a lookup — the researcher knows what they want
        // and is finding it — so it is alphabetised (within each group,
        // since the list may still be grouped by type).
        options={toSelectOptions(
          componentOptions,
          {
            sorted: !isNewVariable,
          },
          intl,
        )}
      />
      {isNewVariable && variableType && (
        <Alert variant="info" className="my-7">
          <AlertDescription>
            {intl.formatMessage(messages.theSelectedInputControlWillCause, {
              variableType: getVariableTypeLabel(variableType, intl),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AlertDescription>
        </Alert>
      )}
      {!isNewVariable && variableType && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>
            {intl.formatMessage(messages.attributeTypeIsLocked)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(
              messages.aPreExistingAttributeIsCurrentlySelected,
              {
                variableType: getVariableTypeLabel(variableType, intl),
                strong: (chunks) => <strong>{chunks}</strong>,
              },
            )}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};

export const VariableConfigurationFields = ({ item, fields }: SharedProps) => {
  const intl = useAppIntl();
  const {
    variable,
    variableType,
    component,
    existingVariables,
    interfaceOwnedOptionSet,
  } = fields;
  const lockedOptions = getLockedOptions(
    existingVariables,
    variable,
    interfaceOwnedOptionSet,
  );

  return (
    <>
      {isOrdinalOrCategoricalType(variableType) && (
        <>
          <IssueAnchor
            fieldName="options"
            description={intl.formatMessage(messages.choiceValues)}
          />
          <Section
            title={intl.formatMessage(messages.choiceValues)}
            description={intl.formatMessage(
              messages.defineTheValuesParticipantsCanChoose,
            )}
          >
            {lockedOptions ? (
              <LockedOptions options={lockedOptions} />
            ) : (
              <ArchitectArrayField
                name="options"
                label={intl.formatMessage(messages.categoricalOrdinalOptions)}
                hint={intl.formatMessage(
                  messages.theInputTypeYouSelectedIndicates,
                )}
                component={Options}
                addButtonLabel={intl.formatMessage(
                  additionalMessages.createNewOption,
                )}
                initialValue={asOptions(item.options)}
                validation={optionsValidation(intl)}
              />
            )}
          </Section>
        </>
      )}
      {isBooleanWithOptions(component) && (
        <>
          {/* BooleanChoice writes to the `options` field, so anchor it there (it
              is mutually exclusive with the Categorical/Ordinal options section
              above, so the shared id never collides at runtime). */}
          <IssueAnchor
            fieldName="options"
            description={intl.formatMessage(messages.booleanValues)}
          />
          <Section
            title={intl.formatMessage(messages.booleanValues)}
            description={intl.formatMessage(
              messages.defineTheValuesStoredForThe,
            )}
          >
            <BooleanChoice initialValue={asOptions(item.options)} />
          </Section>
        </>
      )}
      {isVariableTypeWithParameters(variableType) && (
        <>
          <IssueAnchor
            fieldName="parameters"
            description={intl.formatMessage(messages.controlSettings)}
          />
          <Section
            title={intl.formatMessage(messages.controlSettings)}
            description={intl.formatMessage(
              messages.configureTheSettingsAvailableForThis,
            )}
          >
            <Parameters
              type={variableType}
              component={component ?? ''}
              name="parameters"
              initialParameters={asParameterValues(item.parameters)}
            />
          </Section>
        </>
      )}
    </>
  );
};

const VariableDefinitionFields = (props: SharedProps) => {
  const intl = useAppIntl();
  return (
    <>
      <Section
        title={intl.formatMessage(messages.answerControl)}
        description={
          props.fields.variable
            ? intl.formatMessage(messages.chooseHowParticipantsEnterAnAnswer)
            : intl.formatMessage(messages.selectAnAttributeBeforeChoosingIts)
        }
        disabled={!props.fields.variable}
      >
        <InputControlFields {...props} />
      </Section>
      <VariableConfigurationFields {...props} />
    </>
  );
};

export default VariableDefinitionFields;
