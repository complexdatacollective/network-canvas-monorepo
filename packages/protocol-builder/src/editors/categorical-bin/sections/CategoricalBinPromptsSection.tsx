import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import BinAttributeField, {
  type BinAttributeSlot,
  binAttributePickIssue,
} from '../../../fields/BinAttributeField.tsx';
import {
  PromptTextField,
  PromptTextPreview,
} from '../../../fields/PromptTextField.tsx';
import RichTextField from '../../../fields/RichTextField.tsx';
import type {
  RowEditorProps,
  RowSaveContext,
  RowSaveOutcome,
  RowValues,
} from '../../../form/rowDialog.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import { useStageSubject } from '../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { censusMessages } from '../../dyad-census/sections/censusMessages.ts';
import { binMessages } from '../../ordinal-bin/sections/binMessages.ts';
import BinSortOrders from '../../ordinal-bin/sections/BinSortOrders.tsx';

/** Where the prompt keeps the attribute whose values are the bins. */
const BINS_FIELD = 'variable';
/** And the three fields the bin for everything else is made of. */
const OTHER_FIELD = 'otherVariable';
const OTHER_LABEL_FIELD = 'otherOptionLabel';
const OTHER_PROMPT_FIELD = 'otherVariablePrompt';

/** Only a categorical attribute has the named values this interface bins by. */
const BINS_TYPE = 'categorical' as const satisfies VariableType;

/** The follow-up answer is typed by the participant, so it is stored as text. */
const FOLLOW_UP_TYPE = 'text' as const satisfies VariableType;

/** What this interface can draw at once before the bins stop being readable. */
const BIN_LIMIT = 8;

/** What only a Categorical Bin says; the words both bins use are in `binMessages`. */
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
    defaultMessage: 'Enter your prompt...',
    description:
      'Placeholder shown in the empty box where a researcher writes a Categorical Bin prompt. The trailing dots are an ellipsis written as three full stops.',
  },
  binsTitle: {
    id: 'protocolBuilder.censusPrompts.categoricalBinBinsTitle',
    defaultMessage: 'Categorical response',
    description:
      'Heading of the group that picks the attribute whose values are the bins the participant drags people into.',
  },
  binsDescription: {
    id: 'protocolBuilder.censusPrompts.categoricalBinBinsDescription',
    defaultMessage:
      'Choose the categorical attribute and configure the option values shown as bins.',
    description:
      'Description of the group that picks the attribute whose values are the bins the participant drags people into. An attribute is one thing an interview records about a network member.',
  },
  binsHint: {
    id: 'protocolBuilder.censusPrompts.categoricalBinBinsHint',
    defaultMessage: 'Select a categorical attribute.',
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
    defaultMessage: 'Follow-up other option',
    description:
      'Heading of the optional group that adds one more bin for people none of the attribute’s values describe.',
  },
  otherDescription: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherDescription',
    defaultMessage:
      'Collect a participant-entered value when a node is placed in an other bin.',
    description:
      'Description of the optional group that adds one more bin for people none of the attribute’s values describe.',
  },
  otherAttributeLabel: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeLabel',
    defaultMessage: 'Other attribute',
    description:
      'Label of the control that picks which attribute holds what the participant types into the follow-up bin.',
  },
  otherAttributeHint: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeHint',
    defaultMessage:
      "Select a text attribute to store the value entered by the participant when they drop a node in the 'other' option.",
    description:
      'Guidance under the control that picks which attribute holds what the participant types into the follow-up bin, saying why only text attributes are offered.',
  },
  otherAttributeRequired: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeRequired',
    defaultMessage: "Choose the attribute this bin's answers are stored in.",
    description:
      'Refusal shown when a researcher switches the follow-up bin on and saves the prompt without saying where its answers are stored.',
  },
  otherAttributeGoneRefusal: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeGoneRefusal',
    defaultMessage:
      "The attribute this bin's answers are stored in is no longer available on this type. Choose another one.",
    description:
      'Refusal shown on the follow-up bin’s attribute picker when a researcher saves a Categorical Bin prompt whose attribute has been deleted from the protocol’s codebook or changed to a kind of answer the participant cannot type.',
  },
  otherAttributeCreateLabel: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherAttributeCreateLabel',
    defaultMessage: 'Create a new text attribute',
    description:
      'Button that opens the codebook editor for inventing the text attribute the follow-up bin stores its answers in. Also the title of the dialog it opens.',
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
    defaultMessage: 'Other bin label',
    description:
      'Label of the box a researcher writes the follow-up bin’s own name into — the words drawn on that bin in the interview.',
  },
  otherBinHint: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherBinHint',
    defaultMessage:
      "Enter a label for the 'other' bin that will be shown to participants. This label should indicate that the participant can drop a node in this bin to provide a value not listed above.",
    description:
      'Guidance under the box a researcher writes the follow-up bin’s own name into.',
  },
  otherBinPlaceholder: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherBinPlaceholder',
    defaultMessage: 'Enter a label (such as "other") for this bin...',
    description:
      'Placeholder shown in the empty box where a researcher names the follow-up bin. The trailing dots are an ellipsis written as three full stops.',
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
    defaultMessage:
      'Enter a question prompt to show when the other option is triggered.',
    description:
      'Guidance under the box a researcher writes the follow-up bin’s own question into, saying when the participant reads it.',
  },
  otherPromptPlaceholder: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherPromptPlaceholder',
    defaultMessage:
      'Enter a question prompt to show when the other option is triggered...',
    description:
      'Placeholder shown in the empty box where a researcher writes the follow-up bin’s own question. The trailing dots are an ellipsis written as three full stops.',
  },
  otherPromptRequired: {
    id: 'protocolBuilder.censusPrompts.categoricalBinOtherPromptRequired',
    defaultMessage: 'Write the question this bin asks.',
    description:
      'Refusal shown when a researcher switches the follow-up bin on and saves the prompt without writing the question it asks.',
  },
});

