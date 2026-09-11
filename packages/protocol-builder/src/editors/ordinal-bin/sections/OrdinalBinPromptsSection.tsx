import { useCallback, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ColorPickerField from '@codaco/fresco-ui/form/fields/ColorPicker';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

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
import {
  PromptTextField,
  PromptTextPreview,
} from '../../dyad-census/sections/PromptTextField.tsx';
import BinAttributeField, {
  type BinAttributeSlot,
  binAttributePickIssue,
} from './BinAttributeField.tsx';
import { binMessages } from './binMessages.ts';
import BinSortOrders from './BinSortOrders.tsx';
import { FIRST_ORDINAL_COLOR, ordinalColorOptions } from './ordinalColors.ts';

/** Where the prompt keeps the attribute whose ordered values are the bins. */
const SCALE_FIELD = 'variable';
const COLOR_FIELD = 'color';

/** Only an ordinal attribute has the ordered values this interface bins by. */
const SCALE_TYPE = 'ordinal' as const satisfies VariableType;

/** What this interface can draw at once before the bins stop being readable. */
const BIN_LIMIT = 5;

/** What only an Ordinal Bin says; the words both bins use are in `binMessages`. */
const messages = defineMessages({
  guidance: {
    id: 'protocolBuilder.censusPrompts.ordinalBinGuidance',
    defaultMessage:
      'The participant drags each person into one of a row of bins running from least to most, so write a question those bins are the scale of — “how often do you see this person?” rather than a yes or no question.',
    description:
      'Guidance shown above the box where a researcher writes an Ordinal Bin prompt, saying what the participant does with it. The quoted sentence is an example of a question a scale can answer.',
  },
  placeholder: {
    id: 'protocolBuilder.censusPrompts.ordinalBinPlaceholder',
    defaultMessage: 'Enter your prompt...',
    description:
      'Placeholder shown in the empty box where a researcher writes an Ordinal Bin prompt. The trailing dots are an ellipsis written as three full stops.',
  },
  scaleTitle: {
    id: 'protocolBuilder.censusPrompts.scaleTitle',
    defaultMessage: 'Ordinal response',
    description:
      'Heading of the group that picks the attribute whose ordered values the participant answers on — the points running from least to most.',
  },
  scaleDescription: {
    id: 'protocolBuilder.censusPrompts.ordinalBinScaleDescription',
    defaultMessage:
      'Choose the ordinal attribute whose values are shown as bins.',
    description:
      'Description of the group that picks the attribute whose ordered values are the bins the participant drags people into. An attribute is one thing an interview records about a network member.',
  },
  scaleHint: {
    id: 'protocolBuilder.censusPrompts.ordinalBinScaleHint',
    defaultMessage: 'Select an ordinal attribute.',
    description:
      'Guidance under the attribute picker in an Ordinal Bin prompt, saying that the attribute’s own order is the order of the bins.',
  },
  scaleEmpty: {
    id: 'protocolBuilder.censusPrompts.ordinalBinScaleEmpty',
    defaultMessage:
      'This type has no ordinal attributes yet. Create one to say what the scale is.',
    description:
      'Shown in place of the attribute picker’s options when the node type this stage collects has no attribute whose answers run in an order.',
  },
  binLimitDescription: {
    id: 'protocolBuilder.censusPrompts.ordinalBinLimitDescription',
    defaultMessage:
      'This interface is designed for up to five bins. Beyond that the bins become hard to read and hard to drop into, which costs data quality.',
    description:
      'Body of the warning shown when an Ordinal Bin prompt would draw more bins than its interview screen is designed for.',
  },
  colorTitle: {
    id: 'protocolBuilder.censusPrompts.ordinalBinColorTitle',
    defaultMessage: 'Color gradient',
    description:
      'Heading of the group that picks the colour gradient the bins of an Ordinal Bin are shaded along.',
  },
  colorDescription: {
    id: 'protocolBuilder.censusPrompts.ordinalBinColorDescription',
    defaultMessage: 'Choose the gradient used to distinguish ordinal options.',
    description:
      'Description of the group that picks the colour gradient the bins of an Ordinal Bin are shaded along.',
  },
  colorLabel: {
    id: 'protocolBuilder.censusPrompts.ordinalBinColorLabel',
    defaultMessage: 'Color',
    description:
      'Label of the control that picks the colour gradient the bins of an Ordinal Bin are shaded along.',
  },
  colorHint: {
    id: 'protocolBuilder.censusPrompts.ordinalBinColorHint',
    defaultMessage:
      'Interviewer will render each option in your ordinal attribute using a color gradient.',
    description:
      'Guidance under the control that picks the colour gradient the bins of an Ordinal Bin are shaded along.',
  },
  colorRequired: {
    id: 'protocolBuilder.censusPrompts.ordinalBinColorRequired',
    defaultMessage: 'Choose the gradient the bins are shaded along.',
    description:
      'Refusal shown when a researcher saves an Ordinal Bin prompt without a colour gradient for its bins.',
  },
});

const SCALE_SLOT: BinAttributeSlot = Object.freeze({
  name: SCALE_FIELD,
  variableType: SCALE_TYPE,
  // The bins are filled by dragging, which writes the attribute without asking
  // the participant anything a form could check.
  writerClass: 'unvalidated',
  goneRefusal: binMessages.binAttributeGoneRefusal,
});

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function OrdinalBinGuidance() {
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
 * One Ordinal Bin question: what to ask, which attribute's ordered values
 * become the scale, the colours that scale runs through, and the two orders
 * the people are met in.
 */
function OrdinalBinPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  /*
    The entity comes from the schema rather than from the draft: this
    interface's subject is a node subject, so only the TYPE is read from what
    the stage holds. A draft saying `edge` — which a tolerant import can hold —
    would otherwise point the picker and its codebook edits at the edge
    codebook.
  */
  const subject = useStageSubject('node');
  const { variable } = useFormValue([SCALE_FIELD] as const);
  const chosen = typeof variable === 'string' && variable !== '';
  const swatches = useMemo(() => ordinalColorOptions(), []);

  return (
    <>
      <PromptTextField
        item={item}
        guidance={<OrdinalBinGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
        title={intl.formatMessage(censusMessages.promptTextTitle)}
        description={intl.formatMessage(censusMessages.promptTextDescription)}
      />
      <Section
        title={intl.formatMessage(messages.scaleTitle)}
        description={intl.formatMessage(messages.scaleDescription)}
      >
        <BinAttributeField
          slot={SCALE_SLOT}
          subject={subject}
          committed={asString(item[SCALE_FIELD])}
          label={intl.formatMessage(binMessages.attributeLabel)}
          hint={intl.formatMessage(messages.scaleHint)}
          emptyMessage={intl.formatMessage(messages.scaleEmpty)}
          requiredMessage={intl.formatMessage(binMessages.binAttributeRequired)}
          createLabel={intl.formatMessage(binMessages.attributeCreateLabel)}
          optionLimit={BIN_LIMIT}
          optionLimitDescription={intl.formatMessage(
            messages.binLimitDescription,
          )}
        />
      </Section>
      {/*
        The gradient is how the participant reads the scale as a scale, so the
        protocol requires one and there is no unset state to offer.
      */}
      <Section
        title={intl.formatMessage(messages.colorTitle)}
        description={intl.formatMessage(messages.colorDescription)}
      >
        <Field<typeof ColorPickerField>
          name={COLOR_FIELD}
          component={ColorPickerField}
          label={intl.formatMessage(messages.colorLabel)}
          hint={intl.formatMessage(messages.colorHint)}
          options={swatches}
          initialValue={asString(item[COLOR_FIELD])}
          required={intl.formatMessage(messages.colorRequired)}
        />
      </Section>
      <BinSortOrders subject={subject} item={item} disabled={!chosen} />
    </>
  );
}

/**
 * The questions an Ordinal Bin asks, each with the scale it is answered on.
 *
 * The attribute's values are edited through the codebook rather than through a
 * `variableOptions` key on the prompt: the protocol schema has never accepted
 * one, and Architect has to strip its own on the way out.
 */
export default function OrdinalBinPromptsSection() {
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const subject = useStageSubject('node');

  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      const issue = binAttributePickIssue({
        protocolContext,
        excludedStageId: identity.id,
        subject,
        slot: SCALE_SLOT,
        variableId: asString(row[SCALE_FIELD]) ?? '',
        openedOnVariableId: asString(context.openedOn[SCALE_FIELD]) ?? '',
      });
      return issue === undefined
        ? { row }
        : { refused: { fieldErrors: { [SCALE_FIELD]: [issue] } } };
    },
    [identity.id, protocolContext, subject],
  );

  return (
    <PromptsSection
      PromptEditor={OrdinalBinPromptEditor}
      PromptPreview={PromptTextPreview}
      beforeSave={beforeSave}
      /*
        A new prompt arrives already shaded, as Architect's does. The gradient
        is required and there is no unset state to offer, so a researcher who
        never forms an opinion about the colours would otherwise have their
        prompt refused for a choice the interface is happy to make for them.

        Seeded here rather than defaulted in the control, because it is a value
        the saved prompt holds: a control showing a swatch it had not written
        would save a prompt with no colour while saying it had one.
      */
      itemTemplate={() => ({ [COLOR_FIELD]: FIRST_ORDINAL_COLOR })}
    />
  );
}
