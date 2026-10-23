import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';

import {
  PromptTextField,
  PromptTextPreview,
} from '../../../fields/PromptTextField.tsx';
import type {
  RowEditorProps,
  RowSaveOutcome,
  RowValues,
} from '../../../form/rowDialog.tsx';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { censusMessages } from './censusMessages.ts';
import EdgeTypeSection, {
  CREATE_EDGE_FIELD,
  missingEdgeTypeIssue,
} from './EdgeTypeSection.tsx';

/** What only a Dyad Census says; the words it shares are in `censusMessages`. */
const messages = defineMessages({
  guidance: {
    id: 'protocolBuilder.censusPrompts.dyadGuidance',
    defaultMessage:
      'The participant sees two nodes side by side and answers yes or no, so write the question about that pair and phrase it so that yes and no are both sensible answers. To show the two nodes’ labels in the question, insert “First node: label” and “Second node: label” with the syringe button in the toolbar.',
    description:
      'Guidance shown above the box where a researcher writes a Dyad Census prompt, saying what the participant is looking at while they answer it. A node is one entity in the network, which may not be a person. The two quoted names are entries in the menu that the toolbar’s syringe button opens (its tooltip is “Inject piped text from interview metadata or a network attribute”), and must match those entries’ own translations.',
  },
  placeholder: {
    id: 'protocolBuilder.censusPrompts.dyadPlaceholder',
    defaultMessage: 'Enter text for the prompt here...',
    description:
      'Placeholder shown in the empty box where a researcher writes a Dyad Census prompt. The trailing dots are an ellipsis written as three full stops.',
  },
  promptTextDescription: {
    id: 'protocolBuilder.censusPrompts.dyadPromptTextDescription',
    defaultMessage:
      'Write the participant prompt and select the edge type created by an affirmative response.',
    description:
      'Said under the title of a Dyad Census prompt’s own dialog, which holds its question and the kind of connection an affirmative answer records.',
  },
});

/**
 * What the participant is looking at while they answer, said BEFORE the
 * researcher writes the question rather than after it: it decides how the
 * question has to be phrased.
 */
function DyadCensusGuidance() {
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
 * One Dyad Census question: what to ask about a pair, and what an affirmative
 * answer creates between them.
 */
function DyadCensusPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();

  // The question and the connection a yes records are one topic, which is the
  // dialog's own: it is titled for the prompt and described by
  // `rowDescription` below, so neither a group around the pair nor a heading
  // over the connection control says anything the title has not.
  return (
    <PromptTextField
      item={item}
      guidance={<DyadCensusGuidance />}
      placeholder={intl.formatMessage(messages.placeholder)}
    >
      <EdgeTypeSection
        label={intl.formatMessage(censusMessages.edgeLabel)}
        requiredMessage={intl.formatMessage(censusMessages.affirmativeRequired)}
      />
    </PromptTextField>
  );
}

/**
 * The questions a Dyad Census asks about every pair of people.
 *
 * The list itself — its identity, its ordering, its rule that a stage must ask
 * something — is the shared prompts section. Only what one prompt SAYS is
 * here, and for this interface that is two things: the question, and the
 * connection a yes records.
 */
export default function DyadCensusPromptsSection() {
  const codebook = useProtocolContext().codebook;

  /**
   * The one refusal a Dyad Census prompt can earn that no control can raise
   * for itself: see `missingEdgeTypeIssue`.
   */
  const beforeSave = useCallback(
    (row: RowValues): RowSaveOutcome => {
      const issue = missingEdgeTypeIssue(
        codebook.edge ?? {},
        row[CREATE_EDGE_FIELD],
      );
      return issue === undefined
        ? { row }
        : { refused: { fieldErrors: { [CREATE_EDGE_FIELD]: [issue] } } };
    },
    [codebook],
  );

  return (
    <PromptsSection
      PromptEditor={DyadCensusPromptEditor}
      PromptPreview={PromptTextPreview}
      rowDescription={messages.promptTextDescription}
      beforeSave={beforeSave}
    />
  );
}