const BINS_SLOT: BinAttributeSlot = Object.freeze({
  name: BINS_FIELD,
  variableType: BINS_TYPE,
  // The bins are filled by dragging, which writes the attribute without asking
  // the participant anything a form could check.
  writerClass: 'unvalidated',
  goneRefusal: binMessages.binAttributeGoneRefusal,
});

const OTHER_SLOT: BinAttributeSlot = Object.freeze({
  name: OTHER_FIELD,
  variableType: FOLLOW_UP_TYPE,
  // The opposite class, and the reason this prompt makes two picks that
  // exclude different attributes: the follow-up is typed into an input that
  // honours the attribute's own codebook rules.
  writerClass: 'validated',
  goneRefusal: messages.otherAttributeGoneRefusal,
});

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

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
 * the bins, what happens to an answer none of them covers, and the two orders
 * the people are met in.
 */
function CategoricalBinPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  /*
    The entity comes from the schema rather than from the draft: this
    interface's subject is a node subject, so only the TYPE is read from what
    the stage holds. A draft saying `edge` — which a tolerant import can hold —
    would otherwise point the pickers and their codebook edits at the edge
    codebook.
  */
  const subject = useStageSubject('node');
  const { variable, otherVariable } = useFormValue([
    BINS_FIELD,
    OTHER_FIELD,
  ] as const);
  const chosen = typeof variable === 'string' && variable !== '';
  const committedOther = asString(item[OTHER_FIELD]);
  // Read live rather than from the row: switching the follow-up bin on adds a
  // bin to the screen the researcher is looking at, so the warning about how
  // many bins fit has to answer for it before the prompt is saved.
  const followUpBins =
    typeof otherVariable === 'string' && otherVariable !== '' ? 1 : 0;

  return (
    <>
      <PromptTextField
        item={item}
        guidance={<CategoricalBinGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
        title={intl.formatMessage(censusMessages.promptTextTitle)}
        description={intl.formatMessage(censusMessages.promptTextDescription)}
      />
      <Section
        title={intl.formatMessage(messages.binsTitle)}
        description={intl.formatMessage(messages.binsDescription)}
      >
        <BinAttributeField
          slot={BINS_SLOT}
          subject={subject}
          committed={asString(item[BINS_FIELD])}
          label={intl.formatMessage(binMessages.attributeLabel)}
          hint={intl.formatMessage(messages.binsHint)}
          emptyMessage={intl.formatMessage(messages.binsEmpty)}
          requiredMessage={intl.formatMessage(binMessages.binAttributeRequired)}
          createLabel={intl.formatMessage(binMessages.attributeCreateLabel)}
          optionLimit={BIN_LIMIT}
          optionLimitDescription={intl.formatMessage(
            messages.binLimitDescription,
          )}
          extraBins={followUpBins}
        />
      </Section>
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
        defaultOpen={committedOther !== undefined}
      >
        {/*
          This bin is the one place in the interface where the participant
          TYPES an answer, so the attribute's own rules are all that stand
          between them and an answer the study cannot use. Architect mounts a
          validation section here for the same reason.
        */}
        <BinAttributeField
          slot={OTHER_SLOT}
          subject={subject}
          committed={committedOther}
          label={intl.formatMessage(messages.otherAttributeLabel)}
          hint={intl.formatMessage(messages.otherAttributeHint)}
          emptyMessage={intl.formatMessage(messages.otherAttributeEmpty)}
          requiredMessage={intl.formatMessage(messages.otherAttributeRequired)}
          createLabel={intl.formatMessage(messages.otherAttributeCreateLabel)}
        />
        <Field<typeof RichTextField>
          name={OTHER_LABEL_FIELD}
          component={RichTextField}
          label={intl.formatMessage(messages.otherBinLabel)}
          hint={intl.formatMessage(messages.otherBinHint)}
          placeholder={intl.formatMessage(messages.otherBinPlaceholder)}
          singleLine
          initialValue={asString(item[OTHER_LABEL_FIELD])}
          required={intl.formatMessage(messages.otherBinRequired)}
        />
        <Field<typeof RichTextField>
          name={OTHER_PROMPT_FIELD}
          component={RichTextField}
          label={intl.formatMessage(messages.otherPromptLabel)}
          hint={intl.formatMessage(messages.otherPromptHint)}
          placeholder={intl.formatMessage(messages.otherPromptPlaceholder)}
          singleLine
          initialValue={asString(item[OTHER_PROMPT_FIELD])}
          required={intl.formatMessage(messages.otherPromptRequired)}
        />
      </Section>
      <BinSortOrders subject={subject} item={item} disabled={!chosen} />
    </>
  );
}

