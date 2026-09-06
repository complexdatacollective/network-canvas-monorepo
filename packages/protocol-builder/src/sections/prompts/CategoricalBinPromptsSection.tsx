import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import type { CrossClassPick } from '../../codebook/variableValidation.ts';
import RichTextField from '../../fields/RichTextField.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import PromptsSection from '../PromptsSection.tsx';
import type { RowEditorProps } from '../rowRenderers.tsx';
import { censusPromptsMessages } from './censusPromptsMessages.ts';
import PromptAttributeField from './PromptAttributeField.tsx';
import {
  usePromptPickGate,
  useSortVariablePool,
  useStageSubject,
} from './promptCodebook.ts';
import { PromptTextField, PromptTextPreview } from './promptText.tsx';
import SortOrderRows from './SortOrderRows.tsx';

/** Only a categorical attribute has the named values this interface bins by. */
const BIN_TYPES: readonly VariableType[] = Object.freeze(['categorical']);

/**
 * The follow-up answer is typed by the participant, so it is stored as text.
 */
const FOLLOW_UP_TYPES: readonly VariableType[] = Object.freeze(['text']);

/**
 * The two picks this prompt makes, and the class of writer each one is.
 *
 * The bins are filled by dragging, which writes the attribute without asking
 * the participant anything a form could validate. The follow-up is typed into
 * an input that honours the attribute's own codebook validation, so it is the
 * opposite class — and the two therefore exclude different attributes.
 */
const PICKS: readonly CrossClassPick[] = Object.freeze([
  { path: 'variable', writerClass: 'unvalidated' },
  { path: 'otherVariable', writerClass: 'validated' },
]);

/** What this interface can show at once before the bins stop being readable. */
const BIN_LIMIT = 8;

/**
 * What only this family says. Everything a bin shares with the ordinal bin, or
 * with the censuses, is declared once in `censusPromptsMessages.ts`.
 */
const messages = defineMessages({
  guidance: {
    id: 'protocolBuilder.censusPrompts.categoricalBinGuidance',
    defaultMessage:
      'The participant drags each person into one of the bins below, so write a question the bins are the answers to — “what kind of contact do you have with this person?” rather than a yes or no question.',
    description:
      'Guidance shown above the box where a researcher writes a Categorical Bin prompt, saying what the participant does with it. The quoted sentence is an example of a question whose answers are the bins.',
  },
  placeholder: {
    id: 'protocolBuilder.censusPrompts.categoricalBinPlaceholder',
    defaultMessage: 'What type of contact do you have most with this person?',
    description:
      'Example question in the empty box where a researcher writes a Categorical Bin prompt.',
  },
  binsTitle: {
    id: 'protocolBuilder.censusPrompts.categoricalBinBinsTitle',
    defaultMessage: 'The bins',
    description:
      'Heading of the group that picks the attribute whose values are the bins the participant drags people into.',
  },
  binsDescription: {
    id: 'protocolBuilder.censusPrompts.categoricalBinBinsDescription',
    defaultMessage:
      'Choose the attribute whose values the participant sorts people into.',
    description:
      'Description of the group that picks the attribute whose values are the bins the participant drags people into. An attribute is one thing an interview records about a network member.',
  },
  binsHint: {
    id: 'protocolBuilder.censusPrompts.categoricalBinBinsHint',
    defaultMessage:
      "Each of this attribute's values becomes a bin, and dropping someone into a bin records that value for them.",
    description:
      'Guidance under the attribute picker in a Categorical Bin prompt, saying what happens to the attribute’s values in the interview.',
  },
  binsEmpty: {
    id: 'protocolBuilder.censusPrompts.categoricalBinBinsEmpty',
    defaultMessage:
      'This type has no categorical attributes yet. Create one to say what the bins are.',
    description:
      'Shown in place of the attribute picker’s options when the node type this stage collects has no attribute whose answers come from a named list.',
  },
  binLimitDescription: {
    id: 'protocolBuilder.censusPrompts.categoricalBinLimitDescription',
    defaultMessage:
      'This interface is designed for up to eight bins, including a follow-up bin. Beyond that the bins become hard to read and hard to drop into, which costs data quality. Consider grouping the values and asking for the detail in a later question.',
    description:
      'Body of the warning shown when a Categorical Bin prompt would draw more bins than its interview screen is designed for. The follow-up bin is the extra one this prompt can add for answers none of the attribute’s values cover.',
  },
  otherTitle: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherTitle',
    defaultMessage: 'A bin for anything else',
    description:
      'Heading of the optional group that adds one more bin for people none of the attribute’s values describe.',
  },
  otherDescription: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherDescription',
    defaultMessage:
      'Add a bin for people none of the values above describe, and ask the participant what to record instead.',
    description:
      'Description of the optional group that adds one more bin for people none of the attribute’s values describe.',
  },
  otherAttributeLabel: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeLabel',
    defaultMessage: 'Attribute the answer is stored in',
    description:
      'Label of the control that picks which attribute holds what the participant types into the follow-up bin.',
  },
  otherAttributeHint: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeHint',
    defaultMessage:
      'The participant types their own answer, so this is a text attribute.',
    description:
      'Guidance under the control that picks which attribute holds what the participant types into the follow-up bin, saying why only text attributes are offered.',
  },
  otherAttributeRequired: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeRequired',
    defaultMessage: "Choose the attribute this bin's answers are stored in.",
    description:
      'Refusal shown when a researcher switches the follow-up bin on and saves the prompt without saying where its answers are stored.',
  },
  otherAttributeCreateLabel: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeCreateLabel',
    defaultMessage: 'Create a new text attribute',
    description:
      'Button that opens the codebook editor for inventing the text attribute the follow-up bin stores its answers in. Also the title of the dialog it opens.',
  },
  otherAttributeValidationLabel: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeValidationLabel',
    defaultMessage: 'Set rules for what the participant types',
    description:
      'Button that opens the codebook editor for the rules the participant’s typed answer has to satisfy. Also the title of the dialog it opens.',
  },
  otherAttributeEmpty: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeEmpty',
    defaultMessage:
      'This type has no text attributes yet. Create one to store what the participant types.',
    description:
      'Shown in place of the follow-up bin’s attribute options when the node type this stage collects has no attribute the participant can type into.',
  },
  otherBinLabel: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherBinLabel',
    defaultMessage: 'Bin label',
    description:
      'Label of the box a researcher writes the follow-up bin’s own name into — the words drawn on that bin in the interview.',
  },
  otherBinHint: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherBinHint',
    defaultMessage:
      'Shown on the bin itself, so it has to read as somewhere to put a person the other bins do not fit.',
    description:
      'Guidance under the box a researcher writes the follow-up bin’s own name into.',
  },
  otherBinPlaceholder: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherBinPlaceholder',
    defaultMessage: 'Other',
    description:
      'Example name in the empty box where a researcher names the follow-up bin.',
  },
  otherBinRequired: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherBinRequired',
    defaultMessage: 'Name the bin the participant drops everyone else into.',
    description:
      'Refusal shown when a researcher switches the follow-up bin on and saves the prompt without naming it.',
  },
  otherPromptLabel: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherPromptLabel',
    defaultMessage: 'Follow-up question',
    description:
      'Label of the box a researcher writes the question asked as soon as the participant uses the follow-up bin.',
  },
  otherPromptHint: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherPromptHint',
    defaultMessage: 'Asked as soon as someone is dropped into this bin.',
    description:
      'Guidance under the box a researcher writes the follow-up bin’s own question into, saying when the participant reads it.',
  },
  otherPromptPlaceholder: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherPromptPlaceholder',
    defaultMessage: 'What type of contact do you have with this person?',
    description:
      'Example question in the empty box where a researcher writes the follow-up bin’s own question.',
  },
  otherPromptRequired: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherPromptRequired',
    defaultMessage: 'Write the question this bin asks.',
    description:
      'Refusal shown when a researcher switches the follow-up bin on and saves the prompt without writing the question it asks.',
  },
});

