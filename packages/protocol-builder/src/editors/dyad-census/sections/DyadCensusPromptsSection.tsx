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
import EdgeTypeSection, {
  CREATE_EDGE_FIELD,
  missingEdgeTypeIssue,
} from './EdgeTypeSection.tsx';
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
    defaultMessage: 'Do these two people know each other?',
    description:
      'Example question in the empty box where a researcher writes a Dyad Census prompt.',
  },
  edgeDescription: {
    id: 'protocolBuilder.censusPrompts.dyadEdgeDescription',
    defaultMessage:
      'Choose the kind of connection an affirmative answer records between the pair.',
    description:
      'Description of the group that says what a yes from the participant records between the two people a Dyad Census prompt asked about.',
  },
  edgeHint: {
    id: 'protocolBuilder.censusPrompts.dyadEdgeHint',
    defaultMessage:
      'A connection of this type is created between the two people whenever the participant answers yes.',
    description:
      'Guidance under the control that picks what a yes from the participant records between the two people a Dyad Census prompt asked about.',
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
      <PromptTextField
        item={item}
        guidance={<DyadCensusGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
      />
      <EdgeTypeSection
        title={intl.formatMessage(censusMessages.affirmativeTitle)}
        description={intl.formatMessage(messages.edgeDescription)}
        hint={intl.formatMessage(messages.edgeHint)}
        requiredMessage={intl.formatMessage(censusMessages.affirmativeRequired)}
      />
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
      description={censusMessages.pairDescription}
      fieldHint={censusMessages.pairFieldHint}
    />
  );
}