/**
 * The questions a Categorical Bin asks, each with the bins it is answered by.
 *
 * The attribute's values are edited through the codebook rather than through a
 * `variableOptions` key on the prompt: the protocol schema has never accepted
 * one, and Architect has to strip its own on the way out.
 */
export default function CategoricalBinPromptsSection() {
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const subject = useStageSubject('node');

  /**
   * The two refusals a Categorical Bin prompt can earn that no control can
   * raise for itself.
   *
   * The bins are asked about first: with no attribute behind them the
   * follow-up is a bin added to a set that does not exist, and a second
   * sentence about where its answers are stored would say nothing the
   * researcher can act on yet.
   */
  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      for (const slot of [BINS_SLOT, OTHER_SLOT]) {
        const issue = binAttributePickIssue({
          protocolContext,
          excludedStageId: identity.id,
          subject,
          slot,
          variableId: asString(row[slot.name]) ?? '',
          openedOnVariableId: asString(context.openedOn[slot.name]) ?? '',
        });
        if (issue !== undefined) {
          return { refused: { fieldErrors: { [slot.name]: [issue] } } };
        }
      }
      return { row };
    },
    [identity.id, protocolContext, subject],
  );

  return (
    <PromptsSection
      PromptEditor={CategoricalBinPromptEditor}
      PromptPreview={PromptTextPreview}
      beforeSave={beforeSave}
    />
  );
}