/**
 * What the participant is doing while they answer, said before the researcher
 * writes the question rather than after it.
 */
function CategoricalBinGuidance() {
  const intl = useAppIntl();
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        {intl.formatMessage(messages.guidance)}
      </AlertDescription>
    </Alert>
  );
}

/**
 * One Categorical Bin question: what to ask, which attribute's values become
 * the bins, and what happens to an answer none of them covers.
 */
function CategoricalBinPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useStageSubject();
  const sortableProperties = useSortVariablePool(subject);
  const { variable, otherVariable } = useFormValue([
    'variable',
    'otherVariable',
  ] as const);
  const chosen = typeof variable === 'string' && variable !== '';
  const committed = typeof item.variable === 'string' ? item.variable : '';
  const committedOther =
    typeof item.otherVariable === 'string' ? item.otherVariable : '';
  // Read live rather than from the row: switching the follow-up bin on adds a
  // bin to the screen the researcher is looking at, so the warning about how
  // many bins fit has to answer for it before the prompt is saved.
  const followUpBins =
    typeof otherVariable === 'string' && otherVariable !== '' ? 1 : 0;

  return (
    <>
      <PromptTextField
        guidance={<CategoricalBinGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
      />
      <PromptAttributeField
        name="variable"
        title={intl.formatMessage(messages.binsTitle)}
        description={intl.formatMessage(messages.binsDescription)}
        label={intl.formatMessage(censusPromptsMessages.attributeLabel)}
        hint={intl.formatMessage(messages.binsHint)}
        requiredMessage={intl.formatMessage(
          censusPromptsMessages.binAttributeRequired,
        )}
        subject={subject}
        types={BIN_TYPES}
        createType="categorical"
        writerClass="unvalidated"
        createLabel={intl.formatMessage(
          censusPromptsMessages.attributeCreateLabel,
        )}
        editLabel={intl.formatMessage(censusPromptsMessages.attributeEditLabel)}
        emptyMessage={intl.formatMessage(messages.binsEmpty)}
        {...(committed === '' ? {} : { committedValue: committed })}
        optionLimit={BIN_LIMIT}
        extraCountedOptions={followUpBins}
        optionLimitTitle={intl.formatMessage(
          censusPromptsMessages.binLimitTitle,
        )}
        optionLimitDescription={intl.formatMessage(
          messages.binLimitDescription,
        )}
      />
      {/*
        Switching this group off clears all three fields together, which is
        what the protocol schema requires of them: a follow-up attribute with
        no label and no question would be a bin the participant can reach and
        then not be asked anything in.
      */}
      <Section
        title={intl.formatMessage(messages.otherTitle)}
        description={intl.formatMessage(messages.otherDescription)}
        toggleable
        disabled={!chosen}
        defaultOpen={committedOther !== ''}
      >
        {/*
          No values control, because a text attribute has no values to edit.
          Validation is the control that matters here instead: this bin is the
          one place in this interface where the participant TYPES an answer, so
          the attribute's own rules are all that stand between them and an
          answer the study cannot use. Architect mounts a validation section
          here for the same reason.
        */}
        <PromptAttributeField
          name="otherVariable"
          label={intl.formatMessage(messages.otherAttributeLabel)}
          hint={intl.formatMessage(messages.otherAttributeHint)}
          requiredMessage={intl.formatMessage(messages.otherAttributeRequired)}
          subject={subject}
          types={FOLLOW_UP_TYPES}
          createType="text"
          writerClass="validated"
          createLabel={intl.formatMessage(messages.otherAttributeCreateLabel)}
          validationLabel={intl.formatMessage(
            messages.otherAttributeValidationLabel,
          )}
          emptyMessage={intl.formatMessage(messages.otherAttributeEmpty)}
          {...(committedOther === '' ? {} : { committedValue: committedOther })}
        />
        <DialogFormField<typeof RichTextField>
          name="otherOptionLabel"
          label={intl.formatMessage(messages.otherBinLabel)}
          hint={intl.formatMessage(messages.otherBinHint)}
          component={RichTextField}
          singleLine
          placeholder={intl.formatMessage(messages.otherBinPlaceholder)}
          required={intl.formatMessage(messages.otherBinRequired)}
        />
        <DialogFormField<typeof RichTextField>
          name="otherVariablePrompt"
          label={intl.formatMessage(messages.otherPromptLabel)}
          hint={intl.formatMessage(messages.otherPromptHint)}
          component={RichTextField}
          singleLine
          placeholder={intl.formatMessage(messages.otherPromptPlaceholder)}
          required={intl.formatMessage(messages.otherPromptRequired)}
        />
      </Section>
      <SortOrderRows
        name="bucketSortOrder"
        title={intl.formatMessage(censusPromptsMessages.bucketOrderTitle)}
        description={intl.formatMessage(
          censusPromptsMessages.bucketOrderDescription,
        )}
        label={intl.formatMessage(censusPromptsMessages.bucketOrderLabel)}
        hint={intl.formatMessage(censusPromptsMessages.sortRulesAddedHint)}
        addButtonLabel={intl.formatMessage(
          censusPromptsMessages.bucketOrderAddLabel,
        )}
        emptyStateMessage={intl.formatMessage(
          censusPromptsMessages.bucketOrderEmptyState,
        )}
        properties={sortableProperties}
        disabled={!chosen}
        committedRules={item.bucketSortOrder}
      />
      <SortOrderRows
        name="binSortOrder"
        title={intl.formatMessage(censusPromptsMessages.binOrderTitle)}
        description={intl.formatMessage(
          censusPromptsMessages.binOrderDescription,
        )}
        label={intl.formatMessage(censusPromptsMessages.binOrderLabel)}
        hint={intl.formatMessage(censusPromptsMessages.sortRulesDroppedHint)}
        addButtonLabel={intl.formatMessage(
          censusPromptsMessages.binOrderAddLabel,
        )}
        emptyStateMessage={intl.formatMessage(
          censusPromptsMessages.binOrderEmptyState,
        )}
        properties={sortableProperties}
        disabled={!chosen}
        committedRules={item.binSortOrder}
      />
    </>
  );
}

/**
 * The questions a Categorical Bin asks, each with the bins it is answered by.
 *
 * Ported from Architect's `CategoricalBinPrompts`. Two things moved: the
 * attribute's values are edited through the codebook rather than through a
 * `variableOptions` key on the prompt — which the protocol schema has never
 * accepted, and which Architect had to strip on the way out — and the pool of
 * attributes comes from the editing session rather than from a Redux
 * selector, so a collaborator's codebook change reaches an open prompt.
 */
export default function CategoricalBinPromptsSection() {
  const subject = useStageSubject();
  const pickGate = usePromptPickGate({
    picks: PICKS,
    subjectForRow: () => subject,
  });

  return (
    <PromptsSection
      PromptEditor={CategoricalBinPromptEditor}
      PromptPreview={PromptTextPreview}
      editorValidate={pickGate}
      description={censusPromptsMessages.binDescription}
      fieldHint={censusPromptsMessages.categoricalBinFieldHint}
    />
  );
}
