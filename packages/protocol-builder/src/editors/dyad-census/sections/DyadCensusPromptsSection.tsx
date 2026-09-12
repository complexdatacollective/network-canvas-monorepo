import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';

import type {
  RowEditorProps,
  RowSaveOutcome,
  RowValues,
} from '../../../form/rowDialog.tsx';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { censusMessages } from './censusMessages.ts';
import CreateEdgeField, {
  CREATE_EDGE_FIELD,
  missingEdgeTypeIssue,
} from './CreateEdgeField.tsx';
import { PromptTextField, PromptTextPreview } from './PromptTextField.tsx';

/** What only a Dyad Census says; the words it shares are in `censusMessages`. */
const messages = defineMessages({
  guidance: {
    id: 'protocolBuilder.censusPrompts.dyadGuidance',
    defaultMessage:
      'The participant sees two people side by side and answers yes or no, so write the question about the pair in front of them — “these two people” rather than a name — and phrase it so that yes and no are both sensible answers.',
    description:
      'Guidance shown above the box where a researcher writes a Dyad Census prompt, saying what the participant is looking at while they answer it. The quoted phrase is an example of how to refer to the pair.',
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
      'Description of the group holding a Dyad Census prompt’s question and the kind of connection an affirmative answer records.',
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

  return (
    <>
      {/*
        The connection type sits INSIDE the prompt group, as Architect's does:
        the group's own description is what says an affirmative answer creates
        one, so a second heading over the control would say it twice.
      */}
      <PromptTextField
        item={item}
        guidance={<DyadCensusGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
        title={intl.formatMessage(censusMessages.promptConfigurationTitle)}
        description={intl.formatMessage(messages.promptTextDescription)}
      >
        <CreateEdgeField
          label={intl.formatMessage(censusMessages.edgeLabel)}
          requiredMessage={intl.formatMessage(
            censusMessages.affirmativeRequired,
          )}
        />
      </PromptTextField>
    </>
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
      beforeSave={beforeSave}
    />
  );
}
