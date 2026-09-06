import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import type { CrossClassPick } from '../../codebook/variableValidation.ts';
import { OrdinalColorControl } from '../../fields/OrdinalColorField.tsx';
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

/** Only an ordinal attribute has the ordered values this interface bins by. */
const BIN_TYPES: readonly VariableType[] = Object.freeze(['ordinal']);

/**
 * The bins are filled by dragging, which writes the attribute without asking
 * the participant anything a form could validate.
 */
const PICKS: readonly CrossClassPick[] = Object.freeze([
  { path: 'variable', writerClass: 'unvalidated' },
]);

/** What this interface can show at once before the bins stop being readable. */
const BIN_LIMIT = 5;

/**
 * What only this family says. Everything a bin shares with the categorical
 * bin, or with the censuses, is declared once in `censusPromptsMessages.ts`.
 */
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
    defaultMessage: 'How often do you have contact with this person?',
    description:
      'Example question in the empty box where a researcher writes an Ordinal Bin prompt.',
  },
  scaleDescription: {
    id: 'protocolBuilder.censusPrompts.ordinalBinScaleDescription',
    defaultMessage:
      'Choose the attribute whose ordered values the participant sorts people into.',
    description:
      'Description of the group that picks the attribute whose ordered values are the bins the participant drags people into. An attribute is one thing an interview records about a network member.',
  },
  scaleHint: {
    id: 'protocolBuilder.censusPrompts.ordinalBinScaleHint',
    defaultMessage:
      "Each of this attribute's values becomes a bin, in the order the attribute lists them.",
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
    defaultMessage: 'Color of the scale',
    description:
      'Heading of the group that picks the colour gradient the bins of an Ordinal Bin are shaded along.',
  },
  colorDescription: {
    id: 'protocolBuilder.censusPrompts.ordinalBinColorDescription',
    defaultMessage:
      'Choose the gradient the bins run through, from the first value to the last.',
    description:
      'Description of the group that picks the colour gradient the bins of an Ordinal Bin are shaded along.',
  },
  colorLabel: {
    id: 'protocolBuilder.censusPrompts.ordinalBinColorLabel',
    defaultMessage: 'Color gradient',
    description:
      'Label of the control that picks the colour gradient the bins of an Ordinal Bin are shaded along.',
  },
  colorHint: {
    id: 'protocolBuilder.censusPrompts.ordinalBinColorHint',
    defaultMessage:
      'The bins are shaded along this gradient in the order the attribute lists its values.',
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
 * One Ordinal Bin question: what to ask, which attribute's values become the
 * scale, and the colours that scale runs through.
 */
function OrdinalBinPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useStageSubject();
  const sortableProperties = useSortVariablePool(subject);
  const { variable } = useFormValue(['variable'] as const);
  const chosen = typeof variable === 'string' && variable !== '';
  const committed = typeof item.variable === 'string' ? item.variable : '';

  return (
    <>
      <PromptTextField
        guidance={<OrdinalBinGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
      />
      <PromptAttributeField
        name="variable"
        title={intl.formatMessage(censusPromptsMessages.scaleTitle)}
        description={intl.formatMessage(messages.scaleDescription)}
        label={intl.formatMessage(censusPromptsMessages.attributeLabel)}
        hint={intl.formatMessage(messages.scaleHint)}
        requiredMessage={intl.formatMessage(
          censusPromptsMessages.binAttributeRequired,
        )}
        subject={subject}
        types={BIN_TYPES}
        createType="ordinal"
        writerClass="unvalidated"
        createLabel={intl.formatMessage(
          censusPromptsMessages.attributeCreateLabel,
        )}
        editLabel={intl.formatMessage(censusPromptsMessages.attributeEditLabel)}
        emptyMessage={intl.formatMessage(messages.scaleEmpty)}
        {...(committed === '' ? {} : { committedValue: committed })}
        optionLimit={BIN_LIMIT}
        optionLimitTitle={intl.formatMessage(
          censusPromptsMessages.binLimitTitle,
        )}
        optionLimitDescription={intl.formatMessage(
          messages.binLimitDescription,
        )}
      />
      {/*
        The gradient is how the participant reads the scale as a scale, so the
        protocol requires one and there is no unset state to offer.
      */}
      <Section
        title={intl.formatMessage(messages.colorTitle)}
        description={intl.formatMessage(messages.colorDescription)}
      >
        <DialogFormField<typeof OrdinalColorControl>
          name="color"
          label={intl.formatMessage(messages.colorLabel)}
          hint={intl.formatMessage(messages.colorHint)}
          component={OrdinalColorControl}
          required={intl.formatMessage(messages.colorRequired)}
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
 * The questions an Ordinal Bin asks, each with the scale it is answered on.
 *
 * Ported from Architect's `OrdinalBinPrompts`, with the same two moves as the
 * categorical bin: the attribute's values are edited through the codebook
 * rather than through a `variableOptions` key the schema never accepted, and
 * the pool of attributes comes from the editing session rather than a Redux
 * selector.
 */
export default function OrdinalBinPromptsSection() {
  const subject = useStageSubject();
  const pickGate = usePromptPickGate({
    picks: PICKS,
    subjectForRow: () => subject,
  });

  return (
    <PromptsSection
      PromptEditor={OrdinalBinPromptEditor}
      PromptPreview={PromptTextPreview}
      editorValidate={pickGate}
      /*
        A new prompt arrives already shaded, as Architect's does
        (`OrdinalBinPrompts/OrdinalBinPrompts.tsx`:
        `const template = () => ({ color: 'ord-color-seq-1' })`).

        The gradient is required and there is no unset state to offer, so a
        researcher who never forms an opinion about the colours would otherwise
        have their prompt refused for a choice the interface is happy to make
        for them. The first swatch of the schema's own sequence is the choice,
        and it is only a starting point: the control is right there, and
        changing it is one click.

        Seeded here rather than defaulted in the control, because it is a value
        the saved prompt holds. A control that showed a swatch it had not
        written would save a prompt with no colour while telling the researcher
        it had one.
      */
      itemTemplate={() => ({ color: 'ord-color-seq-1' })}
      description={censusPromptsMessages.binDescription}
      fieldHint={censusPromptsMessages.ordinalBinFieldHint}
    />
  );
}
